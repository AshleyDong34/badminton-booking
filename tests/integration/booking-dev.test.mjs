import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { saveManualMember } from "../../lib/manual-member.ts";
import { reviewNoIdMembers } from "../../lib/membership-roster.ts";

const devRef = "vexdivrcjscxrtnxwohk";
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || new URL(url).hostname !== `${devRef}.supabase.co` || !key) {
  throw new Error("Integration tests require the known development Supabase URL and its service key. Production is refused.");
}
const db = createClient(url, key, { auth: { persistSession: false } });
const run = randomUUID().slice(0, 8);
const email = (label) => `test-${run}-${label}@example.invalid`;
const id = `s9${String(Math.floor(Math.random() * 1000000)).padStart(6, "0")}`;
const created = { sessions: [], members: [], emails: [] };
const starts = ["2027-03-10T18:00:00Z", "2027-03-10T19:00:00Z", "2027-03-11T18:00:00Z", "2027-03-12T18:00:00Z", "2027-03-13T18:00:00Z"];

function good(result) {
  assert.equal(result.error, null, result.error?.message);
  return result.data;
}
async function book(sessionId, name, studentId, address) {
  const result = await db.rpc("insert_signup_guarded", {
    p_session_id: sessionId, p_name: name, p_student_id: studentId, p_email: address,
  });
  if (!result.error) created.emails.push(address);
  return result;
}
async function credits(address, studentId, sessionId) {
  return good(await db.rpc("get_booking_credits", {
    p_email: address, p_student_id: studentId, p_session_id: sessionId,
  }))[0];
}
async function cancel(result) {
  assert.equal(good(await db.rpc("cancel_signup_by_token", { p_token: result.data[0].r_cancel_token })), true);
}

test("development DB: roster identity, taster, same-day, weekly credits, cancellation", async () => {
  let originalSameDaySetting = null;
  try {
    const { data: settings } = await db.from("settings").select("weekly_quota,allow_same_day_multi").eq("id", 1).single();
    assert.equal(settings.weekly_quota, 2, "test assumes the dev default quota of two");
    originalSameDaySetting = settings.allow_same_day_multi;
    if (originalSameDaySetting) good(await db.from("settings").update({ allow_same_day_multi: false }).eq("id", 1).select("id").single());
    for (const [index, starts_at] of starts.entries()) {
      const session = good(await db.from("sessions").insert({
        name: `TEST ${run} ${index}`, capacity: index === 4 ? 0 : 12, starts_at, ends_at: new Date(Date.parse(starts_at) + 3600000).toISOString(), allow_name_only: false,
      }).select("id").single());
      created.sessions.push(session.id);
    }
    const [a, sameDay, b, c, waitSession] = created.sessions;

    // A first-time visitor is identified by either supplied student ID or email.
    const tasterEmail = email("taster");
    const taster = await book(a, `TEST ${run} Taster`, id, tasterEmail);
    good(taster);
    assert.match((await book(b, "Repeat", id, email("new-address"))).error?.message ?? "", /membership required/);
    assert.match((await book(b, "Repeat", `s8${id.slice(2)}`, tasterEmail)).error?.message ?? "", /membership required/);
    assert.equal((await credits(tasterEmail, id, a)).remaining_credits, 1);
    await cancel(taster);
    assert.equal((await credits(tasterEmail, id, a)).remaining_credits, 2);
    good(await book(a, "Taster again", id, tasterEmail));

    // Adding paid membership later does not remove or invalidate an existing signup.
    const memberAddress = email("new-member-address");
    assert.equal((await saveManualMember(db, { name: `TEST ${run} Taster`, studentId: id, email: memberAddress })).status, 200);
    const member = good(await db.from("student_whitelist").select("id").eq("student_id", id).single());
    created.members.push(member.id);
    assert.equal(good(await db.from("signups").select("id").eq("email", tasterEmail)).length, 1);
    const tasterSignup = good(await db.from("signups").select("created_at").eq("email", tasterEmail).single());
    assert.equal(good(await db.from("first_time_signups").select("id").eq("email", tasterEmail).eq("created_at", tasterSignup.created_at)).length, 1);
    assert.match((await book(sameDay, "Member", id, memberAddress)).error?.message ?? "", /same-day booking/);
    good(await book(c, "Member", id, memberAddress));
    assert.equal((await credits(memberAddress, id, c)).remaining_credits, 0);
    assert.match((await book(a, "Member", id, memberAddress)).error?.message ?? "", /weekly limit/);

    // A person without an ID may taster by email; cancelling restores it.
    const noIdTasterEmail = email("no-id-taster");
    const noIdTaster = await book(a, "Email taster", null, noIdTasterEmail);
    good(noIdTaster);
    assert.match((await book(b, "Repeat email taster", null, noIdTasterEmail)).error?.message ?? "", /membership required/);
    await cancel(noIdTaster);
    good(await book(b, "Email taster again", null, noIdTasterEmail));
    assert.equal((await saveManualMember(db, { name: `TEST ${run} Email Taster`, email: noIdTasterEmail })).status, 200);
    created.members.push(good(await db.from("student_whitelist").select("id").eq("email", noIdTasterEmail).single()).id);
    assert.equal(good(await db.from("signups").select("id").eq("email", noIdTasterEmail)).length, 1);
    good(await book(c, "Email taster now member", null, noIdTasterEmail));
    assert.equal((await credits(noIdTasterEmail, null, c)).remaining_credits, 0);

    const attendedEmail = email("attended-taster");
    const attended = await book(c, "Attended taster", null, attendedEmail);
    good(attended);
    good(await db.from("signups").update({ attended: true }).eq("cancel_token", attended.data[0].r_cancel_token).select("id").single());
    await cancel(attended);
    assert.match((await book(b, "Second attended taster", null, attendedEmail)).error?.message ?? "", /membership required/);

    // Manual name-only record can receive an email later and become bookable as a member.
    const noIdName = `TEST ${run} No ID`;
    assert.deepEqual((await saveManualMember(db, { name: noIdName })).body, { ok: true, action: "added" });
    const noIdRow = good(await db.from("student_whitelist").select("id,name,email").eq("name", noIdName).single());
    created.members.push(noIdRow.id);
    assert.equal(reviewNoIdMembers([{ name: noIdName, email: null }], [noIdRow.name])[0].status, "listed");
    const noIdEmail = email("no-id-member");
    assert.deepEqual((await saveManualMember(db, { name: noIdName, email: noIdEmail })).body, { ok: true, action: "updated" });
    assert.equal(good(await db.from("student_whitelist").select("email").eq("id", noIdRow.id).single()).email, noIdEmail);
    assert.match((await book(waitSession, "Wrong identity", id, noIdEmail)).error?.message ?? "", /member identity mismatch/);
    const first = await book(a, noIdName, null, noIdEmail);
    good(first);
    assert.match((await book(a, noIdName, null, noIdEmail)).error?.message ?? "", /duplicate|unique/i);
    assert.match((await book(sameDay, noIdName, null, noIdEmail)).error?.message ?? "", /same-day booking/);
    good(await book(b, noIdName, null, noIdEmail));
    assert.equal((await credits(noIdEmail, null, b)).remaining_credits, 0);
    assert.match((await book(c, noIdName, null, noIdEmail)).error?.message ?? "", /weekly limit/);
    await cancel(first);
    assert.equal((await credits(noIdEmail, null, b)).remaining_credits, 1);
    good(await book(c, noIdName, null, noIdEmail));

    const waitEmail = email("waitlist-member");
    assert.equal((await saveManualMember(db, { name: `TEST ${run} Waitlist`, email: waitEmail })).status, 200);
    created.members.push(good(await db.from("student_whitelist").select("id").eq("email", waitEmail).single()).id);
    const waitlistBooking = await book(waitSession, "Waitlist member", null, waitEmail);
    assert.equal(good(waitlistBooking)[0].r_status, "waiting_list");
    assert.equal((await credits(waitEmail, null, waitSession)).remaining_credits, 2);
    good(await db.from("signups").update({ status: "signed_up" }).eq("cancel_token", waitlistBooking.data[0].r_cancel_token).select("id").single());
    assert.equal((await credits(waitEmail, null, waitSession)).remaining_credits, 1);

    const sharedName = `TEST ${run} Shared Name`;
    const sharedA = email("shared-a");
    const sharedB = email("shared-b");
    assert.equal((await saveManualMember(db, { name: sharedName, email: sharedA })).status, 200);
    created.members.push(good(await db.from("student_whitelist").select("id").eq("email", sharedA).single()).id);
    assert.equal((await saveManualMember(db, { name: sharedName, email: sharedB, createSeparate: true })).status, 200);
    created.members.push(good(await db.from("student_whitelist").select("id").eq("email", sharedB).single()).id);
    assert.equal((await saveManualMember(db, { name: sharedName, email: email("shared-c") })).status, 409);
  } finally {
    // Only exact synthetic records created by this run are removed.
    const addresses = [...new Set(created.emails)];
    if (addresses.length) {
      good(await db.from("signups").delete().in("email", addresses));
      good(await db.from("first_time_signups").delete().in("email", addresses));
    }
    if (created.members.length) good(await db.from("student_whitelist").delete().in("id", created.members));
    if (created.sessions.length) good(await db.from("sessions").delete().in("id", created.sessions));
    if (originalSameDaySetting !== null) {
      good(await db.from("settings").update({ allow_same_day_multi: originalSameDaySetting }).eq("id", 1));
      const restored = good(await db.from("settings").select("allow_same_day_multi").eq("id", 1).single());
      assert.equal(restored.allow_same_day_multi, originalSameDaySetting);
    }
    if (created.sessions.length) assert.equal(good(await db.from("sessions").select("id").in("id", created.sessions)).length, 0);
    if (created.members.length) assert.equal(good(await db.from("student_whitelist").select("id").in("id", created.members)).length, 0);
  }
});

test("Monday reset uses UK local midnight, including daylight-saving transitions", async () => {
  const before = good(await db.rpc("booking_week_bounds", { p_at: "2026-10-25T23:59:59Z" }))[0];
  const after = good(await db.rpc("booking_week_bounds", { p_at: "2026-10-26T00:00:00Z" }))[0];
  assert.equal(new Date(before.week_start).toISOString(), "2026-10-18T23:00:00.000Z");
  assert.equal(new Date(before.week_end).toISOString(), "2026-10-26T00:00:00.000Z");
  assert.equal(new Date(after.week_start).toISOString(), "2026-10-26T00:00:00.000Z");
  const summer = good(await db.rpc("booking_week_bounds", { p_at: "2027-07-04T23:30:00Z" }))[0];
  assert.equal(new Date(summer.week_start).toISOString(), "2027-07-04T23:00:00.000Z");
});

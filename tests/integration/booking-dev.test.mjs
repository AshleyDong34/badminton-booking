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
    const firstTaster = good(await db.from("signups").select("is_taster,name").eq("email", tasterEmail).single());
    assert.equal(firstTaster.is_taster, true);
    assert.equal(good(await db.from("first_time_signups").select("name").eq("email", tasterEmail).single()).name, firstTaster.name);
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
    assert.equal(good(await db.from("signups").select("is_taster").eq("email", tasterEmail).single()).is_taster, true);
    const tasterSignup = good(await db.from("signups").select("created_at").eq("email", tasterEmail).single());
    assert.equal(good(await db.from("first_time_signups").select("id").eq("email", tasterEmail).eq("created_at", tasterSignup.created_at)).length, 1);
    assert.match((await book(sameDay, "Member", id, memberAddress)).error?.message ?? "", /same-day booking/);
    good(await book(c, "Member", id, memberAddress));
    assert.equal(good(await db.from("signups").select("is_taster").eq("email", memberAddress).single()).is_taster, false);
    assert.equal((await credits(memberAddress, id, c)).remaining_credits, 0);
    assert.match((await book(a, "Member", id, memberAddress)).error?.message ?? "", /weekly limit/);

    // A person without an ID may taster by email; cancelling restores it.
    const noIdTasterEmail = email("no-id-taster");
    const noIdTaster = await book(a, "Email taster", null, noIdTasterEmail);
    good(noIdTaster);
    assert.equal(good(await db.from("signups").select("is_taster").eq("email", noIdTasterEmail).single()).is_taster, true);
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

    // Re-importing an ID row updates the same member rather than adding a duplicate.
    const importId = `s7${id.slice(2)}`;
    const importEmail = email("imported");
    const importRow = { name: `TEST ${run} Imported`, student_id: importId, email: importEmail };
    assert.equal(good(await db.rpc("upsert_membership_roster", { p_members: [importRow] })), 1);
    const imported = good(await db.from("student_whitelist").select("id,name").eq("student_id", importId).single());
    created.members.push(imported.id);
    assert.equal(good(await db.rpc("upsert_membership_roster", { p_members: [{ ...importRow, name: `${importRow.name} updated` }] })), 1);
    const importedAgain = good(await db.from("student_whitelist").select("id,name").eq("student_id", importId));
    assert.equal(importedAgain.length, 1);
    assert.equal(importedAgain[0].id, imported.id);
    assert.equal(importedAgain[0].name, `${importRow.name} updated`);
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

test("development DB: cancelling or moving after session start keeps spent booking-week credits", async () => {
  const address = email("spent-credit");
  const studentId = `s6${id.slice(2)}`;
  const sessionIds = [];
  let memberId = null;
  try {
    assert.equal((await saveManualMember(db, { name: `TEST ${run} Spent`, studentId, email: address })).status, 200);
    memberId = good(await db.from("student_whitelist").select("id").eq("student_id", studentId).single()).id;
    const now = Date.now();
    for (const offset of [-120000, -60000, 3600000]) {
      const row = good(await db.from("sessions").insert({
        name: `TEST ${run} credit ${offset}`,
        capacity: 2,
        starts_at: new Date(now + offset).toISOString(),
        ends_at: new Date(now + offset + 7200000).toISOString(),
        allow_name_only: false,
      }).select("id").single());
      sessionIds.push(row.id);
    }
    let bookedAt = null;
    for (const [index, sessionId] of sessionIds.slice(0, 2).entries()) {
      const result = good(await db.rpc("insert_signup_guarded", {
        p_session_id: sessionId, p_name: `TEST ${run} Spent`, p_student_id: studentId, p_email: address,
      }))[0];
      const signup = good(await db.from("signups").select("created_at").eq("cancel_token", result.r_cancel_token).single());
      bookedAt = signup.created_at;
      if (index === 0) {
        assert.equal(good(await db.rpc("cancel_signup_by_token", { p_token: result.r_cancel_token })), true);
      } else {
        const moved = good(await db.from("signups").update({ status: "waiting_list" }).eq("cancel_token", result.r_cancel_token).select("id").single());
        const rePromotion = await db.from("signups").update({ status: "signed_up" }).eq("id", moved.id);
        assert.match(rePromotion.error?.message ?? "", /weekly limit reached/);
        assert.equal(good(await db.from("signups").select("status").eq("id", moved.id).single()).status, "waiting_list");
      }
      const balance = good(await db.rpc("get_booking_credits", {
        p_email: address, p_student_id: studentId, p_session_id: sessionId, p_booked_at: bookedAt,
      }))[0];
      assert.equal(balance.used_credits, index + 1);
      assert.equal(balance.remaining_credits, 1 - index);
    }
    assert.equal(good(await db.from("booking_credit_spends").select("signup_id").eq("email", address)).length, 2);
    const third = await db.rpc("insert_signup_guarded", {
      p_session_id: sessionIds[2], p_name: `TEST ${run} Spent`, p_student_id: studentId, p_email: address,
    });
    assert.match(third.error?.message ?? "", /weekly limit reached/);
  } finally {
    good(await db.from("signups").delete().eq("email", address));
    good(await db.from("booking_credit_spends").delete().eq("email", address));
    if (memberId) good(await db.from("student_whitelist").delete().eq("id", memberId));
    if (sessionIds.length) good(await db.from("sessions").delete().in("id", sessionIds));
    assert.equal(good(await db.from("booking_credit_spends").select("signup_id").eq("email", address)).length, 0);
  }
});

test("development DB: waitlist promotion skips a person who used their last credit", async () => {
  const address = {
    blocker: email("promotion-blocker"),
    exhausted: email("promotion-exhausted"),
    eligible: email("promotion-eligible"),
  };
  const student = {
    blocker: `s5${id.slice(2)}`,
    exhausted: `s4${id.slice(2)}`,
    eligible: `s3${id.slice(2)}`,
  };
  const memberIds = [];
  const sessionIds = [];
  try {
    for (const label of Object.keys(address)) {
      assert.equal((await saveManualMember(db, {
        name: `TEST ${run} ${label}`, studentId: student[label], email: address[label],
      })).status, 200);
      memberIds.push(good(await db.from("student_whitelist").select("id").eq("student_id", student[label]).single()).id);
    }
    for (const [index, starts_at] of ["2027-03-15T18:00:00Z", "2027-03-16T18:00:00Z", "2027-03-17T18:00:00Z"].entries()) {
      sessionIds.push(good(await db.from("sessions").insert({
        name: `TEST ${run} promotion ${index}`, capacity: index === 0 ? 1 : 4,
        starts_at, ends_at: new Date(Date.parse(starts_at) + 3600000).toISOString(), allow_name_only: false,
      }).select("id").single()).id);
    }
    const [waitSession, otherA, otherB] = sessionIds;
    const insert = async (sessionId, label) => good(await db.rpc("insert_signup_guarded", {
      p_session_id: sessionId, p_name: `TEST ${run} ${label}`,
      p_student_id: student[label], p_email: address[label],
    }))[0];
    const blocker = await insert(waitSession, "blocker");
    assert.equal(blocker.r_status, "signed_up");
    assert.equal((await insert(waitSession, "exhausted")).r_status, "waiting_list");
    assert.equal((await insert(waitSession, "eligible")).r_status, "waiting_list");
    await insert(otherA, "exhausted");
    await insert(otherB, "exhausted");
    const firstWaitlist = good(await db.from("signups").select("id").eq("session_id", waitSession).eq("email", address.exhausted).single());
    const forced = await db.from("signups").update({ status: "signed_up" }).eq("id", firstWaitlist.id);
    assert.match(forced.error?.message ?? "", /weekly limit reached/);
    assert.equal(good(await db.rpc("cancel_signup_by_token", { p_token: blocker.r_cancel_token })), true);
    const remaining = good(await db.from("signups").select("email,status").eq("session_id", waitSession));
    assert.equal(remaining.find(row => row.email === address.exhausted)?.status, "waiting_list");
    assert.equal(remaining.find(row => row.email === address.eligible)?.status, "signed_up");
    assert.equal((await credits(address.eligible, student.eligible, waitSession)).remaining_credits, 1);
  } finally {
    good(await db.from("signups").delete().in("email", Object.values(address)));
    good(await db.from("booking_credit_spends").delete().in("email", Object.values(address)));
    if (memberIds.length) good(await db.from("student_whitelist").delete().in("id", memberIds));
    if (sessionIds.length) good(await db.from("sessions").delete().in("id", sessionIds));
    assert.equal(good(await db.from("signups").select("id").in("email", Object.values(address))).length, 0);
  }
});

test("development DB: email-only taster can leave a waitlist, be promoted, cancel, and later become a member", async () => {
  const blockerEmail = email("taster-wait-blocker");
  const tasterEmail = email("taster-wait-guest");
  const blockerId = `s2${id.slice(2)}`;
  const memberIds = [];
  const sessionIds = [];
  try {
    assert.equal((await saveManualMember(db, { name: `TEST ${run} Blocker`, studentId: blockerId, email: blockerEmail })).status, 200);
    memberIds.push(good(await db.from("student_whitelist").select("id").eq("email", blockerEmail).single()).id);
    for (const startsAt of ["2027-03-19T18:00:00Z", "2027-03-20T18:00:00Z"]) {
      sessionIds.push(good(await db.from("sessions").insert({
        name: `TEST ${run} taster waitlist`, capacity: 1,
        starts_at: startsAt, ends_at: new Date(Date.parse(startsAt) + 3600000).toISOString(),
        allow_name_only: false,
      }).select("id").single()).id);
    }
    const [fullSession, secondSession] = sessionIds;
    const blocker = good(await db.rpc("insert_signup_guarded", {
      p_session_id: fullSession, p_name: "Blocker", p_student_id: blockerId, p_email: blockerEmail,
    }))[0];
    const firstWait = good(await db.rpc("insert_signup_guarded", {
      p_session_id: fullSession, p_name: "Guest", p_student_id: null, p_email: tasterEmail,
    }))[0];
    assert.equal(firstWait.r_status, "waiting_list");
    assert.equal(good(await db.from("signups").select("is_taster").eq("cancel_token", firstWait.r_cancel_token).single()).is_taster, true);
    assert.equal(good(await db.from("first_time_signups").select("id").eq("email", tasterEmail)).length, 1);
    assert.equal((await credits(tasterEmail, null, fullSession)).used_credits, 0);

    assert.equal(good(await db.rpc("cancel_signup_by_token", { p_token: firstWait.r_cancel_token })), true);
    assert.equal(good(await db.rpc("cancel_signup_by_token", { p_token: firstWait.r_cancel_token })), false);
    assert.equal(good(await db.from("first_time_signups").select("id").eq("email", tasterEmail)).length, 0);
    assert.equal(good(await db.from("signups").select("status").eq("email", blockerEmail).single()).status, "signed_up");

    const secondWait = good(await db.rpc("insert_signup_guarded", {
      p_session_id: fullSession, p_name: "Guest again", p_student_id: null, p_email: tasterEmail,
    }))[0];
    assert.equal(secondWait.r_status, "waiting_list");
    assert.equal(good(await db.rpc("cancel_signup_by_token", { p_token: blocker.r_cancel_token })), true);
    assert.equal(good(await db.from("signups").select("status,is_taster").eq("cancel_token", secondWait.r_cancel_token).single()).status, "signed_up");
    assert.equal((await credits(tasterEmail, null, fullSession)).used_credits, 1);

    assert.equal(good(await db.rpc("cancel_signup_by_token", { p_token: secondWait.r_cancel_token })), true);
    assert.equal(good(await db.from("first_time_signups").select("id").eq("email", tasterEmail)).length, 0);
    assert.equal((await credits(tasterEmail, null, fullSession)).used_credits, 0);
    good(await db.rpc("insert_signup_guarded", {
      p_session_id: secondSession, p_name: "Guest again", p_student_id: null, p_email: tasterEmail,
    }));
    assert.equal((await saveManualMember(db, { name: `TEST ${run} Guest`, email: tasterEmail })).status, 200);
    memberIds.push(good(await db.from("student_whitelist").select("id").eq("email", tasterEmail).single()).id);
    assert.equal(good(await db.from("signups").select("is_taster").eq("session_id", secondSession).eq("email", tasterEmail).single()).is_taster, true);
    good(await db.rpc("insert_signup_guarded", {
      p_session_id: fullSession, p_name: "Paid member", p_student_id: null, p_email: tasterEmail,
    }));
    assert.equal((await credits(tasterEmail, null, fullSession)).used_credits, 2);
  } finally {
    good(await db.from("signups").delete().in("email", [blockerEmail, tasterEmail]));
    good(await db.from("first_time_signups").delete().eq("email", tasterEmail));
    if (memberIds.length) good(await db.from("student_whitelist").delete().in("id", memberIds));
    if (sessionIds.length) good(await db.from("sessions").delete().in("id", sessionIds));
    assert.equal(good(await db.from("signups").select("id").in("email", [blockerEmail, tasterEmail])).length, 0);
  }
});

test("development DB: manual no-ID member is not duplicated when a later roster supplies an ID", async () => {
  const address = email("manual-then-roster");
  const studentId = `s1${id.slice(2)}`;
  const name = `TEST ${run} Manual Then Roster`;
  let memberId = null;
  let sessionId = null;
  try {
    assert.deepEqual((await saveManualMember(db, { name })).body, { ok: true, action: "added" });
    memberId = good(await db.from("student_whitelist").select("id").eq("name", name).single()).id;
    sessionId = good(await db.from("sessions").insert({
      name: name, capacity: 3, starts_at: "2027-03-24T18:00:00Z",
      ends_at: "2027-03-24T19:00:00Z", allow_name_only: false,
    }).select("id").single()).id;
    const taster = good(await db.rpc("insert_signup_guarded", {
      p_session_id: sessionId, p_name: name, p_student_id: null, p_email: address,
    }))[0];
    assert.equal(good(await db.from("signups").select("is_taster").eq("cancel_token", taster.r_cancel_token).single()).is_taster, true);
    assert.equal(good(await db.rpc("cancel_signup_by_token", { p_token: taster.r_cancel_token })), true);
    assert.deepEqual((await saveManualMember(db, { name, email: address })).body, { ok: true, action: "updated" });
    assert.deepEqual((await saveManualMember(db, { name, email: address })).body, { ok: true, action: "updated" });
    assert.equal(good(await db.from("student_whitelist").select("id").eq("email", address).single()).id, memberId);
    assert.equal(reviewNoIdMembers([{ name, email: address }], [name])[0].status, "listed");
    const imported = { name: name.toLowerCase().replaceAll(" ", "  "), student_id: studentId, email: address };
    assert.equal(good(await db.rpc("upsert_membership_roster", { p_members: [imported] })), 1);
    assert.equal(good(await db.from("student_whitelist").select("id").eq("student_id", studentId).single()).id, memberId);
    assert.equal(good(await db.rpc("upsert_membership_roster", { p_members: [imported] })), 1);
    assert.equal(good(await db.from("student_whitelist").select("id").eq("email", address)).length, 1);
    const booking = good(await db.rpc("insert_signup_guarded", {
      p_session_id: sessionId, p_name: name, p_student_id: studentId, p_email: address,
    }))[0];
    assert.equal(booking.r_status, "signed_up");
    assert.equal(good(await db.from("signups").select("is_taster").eq("cancel_token", booking.r_cancel_token).single()).is_taster, false);
  } finally {
    good(await db.from("signups").delete().eq("email", address));
    good(await db.from("first_time_signups").delete().eq("email", address));
    if (memberId) good(await db.from("student_whitelist").delete().eq("id", memberId));
    if (sessionId) good(await db.from("sessions").delete().eq("id", sessionId));
    if (memberId) assert.equal(good(await db.from("student_whitelist").select("id").eq("id", memberId)).length, 0);
  }
});

test("development DB: conflicting roster identities reject the whole upload without partial members", async () => {
  const existingEmail = email("roster-conflict-existing");
  const newEmail = email("roster-conflict-new");
  const newId = `s0${id.slice(2)}`;
  const conflictId = `s1${id.slice(2)}`;
  const existingName = `TEST ${run} Existing Manual`;
  let existingId = null;
  try {
    assert.equal((await saveManualMember(db, { name: existingName, email: existingEmail })).status, 200);
    existingId = good(await db.from("student_whitelist").select("id").eq("email", existingEmail).single()).id;
    assert.equal((await saveManualMember(db, {
      name: `TEST ${run} Different Person`, email: existingEmail,
    })).status, 409);
    assert.equal(good(await db.from("student_whitelist").select("name").eq("id", existingId).single()).name, existingName);
    const upload = await db.rpc("upsert_membership_roster", { p_members: [
      { name: `TEST ${run} Safe Row`, student_id: newId, email: newEmail },
      { name: `TEST ${run} Different Person`, student_id: conflictId, email: existingEmail },
    ] });
    assert.match(upload.error?.message ?? "", /name does not match existing email-only member/);
    assert.equal(good(await db.from("student_whitelist").select("id").eq("student_id", newId)).length, 0);
    assert.equal(good(await db.from("student_whitelist").select("id").eq("student_id", conflictId)).length, 0);
    const retained = good(await db.from("student_whitelist").select("id,name,student_id").eq("email", existingEmail).single());
    assert.equal(retained.id, existingId);
    assert.equal(retained.name, existingName);
    assert.equal(retained.student_id, null);
  } finally {
    good(await db.from("student_whitelist").delete().in("student_id", [newId, conflictId]));
    if (existingId) good(await db.from("student_whitelist").delete().eq("id", existingId));
    assert.equal(good(await db.from("student_whitelist").select("id").in("email", [existingEmail, newEmail])).length, 0);
  }
});

test("development DB: simultaneous members fill one place, then cancellation promotes the waitlist", async () => {
  const addresses = [email("concurrent-a"), email("concurrent-b")];
  const studentIds = [`s0${id.slice(2)}`, `s8${id.slice(2)}`];
  const memberIds = [];
  let sessionId = null;
  try {
    for (let index = 0; index < 2; index += 1) {
      assert.equal((await saveManualMember(db, {
        name: `TEST ${run} Concurrent ${index}`, studentId: studentIds[index], email: addresses[index],
      })).status, 200);
      memberIds.push(good(await db.from("student_whitelist").select("id").eq("student_id", studentIds[index]).single()).id);
    }
    sessionId = good(await db.from("sessions").insert({
      name: `TEST ${run} concurrent capacity`, capacity: 1,
      starts_at: "2027-03-26T18:00:00Z", ends_at: "2027-03-26T19:00:00Z", allow_name_only: false,
    }).select("id").single()).id;
    const results = await Promise.all(addresses.map((address, index) => db.rpc("insert_signup_guarded", {
      p_session_id: sessionId, p_name: `Concurrent ${index}`,
      p_student_id: studentIds[index], p_email: address,
    })));
    const bookings = results.map((result) => good(result)[0]);
    assert.deepEqual(bookings.map((booking) => booking.r_status).sort(), ["signed_up", "waiting_list"]);
    const signedIndex = bookings.findIndex((booking) => booking.r_status === "signed_up");
    const waitingIndex = 1 - signedIndex;
    assert.equal((await credits(addresses[signedIndex], studentIds[signedIndex], sessionId)).used_credits, 1);
    assert.equal((await credits(addresses[waitingIndex], studentIds[waitingIndex], sessionId)).used_credits, 0);
    assert.equal(good(await db.rpc("cancel_signup_by_token", { p_token: bookings[signedIndex].r_cancel_token })), true);
    assert.equal(good(await db.from("signups").select("status").eq("email", addresses[waitingIndex]).single()).status, "signed_up");
    assert.equal((await credits(addresses[waitingIndex], studentIds[waitingIndex], sessionId)).used_credits, 1);
    assert.equal((await credits(addresses[signedIndex], studentIds[signedIndex], sessionId)).used_credits, 0);
  } finally {
    good(await db.from("signups").delete().in("email", addresses));
    if (memberIds.length) good(await db.from("student_whitelist").delete().in("id", memberIds));
    if (sessionId) good(await db.from("sessions").delete().eq("id", sessionId));
    assert.equal(good(await db.from("signups").select("id").in("email", addresses)).length, 0);
  }
});

test("development DB: credit balances use the booking week recorded on each signup", async () => {
  const address = email("historical-week");
  const studentId = `s8${id.slice(2)}`;
  const sessionIds = [];
  let memberId = null;
  try {
    assert.equal((await saveManualMember(db, { name: `TEST ${run} Week`, studentId, email: address })).status, 200);
    memberId = good(await db.from("student_whitelist").select("id").eq("email", address).single()).id;
    for (const startsAt of ["2027-04-06T18:00:00Z", "2027-04-07T18:00:00Z", "2027-04-08T18:00:00Z"]) {
      sessionIds.push(good(await db.from("sessions").insert({
        name: `TEST ${run} week`, capacity: 3,
        starts_at: startsAt, ends_at: new Date(Date.parse(startsAt) + 3600000).toISOString(),
        allow_name_only: false,
      }).select("id").single()).id);
    }
    const first = good(await db.rpc("insert_signup_guarded", {
      p_session_id: sessionIds[0], p_name: "Week member", p_student_id: studentId, p_email: address,
    }))[0];
    const priorWeek = new Date(Date.now() - 14 * 86400000).toISOString();
    good(await db.from("signups").update({ created_at: priorWeek }).eq("cancel_token", first.r_cancel_token).select("id").single());
    good(await db.rpc("insert_signup_guarded", {
      p_session_id: sessionIds[1], p_name: "Week member", p_student_id: studentId, p_email: address,
    }));
    const historical = good(await db.rpc("get_booking_credits", {
      p_email: address, p_student_id: studentId, p_session_id: sessionIds[0], p_booked_at: priorWeek,
    }))[0];
    const current = await credits(address, studentId, sessionIds[1]);
    assert.equal(historical.used_credits, 1);
    assert.equal(current.used_credits, 1);
    assert.notEqual(historical.week_start, current.week_start);
    good(await db.rpc("insert_signup_guarded", {
      p_session_id: sessionIds[2], p_name: "Week member", p_student_id: studentId, p_email: address,
    }));
    assert.equal((await credits(address, studentId, sessionIds[2])).used_credits, 2);
  } finally {
    good(await db.from("signups").delete().eq("email", address));
    if (memberId) good(await db.from("student_whitelist").delete().eq("id", memberId));
    if (sessionIds.length) good(await db.from("sessions").delete().in("id", sessionIds));
    assert.equal(good(await db.from("signups").select("id").eq("email", address)).length, 0);
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

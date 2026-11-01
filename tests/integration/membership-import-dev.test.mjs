import assert from "node:assert/strict";
import test from "node:test";
import { randomInt } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { parseMembershipRoster, reviewNoIdMembers } from "../../lib/membership-roster.ts";
import { saveManualMember } from "../../lib/manual-member.ts";

const devRef = "vexdivrcjscxrtnxwohk";
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || new URL(url).hostname !== `${devRef}.supabase.co` || !key) {
  throw new Error("Integration tests require the known development Supabase URL and its service key. Production is refused.");
}
const db = createClient(url, key, { auth: { persistSession: false } });
const asArrayBuffer = (buffer) => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
const good = (result) => {
  assert.equal(result.error, null, result.error?.message);
  return result.data;
};

test("development DB: roster import survives an ID conflict, remains idempotent, and no-ID members can book", async () => {
  const suffix = String(randomInt(100000, 1000000));
  const safeIds = [`s6${suffix}`, `s7${suffix}`];
  const conflictId = `s8${suffix}`;
  const addresses = [
    `test-import-${suffix}-one@example.invalid`,
    `test-import-${suffix}-two@example.invalid`,
    `test-import-${suffix}-no-id@example.invalid`,
  ];
  const noIdName = `TEST import ${suffix} no ID`;
  const csv = new TextEncoder().encode([
    "Name,Card Number,Email",
    `TEST import ${suffix} one,${safeIds[0]},${addresses[0]}`,
    `TEST import ${suffix} conflict A,${conflictId},`,
    `TEST import ${suffix} conflict B,${conflictId},`,
    `TEST import ${suffix} two,${safeIds[1]},${addresses[1]}`,
    `${noIdName},,${addresses[2]}`,
  ].join("\n"));
  const roster = await parseMembershipRoster(asArrayBuffer(csv), "members.csv", {
    name: "Name", studentId: "Card Number", email: "Email",
  });
  assert.equal(roster.sourceRows, 5);
  assert.deepEqual(roster.idMembers.map((member) => member.student_id), safeIds);
  assert.equal(roster.idConflicts.length, 1);
  assert.equal(roster.withoutStudentId.length, 1);

  let sessionId = null;
  try {
    good(await db.rpc("upsert_membership_roster", { p_members: roster.idMembers }));
    const imported = good(await db.from("student_whitelist").select("student_id,name").in("student_id", [...safeIds, conflictId]));
    assert.equal(imported.length, 2);
    assert.equal(good(await db.from("first_time_signups").select("member_precluded").in("student_id", safeIds)).length, 2);
    assert.equal(reviewNoIdMembers(roster.withoutStudentId, imported.map((member) => member.name))[0].status, "needs_manual");

    assert.equal((await saveManualMember(db, { name: noIdName, email: addresses[2] })).status, 200);
    assert.equal(good(await db.from("first_time_signups").select("member_precluded").eq("email", addresses[2]).single()).member_precluded, true);
    assert.equal(reviewNoIdMembers(roster.withoutStudentId, [...imported.map((member) => member.name), noIdName])[0].status, "listed");

    good(await db.rpc("upsert_membership_roster", { p_members: roster.idMembers }));
    assert.equal(good(await db.from("student_whitelist").select("id").in("student_id", safeIds)).length, 2);

    sessionId = good(await db.from("sessions").insert({
      name: `TEST import ${suffix}`, capacity: 2,
      starts_at: "2027-09-20T18:00:00Z", ends_at: "2027-09-20T19:00:00Z",
      allow_name_only: false,
    }).select("id").single()).id;
    good(await db.rpc("insert_signup_guarded", {
      p_session_id: sessionId, p_name: `TEST import ${suffix} one`,
      p_student_id: safeIds[0], p_email: addresses[0],
    }));
    good(await db.rpc("insert_signup_guarded", {
      p_session_id: sessionId, p_name: noIdName,
      p_student_id: null, p_email: addresses[2],
    }));
    const bookings = good(await db.from("signups").select("is_taster").eq("session_id", sessionId));
    assert.equal(bookings.length, 2);
    assert.ok(bookings.every((booking) => booking.is_taster === false));
  } finally {
    good(await db.from("signups").delete().in("email", addresses));
    if (sessionId) good(await db.from("sessions").delete().eq("id", sessionId));
    good(await db.from("student_whitelist").delete().in("email", addresses));
    good(await db.from("first_time_signups").delete().in("email", addresses));
  }
});

test("development DB: a 210-row workbook processes 203 safe IDs without partial failure or duplicates", async () => {
  const seed = String(randomInt(100, 1000));
  const ids = Array.from({ length: 203 }, (_, index) => `s0${seed}${String(index).padStart(3, "0")}`);
  const conflictId = `s1${seed}999`;
  const csv = new TextEncoder().encode([
    "Name,Card Number,Email",
    ...ids.map((studentId, index) => `TEST bulk ${seed} ${index},${studentId},`),
    `TEST bulk ${seed} conflict A,${conflictId},`,
    `TEST bulk ${seed} conflict B,${conflictId},`,
    ...Array.from({ length: 5 }, (_, index) => `TEST bulk ${seed} no ID ${index},,`),
  ].join("\n"));
  const roster = await parseMembershipRoster(asArrayBuffer(csv), "members.csv", {
    name: "Name", studentId: "Card Number", email: "Email",
  });
  assert.equal(roster.sourceRows, 210);
  assert.equal(roster.idMembers.length, 203);
  assert.equal(roster.idConflicts.length, 1);
  assert.equal(roster.withoutStudentId.length, 5);
  assert.equal(good(await db.from("student_whitelist").select("id").in("student_id", ids)).length, 0);

  let imported = false;
  try {
    good(await db.rpc("upsert_membership_roster", { p_members: roster.idMembers }));
    imported = true;
    assert.equal(good(await db.from("student_whitelist").select("id").in("student_id", ids)).length, 203);
    assert.equal(good(await db.from("first_time_signups").select("id").in("student_id", ids)).length, 203);
    good(await db.rpc("upsert_membership_roster", { p_members: roster.idMembers }));
    assert.equal(good(await db.from("student_whitelist").select("id").in("student_id", ids)).length, 203);
  } finally {
    if (imported) {
      good(await db.from("student_whitelist").delete().in("student_id", ids));
      good(await db.from("first_time_signups").delete().in("student_id", ids));
    }
  }
});

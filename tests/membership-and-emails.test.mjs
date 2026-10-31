import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
import { parseMembershipRoster, reviewNoIdMembers } from "../lib/membership-roster.ts";
import { buildSignupEmail, buildCancellationEmail, buildPromotionEmail } from "../lib/email-templates-core.ts";

const columns = { name: "Member Name", studentId: "Student Number", email: "Contact Email" };
const asArrayBuffer = (buffer) => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

test("XLSX import maps columns, deduplicates IDs, and keeps ID-less people for review", async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Members");
  sheet.addRow(["Member Name", "Student Number", "Contact Email"]);
  sheet.addRow(["Alex Student", "S1234567", "ALEX@example.com"]);
  sheet.addRow(["Alex Student", "s1234567", ""]);
  sheet.addRow(["Pat Member", "", "pat@example.com"]);
  const parsed = await parseMembershipRoster(asArrayBuffer(await workbook.xlsx.writeBuffer()), "members.xlsx", columns);
  assert.deepEqual(parsed.idMembers, [{ name: "Alex Student", student_id: "s1234567", email: "alex@example.com" }]);
  assert.deepEqual(parsed.withoutStudentId, [{ name: "Pat Member", email: "pat@example.com" }]);
});

test("CSV import accepts an absent email column and flags manual member review", async () => {
  const csv = new TextEncoder().encode("Member Name,Student Number\nAlex Student,s1234567\nPat Member,\n");
  const parsed = await parseMembershipRoster(asArrayBuffer(csv), "members.csv", columns);
  assert.equal(parsed.idMembers[0].email, null);
  assert.deepEqual(reviewNoIdMembers(parsed.withoutStudentId, ["  pat   MEMBER "])[0].status, "listed");
  assert.deepEqual(reviewNoIdMembers(parsed.withoutStudentId, [])[0].status, "needs_manual");
  assert.deepEqual(reviewNoIdMembers(parsed.withoutStudentId, ["Pat Member", "PAT MEMBER"])[0].status, "ambiguous");
  assert.deepEqual(reviewNoIdMembers([...parsed.withoutStudentId, ...parsed.withoutStudentId], [])[0].status, "ambiguous");
});

test("EUBC workbook headers are recognized without changing the saved column mapping", async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Sheet1");
  sheet.addRow(["Name", "Card Number"]);
  sheet.addRow(["Alex Student", "s1234567"]);
  sheet.addRow(["Pat Member", ""]);
  const parsed = await parseMembershipRoster(asArrayBuffer(await workbook.xlsx.writeBuffer()), "EUBC Membership.xlsx", {
    name: "name", studentId: "student_id", email: "email",
  });
  assert.equal(parsed.idMembers.length, 1);
  assert.equal(parsed.withoutStudentId.length, 1);
});

test("roster import rejects conflicting duplicate IDs and invalid addresses", async () => {
  const conflicting = new TextEncoder().encode("Member Name,Student Number,Contact Email\nAlex Student,s1234567,a@example.com\nOther Person,s1234567,b@example.com\n");
  await assert.rejects(parseMembershipRoster(asArrayBuffer(conflicting), "members.csv", columns), /conflicting details/);
  const invalid = new TextEncoder().encode("Member Name,Student Number,Contact Email\nAlex Student,s1234567,not-an-email\n");
  await assert.rejects(parseMembershipRoster(asArrayBuffer(invalid), "members.csv", columns), /invalid email/);
});

const session = { name: "Monday Badminton", starts_at: "2026-11-02T18:00:00Z", ends_at: "2026-11-02T19:00:00Z", notes: null };
test("booking and cancellation emails show remaining credits and exhaustion", () => {
  const first = buildSignupEmail({ name: "Alex", email: "alex@example.com", status: "signed_up", session, cancelUrl: "https://example.test/cancel", credits: { weeklyQuota: 2, usedCredits: 1, remainingCredits: 1 } });
  assert.match(first.text, /1 of 2 reserved or spent, 1 available/);
  assert.match(first.text, /confirmed place reserves one weekly booking credit/);
  assert.match(first.html, /Booking weeks reset Monday/);
  const last = buildSignupEmail({ name: "Alex", email: "alex@example.com", status: "signed_up", session, cancelUrl: "https://example.test/cancel", credits: { weeklyQuota: 2, usedCredits: 2, remainingCredits: 0 } });
  assert.match(last.text, /no booking credits available/);
  const cancelled = buildCancellationEmail({ name: "Alex", session, source: "user_cancelled", previousStatus: "signed_up", creditReturned: true, credits: { weeklyQuota: 2, usedCredits: 1, remainingCredits: 1 } });
  assert.match(cancelled.text, /returned to the week you booked/);
  const afterStart = buildCancellationEmail({ name: "Alex", session, source: "admin_removed", previousStatus: "signed_up", creditReturned: false, credits: { weeklyQuota: 2, usedCredits: 1, remainingCredits: 1 } });
  assert.match(afterStart.text, /remains spent and was not returned/);
  const taster = buildSignupEmail({ name: "Alex", email: "alex@example.com", status: "signed_up", session, cancelUrl: "https://example.test/cancel", isFirstTimeTaster: true, credits: { weeklyQuota: 2, usedCredits: 1, remainingCredits: 1 } });
  assert.match(taster.text, /first booking without membership/);
  assert.doesNotMatch(taster.text, /credit/i);
  assert.doesNotMatch(taster.html, /credit/i);
  const tasterPromoted = buildPromotionEmail({ name: "Alex", session, cancelUrl: "https://example.test/cancel", isFirstTimeTaster: true, credits: { weeklyQuota: 2, usedCredits: 1, remainingCredits: 1 } });
  assert.doesNotMatch(tasterPromoted.text, /credit/i);
  const tasterCancelled = buildCancellationEmail({ name: "Alex", session, source: "user_cancelled", previousStatus: "signed_up", isFirstTimeTaster: true, creditReturned: true, credits: { weeklyQuota: 2, usedCredits: 0, remainingCredits: 2 } });
  assert.doesNotMatch(tasterCancelled.text, /credit/i);
});

test("waitlist email says no credit is used until promotion, then shows the new count", () => {
  const waitlist = buildSignupEmail({ name: "Pat", email: "pat@example.com", status: "waiting_list", session, cancelUrl: "https://example.test/cancel", credits: { weeklyQuota: 2, usedCredits: 1, remainingCredits: 1 } });
  assert.match(waitlist.text, /waitlist place does not reserve a credit/);
  const promoted = buildPromotionEmail({ name: "Pat", session, cancelUrl: "https://example.test/cancel", credits: { weeklyQuota: 2, usedCredits: 2, remainingCredits: 0 } });
  assert.match(promoted.text, /2 of 2 reserved or spent, 0 available/);
  assert.match(promoted.text, /now reserved for your confirmed place/);
  const removed = buildCancellationEmail({ name: "Pat", session, source: "admin_removed", previousStatus: "waiting_list", credits: { weeklyQuota: 2, usedCredits: 1, remainingCredits: 1 } });
  assert.match(removed.text, /did not reserve a booking credit/);
  const previouslyConfirmed = buildCancellationEmail({ name: "Pat", session, source: "admin_removed", previousStatus: "waiting_list", creditReturned: false, credits: { weeklyQuota: 2, usedCredits: 2, remainingCredits: 0 } });
  assert.match(previouslyConfirmed.text, /remains spent and was not returned/);
});

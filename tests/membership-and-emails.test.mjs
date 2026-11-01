import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
import { parseMembershipRoster, reviewNoIdMembers } from "../lib/membership-roster.ts";
import { buildSignupEmail, buildCancellationEmail, buildPromotionEmail } from "../lib/email-templates-core.ts";

const columns = { name: "Member Name", studentId: "Student Number", email: "Contact Email" };
const asArrayBuffer = (buffer) => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

function purchaseReport() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Product Purchasers Report");
  sheet.mergeCells("A1:G1");
  sheet.getCell("A1").value = "Product Purchasers Report";
  for (const [cell, value] of Object.entries({ A8: "Trans #", B8: "Name", G8: "Card #", K8: "Qty", M8: "Purchase Date" })) {
    sheet.getCell(cell).value = value;
  }
  const section = (row, label) => {
    sheet.mergeCells(`A${row}:N${row}`);
    sheet.getCell(`A${row}`).value = `[10000000] Badminton Club - ${label}`;
  };
  const purchase = (row, name, card, quantity = 1) => {
    sheet.getCell(`A${row}`).value = row + 10000;
    sheet.getCell(`B${row}`).value = name;
    sheet.getCell(`G${row}`).value = card;
    sheet.getCell(`K${row}`).value = quantity;
  };
  section(9, "Full Year - Student");
  purchase(10, "Student, Alex", "S1234567");
  section(11, "Full Year - Non-Student");
  purchase(12, "Member, Pat", "(Unknown)");
  section(13, "Full Year - 1st Team Fees");
  purchase(14, "Team, Only", "s7654321");
  section(15, "Semester 1");
  purchase(16, "One, Sam", "s2345678");
  section(17, "Semester 2");
  purchase(18, "Two, Jo", "s3456789");
  return { workbook, sheet, section, purchase };
}

test("purchase report imports only current-period memberships and retains non-student manual review", async () => {
  const { workbook } = purchaseReport();
  const buffer = asArrayBuffer(await workbook.xlsx.writeBuffer());
  const semester1 = await parseMembershipRoster(buffer, "purchases.xlsx", columns, "semester1");
  assert.equal(semester1.format, "purchase_report");
  assert.equal(semester1.sourceRows, 3);
  assert.deepEqual(semester1.idMembers, [
    { name: "Student, Alex", student_id: "s1234567", email: null },
    { name: "One, Sam", student_id: "s2345678", email: null },
  ]);
  assert.deepEqual(semester1.withoutStudentId, [{ name: "Member, Pat", email: null }]);
  assert.equal(reviewNoIdMembers(semester1.withoutStudentId, ["Member, Pat"])[0].status, "listed");
  assert.equal(reviewNoIdMembers(semester1.withoutStudentId, [])[0].status, "needs_manual");
  assert.equal(semester1.ignoredTeamFeeRows, 1);
  assert.equal(semester1.outsidePeriodRows, 1);

  const semester2 = await parseMembershipRoster(buffer, "purchases.xlsx", columns, "semester2");
  assert.deepEqual(semester2.idMembers.map((member) => member.student_id), ["s1234567", "s3456789"]);
  assert.equal(semester2.withoutStudentId.length, 1);
  assert.equal(semester2.ignoredTeamFeeRows, 1);
  assert.equal(semester2.outsidePeriodRows, 1);
});

test("purchase report rejects unrecognized products and refund or multi-buyer quantities", async () => {
  const { workbook, sheet, section, purchase } = purchaseReport();
  sheet.getCell("K16").value = -1;
  await assert.rejects(parseMembershipRoster(asArrayBuffer(await workbook.xlsx.writeBuffer()), "purchases.xlsx", columns), /quantity -1/);
  sheet.getCell("K16").value = 2;
  await assert.rejects(parseMembershipRoster(asArrayBuffer(await workbook.xlsx.writeBuffer()), "purchases.xlsx", columns), /quantity 2/);
  sheet.getCell("K16").value = 1;
  section(19, "Semester 3");
  purchase(20, "Future, Member", "s4567890");
  await assert.rejects(parseMembershipRoster(asArrayBuffer(await workbook.xlsx.writeBuffer()), "purchases.xlsx", columns), /Unrecognized Badminton Club product at row 19/);
});

test("conflicting student IDs in purchase reports are held for review without blocking safe IDs", async () => {
  const { workbook, purchase } = purchaseReport();
  purchase(19, "Someone, Else", "s1234567");
  const parsed = await parseMembershipRoster(asArrayBuffer(await workbook.xlsx.writeBuffer()), "purchases.xlsx", columns, "semester2");
  assert.equal(parsed.idConflicts.length, 1);
  assert.deepEqual(parsed.idConflicts[0].rows.map((entry) => entry.row), [10, 19]);
  assert.deepEqual(parsed.idMembers.map((member) => member.student_id), ["s3456789"]);
});

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
  assert.deepEqual(parsed.idConflicts, []);
  assert.equal(parsed.sourceRows, 3);
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

test("conflicting ID at row 174 is skipped while later members and no-ID review survive", async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Members");
  sheet.addRow(["Member Name", "Student Number", "Contact Email"]);
  for (let row = 2; row <= 172; row += 1) {
    sheet.addRow([`Member ${row}`, `s${String(row).padStart(7, "0")}`, ""]);
  }
  sheet.addRow(["First person", "s7777777", "first@example.com"]); // Row 173
  sheet.addRow(["Second person", "s7777777", "second@example.com"]); // Row 174
  sheet.addRow(["Later member", "s8888888", ""]);
  sheet.addRow(["No ID member", "", "no-id@example.com"]);

  const parsed = await parseMembershipRoster(asArrayBuffer(await workbook.xlsx.writeBuffer()), "members.xlsx", columns);
  assert.equal(parsed.sourceRows, 175);
  assert.equal(parsed.idMembers.length, 172);
  assert.equal(parsed.idMembers.some((member) => member.student_id === "s7777777"), false);
  assert.equal(parsed.idMembers.at(-1).student_id, "s8888888");
  assert.deepEqual(parsed.idConflicts[0].rows.map((entry) => entry.row), [173, 174]);
  assert.deepEqual(parsed.withoutStudentId, [{ name: "No ID member", email: "no-id@example.com" }]);
});

test("conflicting CSV IDs are reported without losing safe IDs; invalid addresses still reject", async () => {
  const conflicting = new TextEncoder().encode("Member Name,Student Number,Contact Email\nAlex Student,s1234567,a@example.com\nOther Person,s1234567,b@example.com\nLater Member,s7654321,\nPat Member,,pat@example.com\n");
  const parsed = await parseMembershipRoster(asArrayBuffer(conflicting), "members.csv", columns);
  assert.equal(parsed.idMembers.length, 1);
  assert.equal(parsed.idMembers[0].student_id, "s7654321");
  assert.equal(parsed.idConflicts.length, 1);
  assert.deepEqual(parsed.idConflicts[0].rows.map((entry) => entry.row), [2, 3]);
  assert.equal(parsed.withoutStudentId.length, 1);
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

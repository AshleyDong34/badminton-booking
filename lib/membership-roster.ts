import ExcelJS from "exceljs";
import { Readable } from "node:stream";

type Columns = { name: string; email: string; studentId: string };
export type ImportPeriod = "semester1" | "semester2";
export type RosterEntry = { name: string; student_id: string; email: string | null };
export type NoIdEntry = { name: string; email: string | null };
export type ReviewEntry = NoIdEntry & { status: "listed" | "needs_manual" | "ambiguous" };
export type IdConflict = { student_id: string; rows: Array<NoIdEntry & { row: number }> };

const EMAIL_KEYS = new Set(["email", "emailaddress", "mail"]);
const ID_KEYS = new Set(["studentid", "studentnumber", "universityid", "memberid", "membershipid", "cardnumber", "id"]);
const NAME_KEYS = new Set(["name", "fullname", "membername"]);

export function normalizeName(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-GB");
}

export function normalizeStudentId(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizeHeader(raw: string) {
  return raw.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function cellToText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.text === "string") return record.text;
    if (typeof record.hyperlink === "string") return record.hyperlink;
    if (Array.isArray(record.richText)) {
      return record.richText.map((part) => (typeof part?.text === "string" ? part.text : "")).join("");
    }
    if (record.result != null) return String(record.result);
  }
  return String(value);
}

type SourceRow = { row: number; name: string; rawId: string; rawEmail: string };
type ReportSummary = {
  format: "roster" | "purchase_report";
  ignoredTeamFeeRows: number;
  outsidePeriodRows: number;
};

function parseProductReport(sheet: ExcelJS.Worksheet, period: ImportPeriod): { rows: SourceRow[]; summary: ReportSummary } {
  let headerRow = 0;
  let transactionCol = 0;
  let nameCol = 0;
  let cardCol = 0;
  let quantityCol = 0;
  for (let rowNumber = 1; rowNumber <= Math.min(sheet.rowCount, 30); rowNumber += 1) {
    const headers = new Map<string, number>();
    sheet.getRow(rowNumber).eachCell({ includeEmpty: false }, (cell, col) => {
      const header = normalizeHeader(cellToText(cell.value));
      if (header && !headers.has(header)) headers.set(header, col);
    });
    if (headers.has("trans") && headers.has("name") && headers.has("card") && headers.has("qty")) {
      headerRow = rowNumber;
      transactionCol = headers.get("trans")!;
      nameCol = headers.get("name")!;
      cardCol = headers.get("card")!;
      quantityCol = headers.get("qty")!;
      break;
    }
  }
  if (!headerRow) throw new Error("Could not find the transaction, name, card and quantity columns in this purchase report.");

  const rows: SourceRow[] = [];
  let ignoredTeamFeeRows = 0;
  let outsidePeriodRows = 0;
  let product: "member" | "team_fee" | "outside_period" | "other" = "other";
  for (let rowNumber = headerRow + 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const first = cellToText(row.getCell(transactionCol).value).trim();
    const section = /^\[\d+\]\s*(.+)$/.exec(first);
    if (section) {
      const label = section[1].trim().replace(/\s+/g, " ");
      if (/\bteam fees?\b/i.test(label)) {
        product = "team_fee";
      } else if (/^Badminton Club - Full Year(?: - (?:Student|Non-Student))?$/i.test(label)) {
        product = "member";
      } else {
        const semester = /^Badminton Club - (?:Semester ([12])|([12])(?:st|nd) Semester)(?: - (?:Student|Non-Student))?$/i.exec(label);
        if (semester) {
          product = (semester[1] ?? semester[2]) === period.slice(-1) ? "member" : "outside_period";
        } else if (/^Badminton Club\b/i.test(label)) {
          throw new Error(`Unrecognized Badminton Club product at row ${rowNumber}: ${label}. Review it before importing.`);
        } else {
          product = "other";
        }
      }
      continue;
    }
    if (!/^\d+$/.test(first)) continue; // Subtotals and blank separators are not purchasers.
    if (product === "team_fee") { ignoredTeamFeeRows += 1; continue; }
    if (product === "outside_period") { outsidePeriodRows += 1; continue; }
    if (product !== "member") continue;
    const quantity = Number(cellToText(row.getCell(quantityCol).value));
    if (quantity !== 1) {
      throw new Error(`Membership purchase row ${rowNumber} has quantity ${Number.isFinite(quantity) ? quantity : "missing"}; review refunds or multiple purchases before importing.`);
    }
    const name = cellToText(row.getCell(nameCol).value).trim();
    const rawCard = cellToText(row.getCell(cardCol).value).trim();
    const rawId = /^\(unknown\)$/i.test(rawCard) ? "" : rawCard;
    rows.push({ row: rowNumber, name, rawId, rawEmail: "" });
  }
  return { rows, summary: { format: "purchase_report", ignoredTeamFeeRows, outsidePeriodRows } };
}

function parseFlatRoster(sheet: ExcelJS.Worksheet, columns: Columns): { rows: SourceRow[]; summary: ReportSummary } {
  const rows: SourceRow[] = [];
  const summary: ReportSummary = { format: "roster", ignoredTeamFeeRows: 0, outsidePeriodRows: 0 };
  const headers = new Map<string, number>();
  sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, col) => {
    const header = normalizeHeader(cellToText(cell.value));
    if (header) headers.set(header, col);
  });
  const findColumn = (mapped: string, fallback: (header: string) => boolean) =>
    headers.get(normalizeHeader(mapped)) ?? [...headers].find(([header]) => fallback(header))?.[1];
  const nameCol = findColumn(columns.name, (h) => NAME_KEYS.has(h) || h.includes("name"));
  const idCol = findColumn(columns.studentId, (h) => ID_KEYS.has(h) || h.includes("studentid") || h.includes("studentnumber"));
  const emailCol = findColumn(columns.email, (h) => EMAIL_KEYS.has(h) || h.includes("email") || h.includes("mail"));
  if (nameCol == null || idCol == null) {
    throw new Error("A name column and a student ID column are required. Email is optional.");
  }
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    if (!row.hasValues) continue;
    rows.push({
      row: rowNumber,
      name: cellToText(row.getCell(nameCol).value),
      rawId: cellToText(row.getCell(idCol).value),
      rawEmail: emailCol == null ? "" : cellToText(row.getCell(emailCol).value),
    });
  }
  return { rows, summary };
}

export async function parseMembershipRoster(buffer: ArrayBuffer, fileName: string, columns: Columns, period: ImportPeriod = "semester1") {
  const workbook = new ExcelJS.Workbook();
  if (fileName.toLowerCase().endsWith(".csv")) {
    await workbook.csv.read(Readable.from([new Uint8Array(buffer)]));
  } else if (fileName.toLowerCase().endsWith(".xlsx")) {
    await workbook.xlsx.load(buffer);
  } else {
    throw new Error("Unsupported file type. Upload .xlsx or .csv.");
  }

  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("No worksheet found in file.");
  if (period !== "semester1" && period !== "semester2") throw new Error("Choose Semester 1 or Semester 2 for the purchase report.");
  const { rows, summary } = normalizeHeader(cellToText(sheet.getRow(1).getCell(1).value)) === "productpurchasersreport"
    ? parseProductReport(sheet, period)
    : parseFlatRoster(sheet, columns);

  const byStudentId = new Map<string, IdConflict["rows"]>();
  const withoutStudentId: NoIdEntry[] = [];
  let sourceRows = 0;
  for (const row of rows) {
    const rowNumber = row.row;
    const name = row.name.trim().replace(/\s+/g, " ");
    const rawId = row.rawId.trim();
    const rawEmail = row.rawEmail.trim();
    const email = rawEmail ? rawEmail.toLowerCase() : null;
    if (!name && !rawId && !rawEmail) continue;
    sourceRows += 1;
    if (!name) throw new Error(`Row ${rowNumber} has membership data but no name.`);
    if (email && !validEmail(email)) throw new Error(`Row ${rowNumber} has an invalid email address.`);
    const studentId = normalizeStudentId(rawId);
    if (!studentId) {
      withoutStudentId.push({ name, email });
      continue;
    }
    if (!/^s[0-9]{7}$/.test(studentId)) throw new Error(`Row ${rowNumber} has an invalid student ID.`);
    const entries = byStudentId.get(studentId) ?? [];
    entries.push({ row: rowNumber, name, email });
    byStudentId.set(studentId, entries);
  }
  const idMembers: RosterEntry[] = [];
  const idConflicts: IdConflict[] = [];
  for (const [studentId, entries] of byStudentId) {
    const names = new Set(entries.map((entry) => normalizeName(entry.name)));
    const emails = new Set(entries.map((entry) => entry.email).filter(Boolean));
    if (names.size > 1 || emails.size > 1) {
      idConflicts.push({ student_id: studentId, rows: entries });
    } else {
      idMembers.push({ name: entries[0].name, student_id: studentId, email: entries.find((entry) => entry.email)?.email ?? null });
    }
  }
  if (sourceRows === 0) throw new Error("No member rows were found in the file.");
  return { idMembers, withoutStudentId, idConflicts, sourceRows, ...summary };
}

export function reviewNoIdMembers(rows: NoIdEntry[], existingNames: Array<string | null>): ReviewEntry[] {
  const nameCounts = new Map<string, number>();
  const importCounts = new Map<string, number>();
  for (const name of existingNames) {
    if (!name) continue;
    const key = normalizeName(name);
    if (key) nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
  }
  for (const row of rows) {
    const key = normalizeName(row.name);
    importCounts.set(key, (importCounts.get(key) ?? 0) + 1);
  }
  return rows.map((row) => {
    const key = normalizeName(row.name);
    const count = nameCounts.get(key) ?? 0;
    return {
      ...row,
      status: (importCounts.get(key) ?? 0) > 1 || count > 1
        ? "ambiguous"
        : count === 1 ? "listed" : "needs_manual",
    };
  });
}

import ExcelJS from "exceljs";
import { Readable } from "node:stream";

type Columns = { name: string; email: string; studentId: string };
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

export async function parseMembershipRoster(buffer: ArrayBuffer, fileName: string, columns: Columns) {
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

  const byStudentId = new Map<string, IdConflict["rows"]>();
  const withoutStudentId: NoIdEntry[] = [];
  let sourceRows = 0;
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    if (!row.hasValues) continue;
    const name = cellToText(row.getCell(nameCol).value).trim().replace(/\s+/g, " ");
    const rawId = cellToText(row.getCell(idCol).value).trim();
    const rawEmail = emailCol == null ? "" : cellToText(row.getCell(emailCol).value).trim();
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
  return { idMembers, withoutStudentId, idConflicts, sourceRows };
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

import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { Readable } from "stream";
import { requireAdmin } from "@/lib/adminGuard";
import { supabaseServer } from "@/lib/supabase-server";
import { getBaseUrl } from "@/lib/base-url";

export const runtime = "nodejs";

const EMAIL_KEYS = new Set(["email", "emailaddress", "mail"]);
const ID_KEYS = new Set(["studentid", "memberid", "membershipid"]);

function normalizeHeader(raw: string) {
  return raw.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isEmailHeader(header: string) {
  return EMAIL_KEYS.has(header) || header.includes("email") || header.includes("mail");
}

function isIdHeader(header: string) {
  return (
    ID_KEYS.has(header) ||
    header.includes("student") ||
    header.includes("member") ||
    header === "id"
  );
}

function cellToText(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value instanceof Date) return value.toISOString();

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.text === "string") return record.text;
    if (typeof record.hyperlink === "string") return record.hyperlink;
    if (Array.isArray(record.richText)) {
      return record.richText
        .map((part) => (typeof part?.text === "string" ? part.text : ""))
        .join("");
    }
    if (record.result != null) return String(record.result);
  }

  return String(value);
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) {
    const status = guard.reason === "not_logged_in" ? 401 : 403;
    const error = guard.reason === "not_logged_in" ? "Unauthorized" : "Forbidden";
    return NextResponse.json({ error }, { status });
  }

  const form = await req.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file upload." }, { status: 400 });
  }

  const arrayBuffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();

  const name = (file as File).name?.toLowerCase() ?? "";
  if (name.endsWith(".csv")) {
    const stream = Readable.from([new Uint8Array(arrayBuffer)]);
    await workbook.csv.read(stream);
  } else if (name.endsWith(".xlsx")) {
    await workbook.xlsx.load(arrayBuffer);
  } else {
    return NextResponse.json(
      { error: "Unsupported file type. Upload .xlsx or .csv." },
      { status: 400 }
    );
  }

  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return NextResponse.json({ error: "No worksheet found in file." }, { status: 400 });
  }

  const headerRow = sheet.getRow(1);
  const emailCols: number[] = [];
  const idCols: number[] = [];

  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const header = normalizeHeader(cellToText(cell.value));
    if (!header) return;
    if (isEmailHeader(header)) emailCols.push(colNumber);
    if (isIdHeader(header)) idCols.push(colNumber);
  });

  if (emailCols.length === 0 && idCols.length === 0) {
    return NextResponse.json(
      { error: "No email or student_id columns detected." },
      { status: 400 }
    );
  }

  const emailRows = new Map<string, { email: string; student_id: string | null }>();
  const idOnly = new Set<string>();

  for (let i = 2; i <= sheet.rowCount; i += 1) {
    const row = sheet.getRow(i);
    if (!row.hasValues) continue;

    let email = "";
    let studentId = "";

    for (const col of emailCols) {
      const text = cellToText(row.getCell(col).value).trim();
      if (text) {
        email = text.toLowerCase();
        break;
      }
    }

    for (const col of idCols) {
      const text = cellToText(row.getCell(col).value).trim();
      if (text) {
        studentId = text;
        break;
      }
    }

    const hasEmail = email && email.includes("@");
    const hasId = Boolean(studentId);

    if (hasEmail) {
      const existing = emailRows.get(email);
      if (existing) {
        if (!existing.student_id && hasId) existing.student_id = studentId;
      } else {
        emailRows.set(email, {
          email,
          student_id: hasId ? studentId : null,
        });
      }
    } else if (hasId) {
      idOnly.add(studentId);
    }
  }

  if (emailRows.size === 0 && idOnly.size === 0) {
    return NextResponse.json(
      { error: "No email or student_id columns detected." },
      { status: 400 }
    );
  }

  const adminDb = supabaseServer();

  const { error: clearEmailErr } = await adminDb
    .from("student_whitelist")
    .delete()
    .not("email", "is", null);

  if (clearEmailErr) {
    return NextResponse.json({ error: clearEmailErr.message }, { status: 500 });
  }

  const { error: clearIdErr } = await adminDb
    .from("student_whitelist")
    .delete()
    .not("student_id", "is", null);

  if (clearIdErr) {
    return NextResponse.json({ error: clearIdErr.message }, { status: 500 });
  }

  const rows = [
    ...Array.from(emailRows.values()).map((row) => ({
      email: row.email,
      student_id: row.student_id,
    })),
    ...Array.from(idOnly).map((student_id) => ({
      student_id,
      email: null,
    })),
  ];

  if (rows.length > 0) {
    const { error } = await adminDb.from("student_whitelist").insert(rows);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  const inserted = emailRows.size + idOnly.size;
  const redirectUrl = new URL(
    `/admin/whitelist?ok=1&inserted=${inserted}`,
    getBaseUrl(req)
  );
  return NextResponse.redirect(redirectUrl);
}

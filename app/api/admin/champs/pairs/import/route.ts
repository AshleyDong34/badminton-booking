import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireAdmin } from "@/lib/adminGuard";
import { getBaseUrl } from "@/lib/base-url";

type EventType = "level_doubles" | "mixed_doubles";
type LevelDoublesType = "mens_doubles" | "womens_doubles" | null;

type PairInsert = {
  event: EventType;
  level_doubles_type: LevelDoublesType;
  player_one_name: string;
  player_one_level: number;
  player_two_name: string;
  player_two_level: number;
  pair_strength: number;
};

const LEVELS = new Set([1, 2, 3, 4, 5, 6, 7]);

const DEFAULT_LEVEL_COLUMNS = {
  playerOneName: "player_one_name",
  playerOneLevel: "player_one_level",
  playerOneGender: "player_one_gender",
  playerTwoName: "player_two_name",
  playerTwoLevel: "player_two_level",
  playerTwoGender: "player_two_gender",
};

const DEFAULT_MIXED_COLUMNS = {
  playerOneName: "player_one_name",
  playerOneLevel: "player_one_level",
  playerTwoName: "player_two_name",
  playerTwoLevel: "player_two_level",
};

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === "\"") {
        if (text[i + 1] === "\"") {
          cell += "\"";
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === "\"") {
      inQuotes = true;
      continue;
    }

    if (ch === ",") {
      row.push(cell);
      cell = "";
      continue;
    }

    if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    if (ch === "\r") {
      continue;
    }

    cell += ch;
  }

  row.push(cell);
  rows.push(row);

  while (rows.length > 0 && rows[rows.length - 1].every((value) => value.trim() === "")) {
    rows.pop();
  }

  if (rows.length > 0 && rows[0].length > 0) {
    rows[0][0] = rows[0][0].replace(/^\uFEFF/, "");
  }

  return rows;
}

function parseLevel(raw: string) {
  const value = raw.trim().toLowerCase();
  if (!value) return NaN;

  if (value === "rec" || value === "recreational") return 7;

  const teamMatch = value.match(/^team\s*([1-7])$/);
  if (teamMatch) return Number(teamMatch[1]);

  const tMatch = value.match(/^t([1-7])$/);
  if (tMatch) return Number(tMatch[1]);

  if (/^[1-7]$/.test(value)) return Number(value);

  return NaN;
}

function parseGender(raw: string): "male" | "female" | null {
  const value = raw.trim().toLowerCase();
  if (value === "male") return "male";
  if (value === "female") return "female";
  return null;
}

function strengthFor(args: {
  event: EventType;
  levelType: LevelDoublesType;
  p1: number;
  p2: number;
}) {
  const base = args.p1 + args.p2;
  if (args.event === "level_doubles" && args.levelType === "womens_doubles") return base + 3;
  return base;
}

function mappingValue(form: FormData, key: string, fallback: string) {
  const raw = String(form.get(key) ?? "").trim();
  return raw || fallback;
}

function ensureColumns(
  headerIndex: Map<string, number>,
  columns: string[],
  label: string
) {
  const missing = columns.filter((col) => !headerIndex.has(normalizeHeader(col)));
  if (missing.length > 0) {
    return `${label}: missing columns ${missing.join(", ")}`;
  }
  return null;
}

function getCell(
  row: string[],
  headerIndex: Map<string, number>,
  columnName: string
) {
  const idx = headerIndex.get(normalizeHeader(columnName));
  if (idx == null) return "";
  return String(row[idx] ?? "").trim();
}

function parseMixedCsv(args: {
  content: string;
  columns: typeof DEFAULT_MIXED_COLUMNS;
}) {
  const rows = parseCsv(args.content);
  if (rows.length < 2) return { inserts: [] as PairInsert[], error: "Mixed CSV has no data rows." };

  const header = rows[0];
  const headerIndex = new Map<string, number>();
  for (let i = 0; i < header.length; i += 1) {
    headerIndex.set(normalizeHeader(header[i]), i);
  }

  const missing = ensureColumns(headerIndex, Object.values(args.columns), "Mixed CSV");
  if (missing) return { inserts: [] as PairInsert[], error: missing };

  const inserts: PairInsert[] = [];
  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    const rowNum = i + 1;
    if (row.every((value) => value.trim() === "")) continue;

    const p1Name = getCell(row, headerIndex, args.columns.playerOneName);
    const p2Name = getCell(row, headerIndex, args.columns.playerTwoName);
    const p1Level = parseLevel(getCell(row, headerIndex, args.columns.playerOneLevel));
    const p2Level = parseLevel(getCell(row, headerIndex, args.columns.playerTwoLevel));

    if (!p1Name || !p2Name) {
      return { inserts: [] as PairInsert[], error: `Mixed CSV row ${rowNum}: missing player name.` };
    }
    if (!LEVELS.has(p1Level) || !LEVELS.has(p2Level)) {
      return {
        inserts: [] as PairInsert[],
        error: `Mixed CSV row ${rowNum}: invalid level (expected Team 1-6 or Rec).`,
      };
    }
    if (p1Name.toLowerCase() === p2Name.toLowerCase()) {
      return { inserts: [] as PairInsert[], error: `Mixed CSV row ${rowNum}: players must be different.` };
    }

    inserts.push({
      event: "mixed_doubles",
      level_doubles_type: null,
      player_one_name: p1Name,
      player_one_level: p1Level,
      player_two_name: p2Name,
      player_two_level: p2Level,
      pair_strength: strengthFor({
        event: "mixed_doubles",
        levelType: null,
        p1: p1Level,
        p2: p2Level,
      }),
    });
  }

  return { inserts, error: null as string | null };
}

function parseLevelCsv(args: {
  content: string;
  columns: typeof DEFAULT_LEVEL_COLUMNS;
}) {
  const rows = parseCsv(args.content);
  if (rows.length < 2) return { inserts: [] as PairInsert[], error: "Level CSV has no data rows." };

  const header = rows[0];
  const headerIndex = new Map<string, number>();
  for (let i = 0; i < header.length; i += 1) {
    headerIndex.set(normalizeHeader(header[i]), i);
  }

  const missing = ensureColumns(headerIndex, Object.values(args.columns), "Level CSV");
  if (missing) return { inserts: [] as PairInsert[], error: missing };

  const inserts: PairInsert[] = [];
  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    const rowNum = i + 1;
    if (row.every((value) => value.trim() === "")) continue;

    const p1Name = getCell(row, headerIndex, args.columns.playerOneName);
    const p2Name = getCell(row, headerIndex, args.columns.playerTwoName);
    const p1Level = parseLevel(getCell(row, headerIndex, args.columns.playerOneLevel));
    const p2Level = parseLevel(getCell(row, headerIndex, args.columns.playerTwoLevel));
    const g1 = parseGender(getCell(row, headerIndex, args.columns.playerOneGender));
    const g2 = parseGender(getCell(row, headerIndex, args.columns.playerTwoGender));

    if (!p1Name || !p2Name) {
      return { inserts: [] as PairInsert[], error: `Level CSV row ${rowNum}: missing player name.` };
    }
    if (!LEVELS.has(p1Level) || !LEVELS.has(p2Level)) {
      return {
        inserts: [] as PairInsert[],
        error: `Level CSV row ${rowNum}: invalid level (expected Team 1-6 or Rec).`,
      };
    }
    if (!g1 || !g2) {
      return {
        inserts: [] as PairInsert[],
        error: `Level CSV row ${rowNum}: gender must be Male or Female.`,
      };
    }
    if (p1Name.toLowerCase() === p2Name.toLowerCase()) {
      return { inserts: [] as PairInsert[], error: `Level CSV row ${rowNum}: players must be different.` };
    }
    if (g1 !== g2) {
      return {
        inserts: [] as PairInsert[],
        error: `Level CSV row ${rowNum}: mixed-gender pair found. Put mixed pairs in the mixed CSV.`,
      };
    }

    const levelType: LevelDoublesType = g1 === "female" ? "womens_doubles" : "mens_doubles";
    inserts.push({
      event: "level_doubles",
      level_doubles_type: levelType,
      player_one_name: p1Name,
      player_one_level: p1Level,
      player_two_name: p2Name,
      player_two_level: p2Level,
      pair_strength: strengthFor({
        event: "level_doubles",
        levelType,
        p1: p1Level,
        p2: p2Level,
      }),
    });
  }

  return { inserts, error: null as string | null };
}

export async function POST(req: NextRequest) {
  const redirectTo = (path: string) =>
    NextResponse.redirect(new URL(path, getBaseUrl(req)), 303);

  const guard = await requireAdmin();
  if (!guard.ok) {
    const status = guard.reason === "not_logged_in" ? 401 : 403;
    const error = guard.reason === "not_logged_in" ? "Unauthorized" : "Forbidden";
    return NextResponse.json({ error }, { status });
  }

  const form = await req.formData();
  const redirect = String(form.get("redirect") ?? "/admin/club-champs");

  const levelFile = form.get("level_csv");
  const mixedFile = form.get("mixed_csv");

  if (!(levelFile instanceof File) && !(mixedFile instanceof File)) {
    return redirectTo(`/admin/club-champs?error=Upload+at+least+one+CSV+file`);
  }

  const levelColumns = {
    playerOneName: mappingValue(form, "level_col_player_one_name", DEFAULT_LEVEL_COLUMNS.playerOneName),
    playerOneLevel: mappingValue(form, "level_col_player_one_level", DEFAULT_LEVEL_COLUMNS.playerOneLevel),
    playerOneGender: mappingValue(form, "level_col_player_one_gender", DEFAULT_LEVEL_COLUMNS.playerOneGender),
    playerTwoName: mappingValue(form, "level_col_player_two_name", DEFAULT_LEVEL_COLUMNS.playerTwoName),
    playerTwoLevel: mappingValue(form, "level_col_player_two_level", DEFAULT_LEVEL_COLUMNS.playerTwoLevel),
    playerTwoGender: mappingValue(form, "level_col_player_two_gender", DEFAULT_LEVEL_COLUMNS.playerTwoGender),
  };

  const mixedColumns = {
    playerOneName: mappingValue(form, "mixed_col_player_one_name", DEFAULT_MIXED_COLUMNS.playerOneName),
    playerOneLevel: mappingValue(form, "mixed_col_player_one_level", DEFAULT_MIXED_COLUMNS.playerOneLevel),
    playerTwoName: mappingValue(form, "mixed_col_player_two_name", DEFAULT_MIXED_COLUMNS.playerTwoName),
    playerTwoLevel: mappingValue(form, "mixed_col_player_two_level", DEFAULT_MIXED_COLUMNS.playerTwoLevel),
  };

  let levelInserts: PairInsert[] = [];
  let mixedInserts: PairInsert[] = [];
  const eventsToReplace: EventType[] = [];

  if (levelFile instanceof File && levelFile.size > 0) {
    const text = await levelFile.text();
    const parsed = parseLevelCsv({ content: text, columns: levelColumns });
    if (parsed.error) {
      return redirectTo(`/admin/club-champs?error=${encodeURIComponent(parsed.error)}`);
    }
    levelInserts = parsed.inserts;
    eventsToReplace.push("level_doubles");
  }

  if (mixedFile instanceof File && mixedFile.size > 0) {
    const text = await mixedFile.text();
    const parsed = parseMixedCsv({ content: text, columns: mixedColumns });
    if (parsed.error) {
      return redirectTo(`/admin/club-champs?error=${encodeURIComponent(parsed.error)}`);
    }
    mixedInserts = parsed.inserts;
    eventsToReplace.push("mixed_doubles");
  }

  const inserts = [...levelInserts, ...mixedInserts];
  if (inserts.length === 0) {
    return redirectTo(`/admin/club-champs?error=No+rows+found+to+import`);
  }

  const db = supabaseServer();
  // Replace mode: clear downstream data only for uploaded event files.
  const { error: clearKnockoutError } = await db
    .from("club_champs_knockout_matches")
    .delete()
    .in("event", eventsToReplace);
  if (clearKnockoutError) {
    return redirectTo(`/admin/club-champs?error=${encodeURIComponent(clearKnockoutError.message)}`);
  }

  const { error: clearPoolsError } = await db
    .from("club_champs_pool_matches")
    .delete()
    .in("event", eventsToReplace);
  if (clearPoolsError) {
    return redirectTo(`/admin/club-champs?error=${encodeURIComponent(clearPoolsError.message)}`);
  }

  const { error: clearPairsError } = await db
    .from("club_champs_pairs")
    .delete()
    .in("event", eventsToReplace);
  if (clearPairsError) {
    return redirectTo(`/admin/club-champs?error=${encodeURIComponent(clearPairsError.message)}`);
  }

  const { error } = await db.from("club_champs_pairs").insert(inserts);

  if (error) {
    return redirectTo(`/admin/club-champs?error=${encodeURIComponent(error.message)}`);
  }

  const successUrl = `${redirect}${redirect.includes("?") ? "&" : "?"}imported=1&imported_level=${
    levelInserts.length
  }&imported_mixed=${mixedInserts.length}`;
  return redirectTo(successUrl);
}

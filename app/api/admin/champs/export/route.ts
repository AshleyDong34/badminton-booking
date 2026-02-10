import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { supabaseServer } from "@/lib/supabase-server";
import { requireAdmin } from "@/lib/adminGuard";
import {
  EVENT_LABEL,
  computeEventFromPools,
  knockoutStageLabel,
  pairLabel,
  type EventType,
  type PairRow,
  type PoolMatchRow,
} from "@/lib/club-champs-knockout";

export const runtime = "nodejs";

type KnockoutMatchRow = {
  id: string;
  event: EventType;
  stage: number;
  match_order: number;
  pair_a_id: string | null;
  pair_b_id: string | null;
  pair_a_score: number | null;
  pair_b_score: number | null;
  winner_pair_id: string | null;
  best_of: 1 | 3;
  is_unlocked: boolean;
};

const levelFill = {
  type: "pattern" as const,
  pattern: "solid" as const,
  fgColor: { argb: "FFE9F2FF" },
};
const mixedFill = {
  type: "pattern" as const,
  pattern: "solid" as const,
  fgColor: { argb: "FFE9FAF1" },
};
const okFill = {
  type: "pattern" as const,
  pattern: "solid" as const,
  fgColor: { argb: "FFDDF5E6" },
};
const warnFill = {
  type: "pattern" as const,
  pattern: "solid" as const,
  fgColor: { argb: "FFFFF0D6" },
};
const mutedFill = {
  type: "pattern" as const,
  pattern: "solid" as const,
  fgColor: { argb: "FFF0F2F5" },
};

function addHeaderRow(sheet: ExcelJS.Worksheet, labels: string[]) {
  const row = sheet.addRow(labels);
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1D3B5A" },
    };
    cell.alignment = { vertical: "middle", horizontal: "left" };
    cell.border = {
      top: { style: "thin", color: { argb: "FFCBD5E1" } },
      left: { style: "thin", color: { argb: "FFCBD5E1" } },
      bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
      right: { style: "thin", color: { argb: "FFCBD5E1" } },
    };
  });
  return row;
}

function eventFill(event: EventType) {
  return event === "level_doubles" ? levelFill : mixedFill;
}

function scoreLabel(match: KnockoutMatchRow) {
  if (match.pair_a_score == null || match.pair_b_score == null) return "Pending";
  if (match.best_of === 3) return `Games won ${match.pair_a_score}-${match.pair_b_score}`;
  return `${match.pair_a_score}-${match.pair_b_score}`;
}

function safePairLabel(pairId: string | null, pairById: Map<string, PairRow>) {
  if (!pairId) return "";
  const pair = pairById.get(pairId);
  if (!pair) return `Unknown pair (${pairId.slice(0, 8)})`;
  return pairLabel(pair);
}

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) {
    const status = guard.reason === "not_logged_in" ? 401 : 403;
    const error = guard.reason === "not_logged_in" ? "Unauthorized" : "Forbidden";
    return NextResponse.json({ error }, { status });
  }

  const db = supabaseServer();
  const [{ data: pairData, error: pairError }, { data: poolData, error: poolError }, { data: knockoutData, error: knockoutError }] =
    await Promise.all([
      db
        .from("club_champs_pairs")
        .select(
          "id,event,player_one_name,player_one_level,player_two_name,player_two_level,pair_strength,seed_order"
        )
        .order("event", { ascending: true })
        .order("seed_order", { ascending: true }),
      db
        .from("club_champs_pool_matches")
        .select("id,event,pool_number,match_order,pair_a_id,pair_b_id,pair_a_score,pair_b_score")
        .order("event", { ascending: true })
        .order("pool_number", { ascending: true })
        .order("match_order", { ascending: true }),
      db
        .from("club_champs_knockout_matches")
        .select("id,event,stage,match_order,pair_a_id,pair_b_id,pair_a_score,pair_b_score,winner_pair_id,best_of,is_unlocked")
        .order("event", { ascending: true })
        .order("stage", { ascending: true })
        .order("match_order", { ascending: true }),
    ]);

  if (pairError) return NextResponse.json({ error: pairError.message }, { status: 500 });
  if (poolError) return NextResponse.json({ error: poolError.message }, { status: 500 });
  if (knockoutError) return NextResponse.json({ error: knockoutError.message }, { status: 500 });

  const pairs = (pairData ?? []) as PairRow[];
  const poolMatches = (poolData ?? []) as PoolMatchRow[];
  const knockoutMatches = (knockoutData ?? []) as KnockoutMatchRow[];
  const pairById = new Map(pairs.map((pair) => [pair.id, pair]));

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "EUBC Badminton";
  workbook.created = new Date();

  const summary = workbook.addWorksheet("Summary");
  summary.columns = [
    { header: "Section", key: "section", width: 26 },
    { header: "Level doubles", key: "level", width: 18 },
    { header: "Mixed doubles", key: "mixed", width: 18 },
    { header: "Notes", key: "notes", width: 44 },
  ];
  addHeaderRow(summary, ["Section", "Level doubles", "Mixed doubles", "Notes"]);
  summary.addRow(["Export generated", new Date().toLocaleString("en-GB"), "", "Club Champs full data export"]);

  for (const event of ["level_doubles", "mixed_doubles"] as const) {
    const eventPairs = pairs.filter((pair) => pair.event === event);
    const eventPools = poolMatches.filter((match) => match.event === event);
    const scoredPools = eventPools.filter((match) => match.pair_a_score != null && match.pair_b_score != null).length;
    const eventKnockout = knockoutMatches.filter((match) => match.event === event);
    const completedKnockout = eventKnockout.filter((match) => match.winner_pair_id != null).length;
    const maxStage = eventKnockout.length > 0 ? Math.max(...eventKnockout.map((match) => match.stage)) : 0;
    const winnerId =
      eventKnockout.find((match) => match.stage === maxStage && match.winner_pair_id)?.winner_pair_id ?? null;

    summary.addRow([
      `${EVENT_LABEL[event]} pairs`,
      event === "level_doubles" ? eventPairs.length : "",
      event === "mixed_doubles" ? eventPairs.length : "",
      "",
    ]);
    summary.addRow([
      `${EVENT_LABEL[event]} pool results`,
      event === "level_doubles" ? `${scoredPools}/${eventPools.length}` : "",
      event === "mixed_doubles" ? `${scoredPools}/${eventPools.length}` : "",
      "Scored/total pool fixtures",
    ]);
    summary.addRow([
      `${EVENT_LABEL[event]} knockout`,
      event === "level_doubles" ? `${completedKnockout}/${eventKnockout.length}` : "",
      event === "mixed_doubles" ? `${completedKnockout}/${eventKnockout.length}` : "",
      winnerId ? `Winner: ${safePairLabel(winnerId, pairById)}` : "Winner pending",
    ]);
  }

  const pairsSheet = workbook.addWorksheet("Pair entries");
  pairsSheet.columns = [
    { header: "Event", key: "event", width: 18 },
    { header: "Seed", key: "seed", width: 10 },
    { header: "Pair", key: "pair", width: 42 },
    { header: "Pair strength", key: "strength", width: 16 },
  ];
  addHeaderRow(pairsSheet, ["Event", "Seed", "Pair", "Pair strength"]);
  for (const row of pairs) {
    const inserted = pairsSheet.addRow([
      EVENT_LABEL[row.event],
      row.seed_order ?? "",
      pairLabel(row),
      row.pair_strength ?? "",
    ]);
    inserted.eachCell((cell) => {
      cell.fill = eventFill(row.event);
    });
  }
  if (pairs.length === 0) {
    pairsSheet.addRow(["No data", "", "", ""]);
  }

  const standingsSheet = workbook.addWorksheet("Pool standings");
  standingsSheet.columns = [
    { header: "Event", key: "event", width: 18 },
    { header: "Pool", key: "pool", width: 12 },
    { header: "Rank", key: "rank", width: 8 },
    { header: "Pair", key: "pair", width: 42 },
    { header: "Wins", key: "wins", width: 10 },
    { header: "Losses", key: "losses", width: 10 },
    { header: "For", key: "for", width: 10 },
    { header: "Against", key: "against", width: 10 },
    { header: "Diff", key: "diff", width: 10 },
  ];
  addHeaderRow(standingsSheet, ["Event", "Pool", "Rank", "Pair", "Wins", "Losses", "For", "Against", "Diff"]);

  for (const event of ["level_doubles", "mixed_doubles"] as const) {
    const eventPairs = pairs.filter((pair) => pair.event === event);
    const eventPools = poolMatches.filter((match) => match.event === event);
    const computed = computeEventFromPools({
      event,
      pairs,
      matches: poolMatches,
      advanceCount: eventPairs.length,
    });
    if (computed.poolRows.length === 0) continue;

    for (const poolRow of computed.poolRows) {
      for (const standing of poolRow.standings) {
        const row = standingsSheet.addRow([
          EVENT_LABEL[event],
          `Pool ${poolRow.poolNumber}`,
          standing.poolRank,
          pairLabel(standing.pair),
          standing.wins,
          standing.losses,
          standing.pointsFor,
          standing.pointsAgainst,
          standing.pointDiff,
        ]);
        row.eachCell((cell) => {
          cell.fill = eventFill(event);
        });
      }
    }
    if (eventPools.length > 0) {
      standingsSheet.addRow([]);
    }
  }
  if (standingsSheet.rowCount <= 1) {
    standingsSheet.addRow(["No data", "", "", "", "", "", "", "", ""]);
  }

  const poolSheet = workbook.addWorksheet("Pool matches");
  poolSheet.columns = [
    { header: "Event", key: "event", width: 18 },
    { header: "Pool", key: "pool", width: 10 },
    { header: "Match", key: "match", width: 10 },
    { header: "Pair A", key: "a", width: 30 },
    { header: "Pair B", key: "b", width: 30 },
    { header: "Score A", key: "sa", width: 10 },
    { header: "Score B", key: "sb", width: 10 },
    { header: "Status", key: "status", width: 14 },
  ];
  addHeaderRow(poolSheet, ["Event", "Pool", "Match", "Pair A", "Pair B", "Score A", "Score B", "Status"]);
  for (const match of poolMatches) {
    const scored = match.pair_a_score != null && match.pair_b_score != null;
      const row = poolSheet.addRow([
        EVENT_LABEL[match.event],
        match.pool_number,
        match.match_order,
        safePairLabel(match.pair_a_id, pairById),
        safePairLabel(match.pair_b_id, pairById),
        match.pair_a_score ?? "",
        match.pair_b_score ?? "",
        scored ? "Scored" : "Pending",
    ]);
    row.eachCell((cell) => {
      cell.fill = scored ? okFill : warnFill;
    });
  }
  if (poolMatches.length === 0) {
    poolSheet.addRow(["No data", "", "", "", "", "", "", ""]);
  }

  const knockoutSheet = workbook.addWorksheet("Knockout");
  knockoutSheet.columns = [
    { header: "Event", key: "event", width: 18 },
    { header: "Stage", key: "stage", width: 18 },
    { header: "Match", key: "match", width: 10 },
    { header: "Pair A", key: "a", width: 30 },
    { header: "Pair B", key: "b", width: 30 },
    { header: "Format", key: "format", width: 12 },
    { header: "Result", key: "result", width: 20 },
    { header: "Winner", key: "winner", width: 30 },
    { header: "Status", key: "status", width: 14 },
  ];
  addHeaderRow(knockoutSheet, ["Event", "Stage", "Match", "Pair A", "Pair B", "Format", "Result", "Winner", "Status"]);
  for (const event of ["level_doubles", "mixed_doubles"] as const) {
    const eventRows = knockoutMatches.filter((row) => row.event === event);
    const totalStages = eventRows.length > 0 ? Math.max(...eventRows.map((row) => row.stage)) : 0;
    for (const row of eventRows) {
      const status = row.winner_pair_id ? "Complete" : row.is_unlocked ? "Open" : "Locked";
      const inserted = knockoutSheet.addRow([
        EVENT_LABEL[event],
        knockoutStageLabel(row.stage, totalStages),
        row.match_order,
        safePairLabel(row.pair_a_id, pairById),
        safePairLabel(row.pair_b_id, pairById),
        row.best_of === 3 ? "Best of 3" : "1 game",
        scoreLabel(row),
        safePairLabel(row.winner_pair_id, pairById),
        status,
      ]);

      inserted.eachCell((cell) => {
        if (status === "Complete") {
          cell.fill = okFill;
        } else if (status === "Open") {
          cell.fill = warnFill;
        } else {
          cell.fill = mutedFill;
        }
      });
    }
    if (eventRows.length > 0) knockoutSheet.addRow([]);
  }
  if (knockoutMatches.length === 0) {
    knockoutSheet.addRow(["No data", "", "", "", "", "", "", "", ""]);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `club-champs-export-${new Date().toISOString().slice(0, 10)}.xlsx`;

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename=\"${filename}\"`,
    },
  });
}

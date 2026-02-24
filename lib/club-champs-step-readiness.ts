import "server-only";
import { supabaseServer } from "@/lib/supabase-server";

type EventType = "level_doubles" | "mixed_doubles";
const EVENTS: EventType[] = ["level_doubles", "mixed_doubles"];

type ReadinessMap = {
  hasPairs: boolean;
  seeding: boolean;
  pools: boolean;
  knockoutSetup: boolean;
  knockoutMatches: boolean;
  finalize: boolean;
};

function initEventCounts() {
  return {
    level_doubles: 0,
    mixed_doubles: 0,
  } satisfies Record<EventType, number>;
}

export async function getClubChampsStepReadiness(): Promise<ReadinessMap> {
  const db = supabaseServer();

  const [{ data: pairRows, error: pairError }, { data: poolRows, error: poolError }, { data: knockoutRows, error: knockoutError }] =
    await Promise.all([
      db.from("club_champs_pairs").select("event,seed_order"),
      db.from("club_champs_pool_matches").select("event"),
      db.from("club_champs_knockout_matches").select("event"),
    ]);

  if (pairError || poolError || knockoutError) {
    // Fail-open so admin navigation is never blocked by transient DB errors.
    return {
      hasPairs: true,
      seeding: true,
      pools: true,
      knockoutSetup: true,
      knockoutMatches: true,
      finalize: true,
    };
  }

  const pairCountByEvent = initEventCounts();
  const seededCountByEvent = initEventCounts();
  for (const row of pairRows ?? []) {
    const event = row.event as EventType;
    if (!EVENTS.includes(event)) continue;
    pairCountByEvent[event] += 1;
    // Treat only positive integers as "seeded".
    const seed =
      typeof row.seed_order === "number"
        ? row.seed_order
        : Number(row.seed_order);
    if (Number.isInteger(seed) && seed >= 1) {
      seededCountByEvent[event] += 1;
    }
  }

  const poolCountByEvent = initEventCounts();
  for (const row of poolRows ?? []) {
    const event = row.event as EventType;
    if (!EVENTS.includes(event)) continue;
    poolCountByEvent[event] += 1;
  }

  const knockoutCountByEvent = initEventCounts();
  for (const row of knockoutRows ?? []) {
    const event = row.event as EventType;
    if (!EVENTS.includes(event)) continue;
    knockoutCountByEvent[event] += 1;
  }

  const hasPairs = EVENTS.some((event) => pairCountByEvent[event] > 0);
  const poolsReady =
    hasPairs &&
    EVENTS.every((event) => {
      const total = pairCountByEvent[event];
      if (total === 0) return true;
      return seededCountByEvent[event] === total;
    });

  const knockoutSetupReady =
    poolsReady &&
    EVENTS.every((event) => {
      const total = pairCountByEvent[event];
      if (total === 0) return true;
      return poolCountByEvent[event] > 0;
    });

  const knockoutMatchesReady =
    knockoutSetupReady &&
    EVENTS.every((event) => {
      const total = pairCountByEvent[event];
      if (total === 0) return true;
      return knockoutCountByEvent[event] > 0;
    });

  return {
    hasPairs,
    seeding: hasPairs,
    pools: poolsReady,
    knockoutSetup: knockoutSetupReady,
    knockoutMatches: knockoutMatchesReady,
    finalize: knockoutMatchesReady,
  };
}

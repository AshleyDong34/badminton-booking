import { supabaseServer } from "@/lib/supabase-server";
import { EVENT_LABEL, type EventType, type PairRow } from "@/lib/club-champs-knockout";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type KnockoutMatchRow = {
  id: string;
  event: EventType;
  stage: number;
  match_order: number;
  pair_a_id: string | null;
  pair_b_id: string | null;
  pair_a_score: number | null;
  pair_b_score: number | null;
  game_scores: { games: Array<{ a: number | null; b: number | null }> } | null;
  winner_pair_id: string | null;
  best_of: 1 | 3;
  is_unlocked: boolean;
};

const events: EventType[] = ["level_doubles", "mixed_doubles"];
const CARD_HEIGHT = 126;
const COLUMN_WIDTH = 270;
const CONNECTOR_WIDTH = 58;

function pairNames(pair: PairRow | undefined) {
  if (!pair) return "TBD";
  return `${pair.player_one_name} + ${pair.player_two_name}`;
}

function gameSummary(match: KnockoutMatchRow) {
  const games = (match.game_scores?.games ?? []).filter(
    (game) => game.a !== null && game.b !== null
  );
  if (games.length === 0) return null;
  return games.map((game, index) => `G${index + 1}: ${game.a}-${game.b}`).join(" | ");
}

function scoreSummary(match: KnockoutMatchRow) {
  if (match.pair_a_score === null || match.pair_b_score === null) return "Pending";
  if (match.best_of === 3) return `Games won: ${match.pair_a_score}-${match.pair_b_score}`;
  return `Score: ${match.pair_a_score}-${match.pair_b_score}`;
}

function byStage(rows: KnockoutMatchRow[]) {
  const map = new Map<number, KnockoutMatchRow[]>();
  for (const row of rows) {
    const list = map.get(row.stage) ?? [];
    list.push(row);
    map.set(row.stage, list);
  }
  return Array.from(map.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([stage, matches]) => ({
      stage,
      matches: [...matches].sort((a, b) => a.match_order - b.match_order),
    }));
}

function centerPercent(index: number, total: number) {
  return ((2 * index + 1) / (2 * total)) * 100;
}

function stageLabelByIndex(stageIndex: number, totalStages: number, matchCount: number) {
  if (stageIndex === totalStages - 1) return "Final";
  if (stageIndex === totalStages - 2) return "Semifinal";
  if (stageIndex === totalStages - 3) return "Quarterfinal";
  return `Round of ${matchCount * 2}`;
}

function sideLabel(args: {
  pairId: string | null;
  otherPairId: string | null;
  isFirstStage: boolean;
  pairById: Map<string, PairRow>;
}) {
  const { pairId, otherPairId, isFirstStage, pairById } = args;
  if (pairId) return pairNames(pairById.get(pairId));
  if (isFirstStage && otherPairId) return "BYE";
  return "TBD";
}

function ConnectorColumn({
  prevCount,
  nextCount,
  heightPx,
}: {
  prevCount: number;
  nextCount: number;
  heightPx: number;
}) {
  if (prevCount === 0 || nextCount === 0) return null;

  return (
    <div
      className="relative shrink-0"
      style={{ width: CONNECTOR_WIDTH, height: `${heightPx}px` }}
      aria-hidden
    >
      {Array.from({ length: nextCount }, (_, i) => {
        const sourceA = 2 * i;
        const sourceB = 2 * i + 1;
        const y1 = centerPercent(sourceA, prevCount);
        const y2 = centerPercent(sourceB, prevCount);
        const yTarget = centerPercent(i, nextCount);
        const top = Math.min(y1, y2);
        const lineHeight = Math.abs(y2 - y1);

        return (
          <div key={`conn-${i}`}>
            <div
              className="absolute left-0 border-t border-[var(--line)]"
              style={{
                top: `${y1}%`,
                width: `${CONNECTOR_WIDTH * 0.45}px`,
                transform: "translateY(-50%)",
              }}
            />
            <div
              className="absolute left-0 border-t border-[var(--line)]"
              style={{
                top: `${y2}%`,
                width: `${CONNECTOR_WIDTH * 0.45}px`,
                transform: "translateY(-50%)",
              }}
            />
            <div
              className="absolute border-l border-[var(--line)]"
              style={{
                left: `${CONNECTOR_WIDTH * 0.45}px`,
                top: `${top}%`,
                height: `${lineHeight}%`,
              }}
            />
            <div
              className="absolute border-t border-[var(--line)]"
              style={{
                left: `${CONNECTOR_WIDTH * 0.45}px`,
                top: `${yTarget}%`,
                width: `${CONNECTOR_WIDTH * 0.55}px`,
                transform: "translateY(-50%)",
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

function EventBracket({
  event,
  pairs,
  matches,
}: {
  event: EventType;
  pairs: PairRow[];
  matches: KnockoutMatchRow[];
}) {
  const eventRows = matches.filter((match) => match.event === event);
  const pairById = new Map(pairs.map((pair) => [pair.id, pair]));

  if (eventRows.length === 0) {
    return (
      <section className="space-y-3 rounded-2xl border border-[var(--line)] bg-[var(--card)] p-5 shadow-sm">
        <h2 className="text-lg font-semibold">{EVENT_LABEL[event]}</h2>
        <p className="rounded-xl border border-[var(--line)] bg-[var(--chip)] px-4 py-3 text-sm text-[var(--muted)]">
          No updates yet.
        </p>
      </section>
    );
  }

  const stages = byStage(eventRows);
  const totalStages = stages.length;
  const stageOneMatches = stages[0]?.matches.length ?? 1;
  const bracketHeight = Math.max(stageOneMatches * 160, 220);
  const finalWinnerId =
    stages[totalStages - 1]?.matches.find((match) => match.winner_pair_id)?.winner_pair_id ??
    null;

  return (
    <section className="space-y-4 rounded-2xl border border-[var(--line)] bg-[var(--card)] p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{EVENT_LABEL[event]}</h2>
        <div className="text-sm">
          {finalWinnerId ? (
            <span className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-1 font-semibold text-emerald-700">
              Winner: {pairNames(pairById.get(finalWinnerId))}
            </span>
          ) : (
            <span className="text-[var(--muted)]">Winner not decided yet</span>
          )}
        </div>
      </div>

      <div className="overflow-x-auto pb-2">
        <div className="inline-block min-w-full">
          <div className="mb-2 flex items-end">
            {stages.map(({ matches: stageMatches }, stageIndex) => (
              <div key={`head-${event}-${stageIndex}`} className="contents">
                <div
                  className="shrink-0 px-1"
                  style={{ width: `${COLUMN_WIDTH}px` }}
                >
                  <h3 className="rounded-xl border border-[var(--line)] bg-[var(--chip)] px-3 py-2 text-sm font-semibold">
                    {stageLabelByIndex(stageIndex, totalStages, stageMatches.length)}
                  </h3>
                </div>
                {stageIndex < stages.length - 1 && (
                  <div
                    className="shrink-0"
                    style={{ width: `${CONNECTOR_WIDTH}px` }}
                  />
                )}
              </div>
            ))}
          </div>

          <div className="flex">
            {stages.map(({ stage, matches: stageMatches }, stageIndex) => (
              <div key={`col-${event}-${stage}`} className="contents">
                <div
                  className="relative shrink-0"
                  style={{ width: `${COLUMN_WIDTH}px`, height: `${bracketHeight}px` }}
                >
                  {stageMatches.map((match, matchIndex) => {
                    const topPercent = centerPercent(matchIndex, stageMatches.length);
                    const isFirstStage = stageIndex === 0;
                    const pairALabel = sideLabel({
                      pairId: match.pair_a_id,
                      otherPairId: match.pair_b_id,
                      isFirstStage,
                      pairById,
                    });
                    const pairBLabel = sideLabel({
                      pairId: match.pair_b_id,
                      otherPairId: match.pair_a_id,
                      isFirstStage,
                      pairById,
                    });
                    const gameText = gameSummary(match);
                    const winnerId = match.winner_pair_id;

                    return (
                      <article
                        key={match.id}
                        className={`absolute left-0 right-0 rounded-xl border p-3 text-sm shadow-sm ${
                          winnerId
                            ? "border-emerald-300 bg-emerald-50/50"
                            : match.is_unlocked
                            ? "border-[var(--line)] bg-white"
                            : "border-[var(--line)] bg-slate-50"
                        }`}
                        style={{
                          top: `calc(${topPercent}% - ${CARD_HEIGHT / 2}px)`,
                          minHeight: `${CARD_HEIGHT}px`,
                        }}
                      >
                        <div className="mb-1 text-xs text-[var(--muted)]">
                          Match {match.match_order}
                        </div>
                        <div
                          className={
                            winnerId === match.pair_a_id
                              ? "font-semibold text-emerald-700"
                              : ""
                          }
                        >
                          {pairALabel}
                        </div>
                        <div
                          className={
                            winnerId === match.pair_b_id
                              ? "font-semibold text-emerald-700"
                              : ""
                          }
                        >
                          {pairBLabel}
                        </div>
                        <div className="mt-1 text-xs font-semibold text-[var(--muted)]">
                          {scoreSummary(match)}
                        </div>
                        {gameText && (
                          <div className="mt-1 text-xs text-[var(--muted)]">{gameText}</div>
                        )}
                      </article>
                    );
                  })}
                </div>
                {stageIndex < stages.length - 1 && (
                  <ConnectorColumn
                    prevCount={stageMatches.length}
                    nextCount={stages[stageIndex + 1].matches.length}
                    heightPx={bracketHeight}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export default async function PublicClubChampsKnockoutPage() {
  const db = supabaseServer();
  const [{ data: pairData }, { data: matchData }] = await Promise.all([
    db
      .from("club_champs_pairs")
      .select(
        "id,event,player_one_name,player_one_level,player_two_name,player_two_level,pair_strength,seed_order"
      ),
    db
      .from("club_champs_knockout_matches")
      .select(
        "id,event,stage,match_order,pair_a_id,pair_b_id,pair_a_score,pair_b_score,game_scores,winner_pair_id,best_of,is_unlocked"
      )
      .order("event", { ascending: true })
      .order("stage", { ascending: true })
      .order("match_order", { ascending: true }),
  ]);

  const pairs = (pairData ?? []) as PairRow[];
  const matches = (matchData ?? []) as KnockoutMatchRow[];

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-5 shadow-sm">
        <h1 className="text-xl font-semibold">Knockout bracket</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Sideways tournament bracket with connected rounds and live results.
        </p>
      </section>

      <div className="space-y-4">
        {events.map((event) => (
          <EventBracket key={event} event={event} pairs={pairs} matches={matches} />
        ))}
      </div>
    </div>
  );
}

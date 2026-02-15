import { supabaseServer } from "@/lib/supabase-server";
import { EVENT_LABEL, toLevel, type EventType } from "@/lib/club-champs-knockout";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PairRow = {
  id: string;
  event: EventType;
  level_doubles_type: "mens_doubles" | "womens_doubles" | null;
  player_one_name: string;
  player_one_level: number | string;
  player_two_name: string;
  player_two_level: number | string;
  pair_strength: number | null;
  created_at: string | null;
};

const events: EventType[] = ["level_doubles", "mixed_doubles"];

function sortPairs(a: PairRow, b: PairRow) {
  const createdOrder = (a.created_at ?? "").localeCompare(b.created_at ?? "");
  if (createdOrder !== 0) return createdOrder;
  return `${a.player_one_name} ${a.player_two_name}`.localeCompare(
    `${b.player_one_name} ${b.player_two_name}`
  );
}

function PairingsSection({ event, rows }: { event: EventType; rows: PairRow[] }) {
  const eventRows = [...rows].filter((row) => row.event === event).sort(sortPairs);

  return (
    <section className="space-y-3 rounded-2xl border border-[var(--line)] bg-[var(--card)] p-5 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold text-[var(--cool)]">{EVENT_LABEL[event]}</h2>
        <p className="text-sm text-[var(--muted)]">
          {eventRows.length === 0
            ? "No updates yet."
            : `${eventRows.length} pairs entered.`}
        </p>
      </div>

      {eventRows.length === 0 ? (
        <p className="rounded-xl border border-[var(--line)] bg-[var(--chip)] px-4 py-3 text-sm text-[var(--muted)]">
          No pairings published yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {eventRows.map((row) => (
            <li
              key={row.id}
              className="rounded-xl border border-[var(--line)] bg-white px-4 py-3"
            >
              <div className="text-sm font-medium">
                <span className="text-[var(--cool)]">{row.player_one_name}</span>
                <span className="text-[var(--muted)]">
                  {" "}
                  ({toLevel(row.player_one_level)})
                </span>
                <span className="text-[var(--muted)]"> + </span>
                <span className="text-[var(--ok)]">{row.player_two_name}</span>
                <span className="text-[var(--muted)]">
                  {" "}
                  ({toLevel(row.player_two_level)})
                </span>
              </div>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Pair strength: {row.pair_strength ?? "-"}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function PublicClubChampsPairingsPage() {
  const db = supabaseServer();
  const { data } = await db
    .from("club_champs_pairs")
    .select(
      "id,event,level_doubles_type,player_one_name,player_one_level,player_two_name,player_two_level,pair_strength,created_at"
    );

  const rows = (data ?? []) as PairRow[];

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-5 shadow-sm">
        <h1 className="text-xl font-semibold text-[var(--cool)]">Pairings</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Published pair entries for Club Champs events.
        </p>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {events.map((event) => (
          <PairingsSection key={event} event={event} rows={rows} />
        ))}
      </div>
    </div>
  );
}

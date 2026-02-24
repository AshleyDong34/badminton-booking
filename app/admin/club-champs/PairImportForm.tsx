export default function PairImportForm() {
  return (
    <section className="space-y-3 rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4 shadow-sm">
      <div className="space-y-1">
        <h3 className="text-base font-semibold">Import pairings from CSV</h3>
        <p className="text-sm text-[var(--muted)]">
          Upload one CSV for level doubles and one CSV for mixed doubles. Pair strength is
          calculated automatically using the same logic as manual entry.
        </p>
        <p className="text-sm font-medium text-amber-700">
          This import replaces pairings only for the uploaded event file(s) and resets pools/knockout for those events.
        </p>
        <p className="text-xs text-[var(--muted)]">
          Framework mode: default column names are prefilled below and can be adjusted later.
        </p>
      </div>

      <form
        action="/api/admin/champs/pairs/import"
        method="post"
        encType="multipart/form-data"
        className="space-y-4"
      >
        <input type="hidden" name="redirect" value="/admin/club-champs" />

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-[var(--muted)]">
              Level doubles CSV
            </label>
            <input
              type="file"
              name="level_csv"
              accept=".csv,text/csv"
              className="mt-1 block w-full rounded-xl border border-[var(--line)] bg-white p-2 text-sm"
            />
            <p className="mt-1 text-xs text-[var(--muted)]">
              Uses gender columns to classify rows into men&apos;s or women&apos;s doubles.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--muted)]">
              Mixed doubles CSV
            </label>
            <input
              type="file"
              name="mixed_csv"
              accept=".csv,text/csv"
              className="mt-1 block w-full rounded-xl border border-[var(--line)] bg-white p-2 text-sm"
            />
            <p className="mt-1 text-xs text-[var(--muted)]">
              Imports as mixed doubles entries.
            </p>
          </div>
        </div>

        <details className="rounded-xl border border-[var(--line)] bg-[var(--chip)] p-3">
          <summary className="cursor-pointer text-sm font-medium">
            Column mapping (optional)
          </summary>
          <p className="mt-2 text-xs text-[var(--muted)]">
            You can change these now or later when you provide final column names.
          </p>

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="space-y-2 rounded-xl border border-[var(--line)] bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
                Level CSV columns
              </p>
              <MappingInput
                name="level_col_player_one_name"
                label="Player 1 name"
                defaultValue="player_one_name"
              />
              <MappingInput
                name="level_col_player_one_level"
                label="Player 1 level"
                defaultValue="player_one_level"
              />
              <MappingInput
                name="level_col_player_one_gender"
                label="Player 1 gender"
                defaultValue="player_one_gender"
              />
              <MappingInput
                name="level_col_player_two_name"
                label="Player 2 name"
                defaultValue="player_two_name"
              />
              <MappingInput
                name="level_col_player_two_level"
                label="Player 2 level"
                defaultValue="player_two_level"
              />
              <MappingInput
                name="level_col_player_two_gender"
                label="Player 2 gender"
                defaultValue="player_two_gender"
              />
            </div>

            <div className="space-y-2 rounded-xl border border-[var(--line)] bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
                Mixed CSV columns
              </p>
              <MappingInput
                name="mixed_col_player_one_name"
                label="Player 1 name"
                defaultValue="player_one_name"
              />
              <MappingInput
                name="mixed_col_player_one_level"
                label="Player 1 level"
                defaultValue="player_one_level"
              />
              <MappingInput
                name="mixed_col_player_two_name"
                label="Player 2 name"
                defaultValue="player_two_name"
              />
              <MappingInput
                name="mixed_col_player_two_level"
                label="Player 2 level"
                defaultValue="player_two_level"
              />
            </div>
          </div>
        </details>

        <button className="rounded-xl bg-[var(--ok)] px-4 py-2 text-sm font-semibold text-white shadow-sm">
          Replace uploaded event pairings
        </button>
      </form>
    </section>
  );
}

function MappingInput({
  name,
  label,
  defaultValue,
}: {
  name: string;
  label: string;
  defaultValue: string;
}) {
  return (
    <label className="block">
      <span className="text-xs text-[var(--muted)]">{label}</span>
      <input
        name={name}
        defaultValue={defaultValue}
        className="mt-1 block w-full rounded-lg border border-[var(--line)] bg-white px-2 py-1.5 text-sm"
      />
    </label>
  );
}

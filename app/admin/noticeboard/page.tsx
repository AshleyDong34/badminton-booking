import type { ReactNode } from "react";
import { supabaseServer } from "@/lib/supabase-server";
import { NoticeboardTextEditor } from "./NoticeboardTextEditor";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type NoticeboardSettings = {
  club_rules_label?: string | null;
  club_rules_description?: string | null;
  club_rules?: string | null;
  useful_info_label?: string | null;
  useful_info_description?: string | null;
  useful_info?: string | null;
  court_updates_label?: string | null;
  court_updates_description?: string | null;
  court_updates?: string | null;
};

type NoticeboardSectionProps = {
  title: string;
  badge?: string;
  intro?: ReactNode;
  labelName: string;
  descriptionName: string;
  bodyName: string;
  bodyLabel?: string;
  defaultLabel: string;
  defaultDescription: string;
  defaultBody: string;
  placeholder: string;
  bodyHelp?: ReactNode;
  className?: string;
};

function NoticeboardSection({
  title,
  badge,
  intro,
  labelName,
  descriptionName,
  bodyName,
  bodyLabel = "Popup content",
  defaultLabel,
  defaultDescription,
  defaultBody,
  placeholder,
  bodyHelp,
  className = "",
}: NoticeboardSectionProps) {
  return (
    <section
      className={`space-y-4 rounded-2xl border border-[var(--line)] bg-[var(--card)] p-6 shadow-sm ${className}`}
    >
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold">{title}</h2>
          {badge && (
            <span className="rounded-full bg-[#fff2cb] px-3 py-1 text-xs font-semibold text-[#8a4b12]">
              {badge}
            </span>
          )}
        </div>
        {intro ?? (
          <p className="mt-1 text-sm text-[var(--muted)]">
            The button text and short description are shown on the public homepage.
          </p>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="block text-sm font-medium">Button name</label>
          <input
            name={labelName}
            type="text"
            required
            defaultValue={defaultLabel}
            className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white p-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Button description</label>
          <input
            name={descriptionName}
            type="text"
            defaultValue={defaultDescription}
            className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white p-2"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium">{bodyLabel}</label>
        <NoticeboardTextEditor
          name={bodyName}
          defaultValue={defaultBody}
          placeholder={placeholder}
        />
        {bodyHelp ?? (
          <p className="mt-1 text-xs text-[var(--muted)]">
            Use the formatting buttons above, or type Markdown directly:
            <code> **bold**</code>, <code>*italic*</code>,{" "}
            <code>- bullet</code>, and <code>[text](https://...)</code>.
          </p>
        )}
      </div>
    </section>
  );
}

export default async function NoticeboardPage() {
  const db = supabaseServer();
  const { data, error } = await db
    .from("settings")
    .select("*")
    .eq("id", 1)
    .single();

  const s = (data ?? {}) as NoticeboardSettings;

  return (
    <div className="max-w-6xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Noticeboard</h1>
        <p className="text-sm text-[var(--muted)]">
          Edit the public notice buttons. Court updates are separate because they
          can trigger an urgent alert on the player homepage.
        </p>
      </div>

      {error && (
        <p className="text-sm text-[var(--muted)]">
          Failed to load noticeboard settings: {error.message}
        </p>
      )}

      <form action="/api/admin/noticeboard" method="post" className="space-y-5">
        <NoticeboardSection
          title="Club rules"
          labelName="club_rules_label"
          descriptionName="club_rules_description"
          bodyName="club_rules"
          defaultLabel={s.club_rules_label ?? "Club Rules"}
          defaultDescription={
            s.club_rules_description ?? "Court Rules and Player Attitude"
          }
          defaultBody={s.club_rules ?? ""}
          placeholder={
            "## Before you play\n- **Bring a racket**\n- Wear court shoes\n- Respect court time"
          }
        />

        <NoticeboardSection
          title="Useful info"
          labelName="useful_info_label"
          descriptionName="useful_info_description"
          bodyName="useful_info"
          defaultLabel={s.useful_info_label ?? "Useful info"}
          defaultDescription={s.useful_info_description ?? "Links for EUBC"}
          defaultBody={s.useful_info ?? ""}
          placeholder={
            "## Useful links\n- [Membership details](https://...)\n- *Location and kit notes*"
          }
        />

        <NoticeboardSection
          title="Court updates"
          badge="Special player alert"
          className="border-[#e3a33e]/70 bg-[#fffaf0] shadow-[0_12px_30px_rgba(138,75,18,0.08)]"
          intro={
            <div className="mt-2 rounded-2xl border border-[#f0d28b] bg-white/70 p-3 text-sm text-[#6d4b18]">
              This section has special behaviour. If the update message below has
              any text, the Court Updates button on the public homepage lights up
              and wiggles until that player opens it. Clear the message when
              there are no sudden court changes.
            </div>
          }
          labelName="court_updates_label"
          descriptionName="court_updates_description"
          bodyName="court_updates"
          bodyLabel="Urgent update message"
          defaultLabel={s.court_updates_label ?? "Court updates"}
          defaultDescription={s.court_updates_description ?? "No sudden updates"}
          defaultBody={s.court_updates ?? ""}
          placeholder={
            "## Tonight's court update\n- **Court 3 unavailable tonight**\n- Extra court added at 7pm"
          }
          bodyHelp={
            <p className="mt-1 text-xs text-[var(--muted)]">
              Leave this empty for the public button to say{" "}
              <strong>No sudden updates</strong>. Adding text triggers the
              urgency style for each player until they open the update. The
              formatting buttons support links, bold, italic, headings, and
              lists.
            </p>
          }
        />

        <button className="rounded-xl bg-[var(--ok)] px-4 py-2 text-sm font-semibold text-white shadow-sm">
          Save noticeboard
        </button>
      </form>
    </div>
  );
}

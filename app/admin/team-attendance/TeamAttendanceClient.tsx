"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

export type TeamGender = "mens" | "womens";
type TeamTab = "members" | "attendance" | "past";

export type TeamMember = {
  id: string;
  name: string;
  email: string | null;
  gender: TeamGender;
  team_number: number;
  is_active: boolean;
};

export type TeamAttendanceRecord = {
  member_id: string;
  attended: boolean;
  marked_at: string | null;
};

type TeamAttendanceClientProps = {
  weekStart: string;
  weekRange: string;
  previousWeek: string;
  nextWeek: string;
  currentWeek: string;
  defaultExportFrom: string;
  initialTab: string;
  initialGender: string;
  pastWeeks: string[];
  members: TeamMember[];
  initialAttendance: TeamAttendanceRecord[];
};

const TEAM_NUMBERS = [1, 2, 3, 4, 5, 6];
const GENDERS: { value: TeamGender; label: string; shortLabel: string }[] = [
  { value: "mens", label: "Men's teams", shortLabel: "Men's" },
  { value: "womens", label: "Women's teams", shortLabel: "Women's" },
];

const TAB_META: { value: TeamTab; label: string; description: string }[] = [
  {
    value: "attendance",
    label: "Weekly attendance",
    description: "Mark this week's training",
  },
  {
    value: "members",
    label: "Manage teams",
    description: "Add and remove players",
  },
  {
    value: "past",
    label: "Past attendance",
    description: "Open old weeks or export Excel",
  },
];

function normaliseTab(value: string): TeamTab {
  if (value === "members" || value === "past") return value;
  return "attendance";
}

function normaliseGender(value: string): TeamGender {
  return value === "womens" ? "womens" : "mens";
}

function groupLabel(gender: TeamGender, teamNumber: number) {
  const genderLabel = gender === "mens" ? "Men's" : "Women's";
  return `${genderLabel} Team ${teamNumber}`;
}

function formatShortWeek(weekStart: string) {
  const start = new Date(`${weekStart}T00:00:00.000Z`);
  const end = new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000);
  return `${start.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  })} - ${end.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  })}`;
}

function GenderToggle({
  activeGender,
  setActiveGender,
}: {
  activeGender: TeamGender;
  setActiveGender: (gender: TeamGender) => void;
}) {
  return (
    <div className="flex rounded-full border border-[var(--line)] bg-white p-1 shadow-sm">
      {GENDERS.map((gender) => (
        <button
          key={gender.value}
          type="button"
          onClick={() => setActiveGender(gender.value)}
          className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
            activeGender === gender.value
              ? "bg-[var(--cool)] text-white"
              : "text-[var(--muted)]"
          }`}
        >
          {gender.shortLabel}
        </button>
      ))}
    </div>
  );
}

function TeamTabs({
  activeTab,
  setActiveTab,
}: {
  activeTab: TeamTab;
  setActiveTab: (tab: TeamTab) => void;
}) {
  return (
    <div className="grid gap-2 md:grid-cols-3">
      {TAB_META.map((tab) => {
        const isActive = activeTab === tab.value;
        return (
          <button
            key={tab.value}
            type="button"
            onClick={() => setActiveTab(tab.value)}
            className={`rounded-2xl border p-4 text-left shadow-sm transition ${
              isActive
                ? "border-[var(--cool)] bg-[var(--cool)] text-white"
                : "border-[var(--line)] bg-[var(--card)] text-[var(--ink)] hover:-translate-y-0.5"
            }`}
          >
            <span className="block text-sm font-semibold">{tab.label}</span>
            <span
              className={`mt-1 block text-xs ${
                isActive ? "text-white/80" : "text-[var(--muted)]"
              }`}
            >
              {tab.description}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function QuickAddPlayerForm({
  weekStart,
  gender,
  teamNumber,
  isSaving,
  onAddMember,
}: {
  weekStart: string;
  gender: TeamGender;
  teamNumber: number;
  isSaving: boolean;
  onAddMember: (input: {
    name: string;
    email: string;
    gender: TeamGender;
    teamNumber: number;
    weekStart: string;
  }) => Promise<boolean>;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const added = await onAddMember({
      name,
      email,
      gender,
      teamNumber,
      weekStart,
    });

    if (added) {
      setName("");
      setEmail("");
      requestAnimationFrame(() => nameInputRef.current?.focus());
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-2 sm:grid-cols-[1fr_0.9fr_auto]">
      <input
        ref={nameInputRef}
        name="name"
        type="text"
        required
        value={name}
        onChange={(event) => setName(event.target.value)}
        className="rounded-xl border border-[var(--line)] bg-white p-2 text-sm"
        placeholder="Player name"
      />
      <input
        name="email"
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        className="rounded-xl border border-[var(--line)] bg-white p-2 text-sm"
        placeholder="Email optional"
      />
      <button
        disabled={isSaving}
        className="rounded-xl bg-[var(--ok)] px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSaving ? "Adding..." : "Add"}
      </button>
    </form>
  );
}

function TeamDetails({
  title,
  countLabel,
  defaultOpen,
  children,
}: {
  title: string;
  countLabel: string;
  defaultOpen: boolean;
  children: React.ReactNode;
}) {
  return (
    <details
      open={defaultOpen}
      className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--card)] shadow-sm"
    >
      <summary className="cursor-pointer list-none border-b border-[var(--line)] bg-[var(--chip)] px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold">{title}</h3>
            <p className="text-xs text-[var(--muted)]">{countLabel}</p>
          </div>
          <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[var(--muted)] shadow-sm">
            Open
          </span>
        </div>
      </summary>
      {children}
    </details>
  );
}

function MemberManager({
  weekStart,
  members,
  activeGender,
  setActiveGender,
  savingTeamKey,
  deletingIds,
  memberMessage,
  onAddMember,
  onRemoveMember,
}: {
  weekStart: string;
  members: TeamMember[];
  activeGender: TeamGender;
  setActiveGender: (gender: TeamGender) => void;
  savingTeamKey: string | null;
  deletingIds: Set<string>;
  memberMessage: string | null;
  onAddMember: (input: {
    name: string;
    email: string;
    gender: TeamGender;
    teamNumber: number;
    weekStart: string;
  }) => Promise<boolean>;
  onRemoveMember: (member: TeamMember) => Promise<void>;
}) {
  const activeMembers = members.filter((member) => member.is_active);

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Manage team players</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Choose a gender split, open a team, type a name, then press Enter.
              The player is added without moving you away from the input.
            </p>
          </div>
          <GenderToggle
            activeGender={activeGender}
            setActiveGender={setActiveGender}
          />
        </div>
        {memberMessage && (
          <p className="mt-3 rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm text-[var(--muted)]">
            {memberMessage}
          </p>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {TEAM_NUMBERS.map((teamNumber) => {
          const teamMembers = activeMembers.filter(
            (member) =>
              member.gender === activeGender && member.team_number === teamNumber
          );
          const teamKey = `${activeGender}-${teamNumber}`;

          return (
            <TeamDetails
              key={teamKey}
              title={groupLabel(activeGender, teamNumber)}
              countLabel={`${teamMembers.length} active player${
                teamMembers.length === 1 ? "" : "s"
              }`}
              defaultOpen={teamNumber === 1 || teamMembers.length > 0}
            >
              <div className="p-5">
                <QuickAddPlayerForm
                  weekStart={weekStart}
                  gender={activeGender}
                  teamNumber={teamNumber}
                  isSaving={savingTeamKey === teamKey}
                  onAddMember={onAddMember}
                />
                <p className="mt-2 text-xs text-[var(--muted)]">
                  Press Enter while typing a name to add them quickly.
                </p>

                <ul className="mt-4 divide-y divide-[var(--line)]">
                  {teamMembers.length === 0 ? (
                    <li className="py-4 text-sm text-[var(--muted)]">
                      No players in this team yet.
                    </li>
                  ) : (
                    teamMembers.map((member) => (
                      <li
                        key={member.id}
                        className="flex flex-wrap items-center justify-between gap-3 py-3"
                      >
                        <div className="min-w-0">
                          <p className="font-medium">{member.name}</p>
                          {member.email && (
                            <p className="truncate text-sm text-[var(--muted)]">
                              {member.email}
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          disabled={deletingIds.has(member.id)}
                          onClick={() => onRemoveMember(member)}
                          className="rounded-full border border-red-200 bg-white px-3 py-1 text-xs font-medium text-red-700 shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {deletingIds.has(member.id) ? "Deleting..." : "Delete"}
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            </TeamDetails>
          );
        })}
      </div>
    </section>
  );
}

function WeeklyAttendance({
  weekStart,
  weekRange,
  previousWeek,
  nextWeek,
  currentWeek,
  members,
  activeGender,
  setActiveGender,
  attendanceByMember,
  savingIds,
  error,
  updateAttendance,
}: {
  weekStart: string;
  weekRange: string;
  previousWeek: string;
  nextWeek: string;
  currentWeek: string;
  members: TeamMember[];
  activeGender: TeamGender;
  setActiveGender: (gender: TeamGender) => void;
  attendanceByMember: Record<string, boolean>;
  savingIds: Set<string>;
  error: string | null;
  updateAttendance: (memberId: string, attended: boolean) => Promise<void>;
}) {
  const activeMembers = members.filter((member) => member.is_active);
  const presentCount = activeMembers.filter(
    (member) => attendanceByMember[member.id]
  ).length;

  const groups = TEAM_NUMBERS.map((teamNumber) => {
    const groupMembers = members.filter(
      (member) =>
        member.gender === activeGender &&
        member.team_number === teamNumber &&
        (member.is_active || attendanceByMember[member.id])
    );

    return {
      key: `${activeGender}-${teamNumber}`,
      label: groupLabel(activeGender, teamNumber),
      members: groupMembers,
      presentCount: groupMembers.filter(
        (member) => attendanceByMember[member.id]
      ).length,
    };
  });

  const markTeamPresent = async (teamMembers: TeamMember[]) => {
    for (const member of teamMembers) {
      if (!attendanceByMember[member.id]) {
        await updateAttendance(member.id, true);
      }
    }
  };

  return (
    <section className="space-y-5">
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
              Training week
            </p>
            <h2 className="mt-1 text-xl font-semibold">Monday {weekRange}</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Present: {presentCount} / {activeMembers.length} active members.
            </p>
            {error && <p className="mt-1 text-sm text-red-700">{error}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/admin/team-attendance?tab=attendance&gender=${activeGender}&week=${previousWeek}`}
              className="rounded-full border border-[var(--line)] bg-white px-3 py-1.5 text-xs font-medium shadow-sm"
            >
              Previous week
            </Link>
            <Link
              href={`/admin/team-attendance?tab=attendance&gender=${activeGender}&week=${currentWeek}`}
              className="rounded-full border border-[var(--line)] bg-white px-3 py-1.5 text-xs font-medium shadow-sm"
            >
              Current week
            </Link>
            <Link
              href={`/admin/team-attendance?tab=attendance&gender=${activeGender}&week=${nextWeek}`}
              className="rounded-full border border-[var(--line)] bg-white px-3 py-1.5 text-xs font-medium shadow-sm"
            >
              Next week
            </Link>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
          <form method="get" action="/admin/team-attendance">
            <input type="hidden" name="tab" value="attendance" />
            <input type="hidden" name="gender" value={activeGender} />
            <label className="block text-sm font-medium">
              Jump to week
              <div className="mt-1 flex flex-wrap gap-2">
                <input
                  name="week"
                  type="date"
                  defaultValue={weekStart}
                  className="rounded-xl border border-[var(--line)] bg-white p-2 text-sm"
                />
                <button className="rounded-xl bg-[var(--cool)] px-4 py-2 text-sm font-semibold text-white shadow-sm">
                  Open week
                </button>
              </div>
            </label>
          </form>

          <GenderToggle
            activeGender={activeGender}
            setActiveGender={setActiveGender}
          />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {groups.map((group) => (
          <TeamDetails
            key={group.key}
            title={group.label}
            countLabel={`Present: ${group.presentCount} / ${group.members.length}`}
            defaultOpen={group.members.length > 0}
          >
            <div className="p-4">
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => markTeamPresent(group.members)}
                  disabled={group.members.length === 0}
                  className="rounded-full border border-[var(--line)] bg-white px-3 py-1 text-xs font-medium text-[var(--muted)] shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Mark team present
                </button>
              </div>

              <ul className="mt-3 divide-y divide-[var(--line)]">
                {group.members.length === 0 ? (
                  <li className="py-4 text-sm text-[var(--muted)]">
                    No players added to this team yet.
                  </li>
                ) : (
                  group.members.map((member) => {
                    const attended = Boolean(attendanceByMember[member.id]);
                    const saving = savingIds.has(member.id);

                    return (
                      <li key={member.id} className="py-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium">{member.name}</span>
                              {!member.is_active && (
                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                                  archived member
                                </span>
                              )}
                            </div>
                            {member.email && (
                              <div className="truncate text-sm text-[var(--muted)]">
                                {member.email}
                              </div>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => updateAttendance(member.id, !attended)}
                            disabled={saving}
                            className={`rounded-full px-3 py-1 text-xs font-semibold shadow-sm disabled:opacity-60 ${
                              attended
                                ? "bg-[var(--ok)] text-white"
                                : "border border-[var(--line)] bg-white text-[var(--muted)]"
                            }`}
                          >
                            {saving
                              ? "Saving..."
                              : attended
                                ? "Present"
                                : "Mark present"}
                          </button>
                        </div>
                      </li>
                    );
                  })
                )}
              </ul>
            </div>
          </TeamDetails>
        ))}
      </div>
    </section>
  );
}

function PastAttendance({
  weekStart,
  defaultExportFrom,
  pastWeeks,
}: {
  weekStart: string;
  defaultExportFrom: string;
  pastWeeks: string[];
}) {
  return (
    <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
      <form
        action="/api/admin/team-attendance/export"
        method="get"
        className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-5 shadow-sm"
      >
        <h2 className="text-lg font-semibold">Export attendance</h2>
        <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
          Download an Excel file for a date range. Dates are normalised to Monday
          training weeks.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium">
            From week
            <input
              name="from"
              type="date"
              defaultValue={defaultExportFrom}
              className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white p-2 text-sm"
            />
          </label>
          <label className="block text-sm font-medium">
            To week
            <input
              name="to"
              type="date"
              defaultValue={weekStart}
              className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white p-2 text-sm"
            />
          </label>
        </div>
        <button className="mt-4 rounded-xl bg-[var(--cool)] px-4 py-2 text-sm font-semibold text-white shadow-sm">
          Export Excel
        </button>
      </form>

      <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Recent attendance weeks</h2>
        <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
          Old weeks are not deleted. Open one here if you need to review or edit
          it.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {pastWeeks.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">
              No past attendance has been marked yet.
            </p>
          ) : (
            pastWeeks.map((week) => (
              <Link
                key={week}
                href={`/admin/team-attendance?tab=attendance&week=${week}`}
                className="rounded-full border border-[var(--line)] bg-white px-3 py-1.5 text-xs font-medium shadow-sm"
              >
                {formatShortWeek(week)}
              </Link>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

export default function TeamAttendanceClient({
  weekStart,
  weekRange,
  previousWeek,
  nextWeek,
  currentWeek,
  defaultExportFrom,
  initialTab,
  initialGender,
  pastWeeks,
  members,
  initialAttendance,
}: TeamAttendanceClientProps) {
  const [activeTab, setActiveTab] = useState<TeamTab>(() =>
    normaliseTab(initialTab)
  );
  const [activeGender, setActiveGender] = useState<TeamGender>(() =>
    normaliseGender(initialGender)
  );
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>(members);
  const [attendanceByMember, setAttendanceByMember] = useState<
    Record<string, boolean>
  >(() =>
    Object.fromEntries(
      initialAttendance.map((record) => [record.member_id, record.attended])
    )
  );
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [savingTeamKey, setSavingTeamKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [memberMessage, setMemberMessage] = useState<string | null>(null);

  useEffect(() => {
    setTeamMembers(members);
  }, [members]);

  useEffect(() => {
    setAttendanceByMember(
      Object.fromEntries(
        initialAttendance.map((record) => [record.member_id, record.attended])
      )
    );
    setError(null);
  }, [initialAttendance, weekStart]);

  const sortedMembers = useMemo(
    () =>
      [...teamMembers].sort((a, b) => {
        if (a.gender !== b.gender) return a.gender.localeCompare(b.gender);
        if (a.team_number !== b.team_number) return a.team_number - b.team_number;
        return a.name.localeCompare(b.name);
      }),
    [teamMembers]
  );

  const addMember = async ({
    name,
    email,
    gender,
    teamNumber,
    weekStart: activeWeekStart,
  }: {
    name: string;
    email: string;
    gender: TeamGender;
    teamNumber: number;
    weekStart: string;
  }) => {
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    if (!trimmedName) return false;

    setMemberMessage(null);
    setSavingTeamKey(`${gender}-${teamNumber}`);

    try {
      const res = await fetch("/api/admin/team-attendance/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          email: trimmedEmail,
          gender,
          teamNumber,
          weekStart: activeWeekStart,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.member) {
        setMemberMessage(json.error || "Could not add player.");
        return false;
      }

      setTeamMembers((prev) => [...prev, json.member as TeamMember]);
      setMemberMessage(`${trimmedName} added to ${groupLabel(gender, teamNumber)}.`);
      return true;
    } finally {
      setSavingTeamKey(null);
    }
  };

  const removeMember = async (member: TeamMember) => {
    const confirmed = window.confirm(
      `Remove ${member.name} from the active team list? Their old attendance will stay archived.`
    );
    if (!confirmed) return;

    setMemberMessage(null);
    setDeletingIds((prev) => new Set(prev).add(member.id));

    try {
      const res = await fetch(`/api/admin/team-attendance/members/${member.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekStart }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMemberMessage(json.error || "Could not delete player.");
        return;
      }

      setTeamMembers((prev) =>
        prev.map((item) =>
          item.id === member.id ? { ...item, is_active: false } : item
        )
      );
      setMemberMessage(`${member.name} removed from the active team list.`);
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(member.id);
        return next;
      });
    }
  };

  const updateAttendance = async (memberId: string, attended: boolean) => {
    setError(null);
    setSavingIds((prev) => new Set(prev).add(memberId));

    try {
      const res = await fetch("/api/admin/team-attendance/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberId,
          weekStart,
          attended,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || "Failed to update team attendance.");
        return;
      }

      setAttendanceByMember((prev) => ({
        ...prev,
        [memberId]: attended,
      }));
    } finally {
      setSavingIds((prev) => {
        const next = new Set(prev);
        next.delete(memberId);
        return next;
      });
    }
  };

  return (
    <div className="space-y-5">
      <TeamTabs activeTab={activeTab} setActiveTab={setActiveTab} />

      {activeTab === "attendance" && (
        <WeeklyAttendance
          weekStart={weekStart}
          weekRange={weekRange}
          previousWeek={previousWeek}
          nextWeek={nextWeek}
          currentWeek={currentWeek}
          members={sortedMembers}
          activeGender={activeGender}
          setActiveGender={setActiveGender}
          attendanceByMember={attendanceByMember}
          savingIds={savingIds}
          error={error}
          updateAttendance={updateAttendance}
        />
      )}

      {activeTab === "members" && (
        <MemberManager
          weekStart={weekStart}
          members={sortedMembers}
          activeGender={activeGender}
          setActiveGender={setActiveGender}
          savingTeamKey={savingTeamKey}
          deletingIds={deletingIds}
          memberMessage={memberMessage}
          onAddMember={addMember}
          onRemoveMember={removeMember}
        />
      )}

      {activeTab === "past" && (
        <PastAttendance
          weekStart={weekStart}
          defaultExportFrom={defaultExportFrom}
          pastWeeks={pastWeeks}
        />
      )}
    </div>
  );
}

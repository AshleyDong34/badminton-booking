-- Team attendance feature.
-- Run this in the Supabase SQL editor before using Admin Console > Team attendance.

create table if not exists public.team_attendance_members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  gender text not null check (gender in ('mens', 'womens')),
  team_number integer not null check (team_number between 1 and 6),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists team_attendance_members_team_idx
  on public.team_attendance_members (gender, team_number, name);

create unique index if not exists team_attendance_members_active_email_idx
  on public.team_attendance_members (lower(email))
  where email is not null and is_active = true;

create table if not exists public.team_training_attendance (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.team_attendance_members(id) on delete cascade,
  week_start date not null,
  attended boolean not null default false,
  marked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (member_id, week_start)
);

create index if not exists team_training_attendance_week_idx
  on public.team_training_attendance (week_start, member_id);

-- This feature is admin-only in the app and uses the server service-role client.
-- RLS can stay enabled without public policies because the service role bypasses RLS.
alter table public.team_attendance_members enable row level security;
alter table public.team_training_attendance enable row level security;

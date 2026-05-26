-- Configurable feedback/survey feature.
-- Run this in the Supabase SQL editor before using /feedback or Admin > Feedback.
-- The old public.site_feedback table can stay in Supabase if you created it before;
-- the new survey-style feedback flow uses the tables below.

create table if not exists public.feedback_forms (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Website feedback',
  description text,
  is_active boolean not null default true,
  identity_mode text not null default 'anonymous'
    check (identity_mode in ('anonymous', 'optional', 'required')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.feedback_questions (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.feedback_forms(id) on delete cascade,
  prompt text not null,
  help_text text,
  question_type text not null
    check (
      question_type in (
        'short_text',
        'long_text',
        'single_choice',
        'multi_choice',
        'rating',
        'yes_no'
      )
    ),
  options jsonb not null default '[]'::jsonb,
  required boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists feedback_questions_form_order_idx
  on public.feedback_questions (form_id, sort_order, created_at);

create table if not exists public.feedback_responses (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.feedback_forms(id) on delete cascade,
  respondent_name text,
  respondent_email text,
  is_anonymous boolean not null default true,
  page_path text,
  status text not null default 'new'
    check (status in ('new', 'read', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists feedback_responses_form_created_idx
  on public.feedback_responses (form_id, created_at desc);

create index if not exists feedback_responses_status_created_idx
  on public.feedback_responses (status, created_at desc);

create table if not exists public.feedback_answers (
  id uuid primary key default gen_random_uuid(),
  response_id uuid not null references public.feedback_responses(id) on delete cascade,
  question_id uuid references public.feedback_questions(id) on delete set null,
  question_prompt text not null,
  question_type text not null,
  answer_text text,
  answer_json jsonb,
  created_at timestamptz not null default now()
);

create index if not exists feedback_answers_response_idx
  on public.feedback_answers (response_id);

create index if not exists feedback_answers_question_idx
  on public.feedback_answers (question_id);

-- Create a default active form if this is the first time setting up feedback.
insert into public.feedback_forms (title, description, is_active, identity_mode)
select
  'Website feedback',
  'Tell us what is working, what is broken, or what could be improved.',
  true,
  'anonymous'
where not exists (select 1 from public.feedback_forms);

-- This feature is written/read through server API routes using the service-role key.
-- No public RLS policy is required.
alter table public.feedback_forms enable row level security;
alter table public.feedback_questions enable row level security;
alter table public.feedback_responses enable row level security;
alter table public.feedback_answers enable row level security;

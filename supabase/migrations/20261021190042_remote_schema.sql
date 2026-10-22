SET local check_function_bodies = off;

CREATE EXTENSION "citext" SCHEMA "public";

CREATE EXTENSION "pg_cron";

CREATE TABLE "public"."admins" (
  "user_id"    uuid                     NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "admins_pkey" PRIMARY KEY (user_id)
);

ALTER TABLE "public"."admins"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."club_champs_knockout_matches" (
  "id"             uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "event"          text                     NOT NULL,
  "stage"          integer                  NOT NULL,
  "match_order"    integer                  NOT NULL,
  "pair_a_id"      uuid,
  "pair_b_id"      uuid,
  "pair_a_score"   integer,
  "pair_b_score"   integer,
  "winner_pair_id" uuid,
  "best_of"        integer                  NOT NULL DEFAULT 1,
  "is_unlocked"    boolean                  NOT NULL DEFAULT false,
  "created_at"     timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"     timestamp with time zone NOT NULL DEFAULT now(),
  "game_scores"    jsonb,
  CONSTRAINT "club_champs_knockout_matches_best_of_check" CHECK ((best_of = ANY (ARRAY[1, 3]))),
  CONSTRAINT "club_champs_knockout_matches_event_check" CHECK ((event = ANY (ARRAY['level_doubles'::text, 'mixed_doubles'::text]))),
  CONSTRAINT "club_champs_knockout_matches_event_stage_match_order_key" UNIQUE (EVENT, stage, match_order),
  CONSTRAINT "club_champs_knockout_matches_match_order_check" CHECK ((match_order >= 1)),
  CONSTRAINT "club_champs_knockout_matches_pair_a_score_check" CHECK ((pair_a_score >= 0)),
  CONSTRAINT "club_champs_knockout_matches_pair_b_score_check" CHECK ((pair_b_score >= 0)),
  CONSTRAINT "club_champs_knockout_matches_pkey" PRIMARY KEY (id),
  CONSTRAINT "club_champs_knockout_matches_stage_check" CHECK ((stage >= 1))
);

ALTER TABLE "public"."club_champs_knockout_matches"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."club_champs_pair_attendance" (
  "pair_id"            uuid                     NOT NULL,
  "player_one_present" boolean                  NOT NULL DEFAULT false,
  "player_two_present" boolean                  NOT NULL DEFAULT false,
  "updated_at"         timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "club_champs_pair_attendance_pkey" PRIMARY KEY (pair_id)
);

ALTER TABLE "public"."club_champs_pair_attendance"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."club_champs_pairs" (
  "id"                 uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "event"              text                     NOT NULL,
  "level_doubles_type" text,
  "player_one_name"    text                     NOT NULL,
  "player_one_level"   integer                  NOT NULL,
  "player_two_name"    text                     NOT NULL,
  "player_two_level"   integer                  NOT NULL,
  "created_at"         timestamp with time zone NOT NULL DEFAULT now(),
  "pair_strength"      integer,
  "seed_order"         integer,
  CONSTRAINT "club_champs_pairs_distinct_players" CHECK ((lower(TRIM(BOTH FROM player_one_name)) <> lower(TRIM(BOTH FROM player_two_name)))),
  CONSTRAINT "club_champs_pairs_event_check" CHECK ((event = ANY (ARRAY['level_doubles'::text, 'mixed_doubles'::text]))),
  CONSTRAINT "club_champs_pairs_event_type_consistency"
    CHECK
    ((((event = 'mixed_doubles'::text) AND (level_doubles_type IS NULL)) OR ((event = 'level_doubles'::text) AND (level_doubles_type = ANY (ARRAY['mens_doubles'::text,
    'womens_doubles'::text]))))),
  CONSTRAINT "club_champs_pairs_level_doubles_type_check" CHECK ((level_doubles_type = ANY (ARRAY['mens_doubles'::text, 'womens_doubles'::text]))),
  CONSTRAINT "club_champs_pairs_pkey" PRIMARY KEY (id),
  CONSTRAINT "club_champs_pairs_player_one_level_check" CHECK (((player_one_level >= 1) AND (player_one_level <= 7))),
  CONSTRAINT "club_champs_pairs_player_two_level_check" CHECK (((player_two_level >= 1) AND (player_two_level <= 7)))
);

ALTER TABLE "public"."club_champs_pairs"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."club_champs_pool_matches" (
  "id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "event"        text                     NOT NULL,
  "pool_number"  integer                  NOT NULL,
  "match_order"  integer                  NOT NULL,
  "pair_a_id"    uuid                     NOT NULL,
  "pair_b_id"    uuid                     NOT NULL,
  "pair_a_score" integer,
  "pair_b_score" integer,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  "is_playing"   boolean                  NOT NULL DEFAULT false,
  CONSTRAINT "club_champs_pool_matches_distinct_pairs" CHECK ((pair_a_id <> pair_b_id)),
  CONSTRAINT "club_champs_pool_matches_event_check" CHECK ((event = ANY (ARRAY['level_doubles'::text, 'mixed_doubles'::text]))),
  CONSTRAINT "club_champs_pool_matches_match_order_check" CHECK ((match_order >= 1)),
  CONSTRAINT "club_champs_pool_matches_pair_a_score_check" CHECK ((pair_a_score >= 0)),
  CONSTRAINT "club_champs_pool_matches_pair_b_score_check" CHECK ((pair_b_score >= 0)),
  CONSTRAINT "club_champs_pool_matches_pkey" PRIMARY KEY (id),
  CONSTRAINT "club_champs_pool_matches_pool_number_check" CHECK ((pool_number >= 1)),
  CONSTRAINT "club_champs_pool_matches_unique_match" UNIQUE (EVENT, pool_number, match_order)
);

ALTER TABLE "public"."club_champs_pool_matches"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."events" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "title"      text                     NOT NULL,
  "body"       text,
  "link_label" text,
  "link_url"   text,
  "is_active"  boolean                  NOT NULL DEFAULT true,
  "sort_order" integer                  NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "image_url"  text,
  "image_alt"  text,
  "image_side" text                     NOT NULL DEFAULT 'right'::text,
  "expires_on" date,
  CONSTRAINT "events_image_side_check" CHECK ((image_side = ANY (ARRAY['left'::text, 'right'::text]))),
  CONSTRAINT "events_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."events"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."feedback_answers" (
  "id"              uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "response_id"     uuid                     NOT NULL,
  "question_id"     uuid,
  "question_prompt" text                     NOT NULL,
  "question_type"   text                     NOT NULL,
  "answer_text"     text,
  "answer_json"     jsonb,
  "created_at"      timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "feedback_answers_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."feedback_answers"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."feedback_forms" (
  "id"            uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "title"         text                     NOT NULL DEFAULT 'Website feedback'::text,
  "description"   text,
  "is_active"     boolean                  NOT NULL DEFAULT true,
  "identity_mode" text                     NOT NULL DEFAULT 'anonymous'::text,
  "created_at"    timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"    timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "feedback_forms_identity_mode_check" CHECK ((identity_mode = ANY (ARRAY['anonymous'::text, 'optional'::text, 'required'::text]))),
  CONSTRAINT "feedback_forms_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."feedback_forms"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."feedback_questions" (
  "id"            uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "form_id"       uuid                     NOT NULL,
  "prompt"        text                     NOT NULL,
  "help_text"     text,
  "question_type" text                     NOT NULL,
  "options"       jsonb                    NOT NULL DEFAULT '[]'::jsonb,
  "required"      boolean                  NOT NULL DEFAULT false,
  "sort_order"    integer                  NOT NULL DEFAULT 0,
  "created_at"    timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"    timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "feedback_questions_pkey" PRIMARY KEY (id),
  CONSTRAINT "feedback_questions_question_type_check"
    CHECK ((question_type = ANY (ARRAY['short_text'::text, 'long_text'::text, 'single_choice'::text, 'multi_choice'::text, 'rating'::text, 'yes_no'::text])))
);

ALTER TABLE "public"."feedback_questions"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."feedback_responses" (
  "id"               uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "form_id"          uuid                     NOT NULL,
  "respondent_name"  text,
  "respondent_email" text,
  "is_anonymous"     boolean                  NOT NULL DEFAULT true,
  "page_path"        text,
  "status"           text                     NOT NULL DEFAULT 'new'::text,
  "created_at"       timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"       timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "feedback_responses_pkey" PRIMARY KEY (id),
  CONSTRAINT "feedback_responses_status_check" CHECK ((status = ANY (ARRAY['new'::text, 'read'::text, 'archived'::text])))
);

ALTER TABLE "public"."feedback_responses"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."first_time_signups" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "email"      text,
  "student_id" text,
  "created_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "first_time_signups_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."first_time_signups"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."pending_admin_emails" (
  "email"      text                     NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "pending_admin_emails_pkey" PRIMARY KEY (email)
);

ALTER TABLE "public"."pending_admin_emails"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."sessions" (
  "id"              uuid                        NOT NULL DEFAULT gen_random_uuid(),
  "name"            text                        NOT NULL,
  "capacity"        integer,
  "created_at"      timestamp without time zone DEFAULT now(),
  "notes"           text,
  "starts_at"       timestamp with time zone    DEFAULT (now() AT TIME ZONE 'utc'::text),
  "ends_at"         timestamp with time zone,
  "allow_name_only" boolean                     DEFAULT false,
  CONSTRAINT "sessions_ends_after_starts" CHECK (((ends_at IS NULL) OR (starts_at IS NULL) OR (ends_at > starts_at))),
  CONSTRAINT "sessions_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."sessions"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."settings" (
  "id"                              integer                  NOT NULL DEFAULT 1,
  "weekly_quota"                    integer                  NOT NULL DEFAULT 2,
  "updated_at"                      timestamp with time zone NOT NULL DEFAULT now(),
  "allow_same_day_multi"            boolean                  NOT NULL DEFAULT false,
  "allow_name_only"                 boolean                  DEFAULT false,
  "club_rules"                      text,
  "useful_info"                     text,
  "booking_window_days"             integer                  DEFAULT 7,
  "club_champs_public_enabled"      boolean                  NOT NULL DEFAULT false,
  "sessions_public_enabled"         boolean                  NOT NULL DEFAULT true,
  "club_champs_pairs_only_public"   boolean                  NOT NULL DEFAULT false,
  "club_champs_level_pool_target"   smallint                 NOT NULL DEFAULT 3,
  "club_champs_mixed_pool_target"   smallint                 NOT NULL DEFAULT 4,
  "membership_import_columns"       jsonb                    NOT NULL DEFAULT '{"email": "email", "studentId": "student_id"}'::jsonb,
  "club_champs_pair_import_columns" jsonb
    NOT NULL DEFAULT
    '{"level": {"playerOneName": "player_one_name", "playerTwoName": "player_two_name", "playerOneLevel": "player_one_level", "playerTwoLevel": "player_two_level", "playerOneGender": "player_one_gender", "playerTwoGender": "player_two_gender"}, "mixed": {"playerOneName": "player_one_name", "playerTwoName": "player_two_name", "playerOneLevel": "player_one_level", "playerTwoLevel": "player_two_level"}}'::jsonb,
  "club_rules_label"                text                     NOT NULL DEFAULT 'Club Rules'::text,
  "club_rules_description"          text                     NOT NULL DEFAULT 'Court Rules and Player Attitude'::text,
  "useful_info_label"               text                     NOT NULL DEFAULT 'Useful info'::text,
  "useful_info_description"         text                     NOT NULL DEFAULT 'Links for EUBC'::text,
  "court_updates_label"             text                     NOT NULL DEFAULT 'Court updates'::text,
  "court_updates_description"       text                     NOT NULL DEFAULT 'Coming soon'::text,
  "court_updates"                   text                     NOT NULL DEFAULT ''::text,
  CONSTRAINT "settings_club_champs_level_pool_target_check" CHECK ((club_champs_level_pool_target = ANY (ARRAY[3, 4]))),
  CONSTRAINT "settings_club_champs_mixed_pool_target_check" CHECK ((club_champs_mixed_pool_target = ANY (ARRAY[3, 4]))),
  CONSTRAINT "settings_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."settings"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."signups" (
  "id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "session_id"   uuid                     NOT NULL,
  "name"         text                     DEFAULT ''::text,
  "notes"        text                     DEFAULT 'NULL'::text,
  "created_at"   timestamp with time zone DEFAULT now(),
  "student_id"   text,
  "email"        text,
  "cancel_token" uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "cancelled_at" timestamp with time zone,
  "attended"     boolean                  DEFAULT false,
  CONSTRAINT "sign up_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."signups"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."site_feedback" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "category"   text                     NOT NULL DEFAULT 'other'::text,
  "message"    text                     NOT NULL,
  "page_path"  text,
  "status"     text                     NOT NULL DEFAULT 'new'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "rating"     integer,
  CONSTRAINT "site_feedback_category_check" CHECK ((category = ANY (ARRAY['bug'::text, 'like'::text, 'idea'::text, 'change'::text, 'other'::text]))),
  CONSTRAINT "site_feedback_message_check" CHECK (((char_length(message) >= 3) AND (char_length(message) <= 2000))),
  CONSTRAINT "site_feedback_pkey" PRIMARY KEY (id),
  CONSTRAINT "site_feedback_rating_check" CHECK (((rating >= 1) AND (rating <= 5))),
  CONSTRAINT "site_feedback_status_check" CHECK ((status = ANY (ARRAY['new'::text, 'read'::text, 'archived'::text])))
);

ALTER TABLE "public"."site_feedback"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."student_whitelist" (
  "student_id" text NOT NULL,
  "email"      text,
  CONSTRAINT "student_whitelist_pkey" PRIMARY KEY (student_id)
);

ALTER TABLE "public"."student_whitelist"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."team_attendance_members" (
  "id"          uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "name"        text                     NOT NULL,
  "email"       text,
  "gender"      text                     NOT NULL,
  "team_number" integer                  NOT NULL,
  "is_active"   boolean                  NOT NULL DEFAULT true,
  "created_at"  timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"  timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "team_attendance_members_gender_check" CHECK ((gender = ANY (ARRAY['mens'::text, 'womens'::text]))),
  CONSTRAINT "team_attendance_members_pkey" PRIMARY KEY (id),
  CONSTRAINT "team_attendance_members_team_number_check" CHECK (((team_number >= 1) AND (team_number <= 6)))
);

ALTER TABLE "public"."team_attendance_members"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."team_training_attendance" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "member_id"  uuid                     NOT NULL,
  "week_start" date                     NOT NULL,
  "attended"   boolean                  NOT NULL DEFAULT false,
  "marked_at"  timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "team_training_attendance_member_id_week_start_key" UNIQUE (member_id, week_start),
  CONSTRAINT "team_training_attendance_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."team_training_attendance"
  ENABLE ROW LEVEL SECURITY;

CREATE TYPE "public"."signup_status" AS ENUM (
  'signed_up',
  'waiting_list'
);

ALTER TABLE "public"."signups"
  ADD COLUMN "status" public.signup_status DEFAULT 'signed_up'::public.signup_status;

CREATE OR REPLACE FUNCTION public.cancel_signup_by_token (
  p_token uuid
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
declare
  v_session uuid;
begin
  -- find the signup; keep session_id for trigger-based promotion
  select session_id into v_session
  from public.signups
  where cancel_token = p_token
  limit 1;

  if v_session is null then
    return false; -- invalid/used token
  end if;

  -- delete the row (your delete trigger will promote waitlist)
  delete from public.signups
  where cancel_token = p_token;

  return true;
end;
$function$;

CREATE OR REPLACE FUNCTION public.club_champs_knockout_set_updated_at()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.insert_signup_guarded (
  p_session_id uuid,
  p_name       text,
  p_student_id text,
  p_email      text
)
  RETURNS TABLE (
    r_cancel_token uuid,
    r_status       text
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
declare
  w_start timestamptz;
  w_end timestamptz;
  current_signed int;
  cap int;
  current_in_session int;
  decided_status signup_status;
  quota int;

  v_allow_same_day_multi boolean;
  v_default_allow_name_only boolean;
  v_allow_name_only boolean;
  v_session_day date;
  v_use_email_key boolean;

  sid_norm text := null;
  email_norm text := null;
  new_id uuid;
  is_whitelisted boolean;
  seen_first_time boolean;
begin
  w_start := date_trunc('week', now());
  w_end := w_start + interval '7 days';

  select
    coalesce(weekly_quota, 2),
    coalesce(allow_same_day_multi, false),
    coalesce(allow_name_only, false)
  into quota, v_allow_same_day_multi, v_default_allow_name_only
  from public.settings
  where id = 1;

  select allow_name_only
  into v_allow_name_only
  from public.sessions
  where id = p_session_id;

  if v_allow_name_only is null then
    v_allow_name_only := v_default_allow_name_only;
  end if;

  email_norm := lower(trim(p_email));
  sid_norm := lower(regexp_replace(trim(p_student_id), '[^a-z0-9]', '', 'g'));


  if email_norm is null or email_norm = '' then
    raise exception 'email required' using errcode = 'P0001';
  end if;

  if sid_norm is not null and sid_norm <> '' and sid_norm !~ '^s[0-9]{7}$' then
    raise exception 'invalid student_id' using errcode = 'P0001';
  end if;

  v_use_email_key := (sid_norm is null or sid_norm = '');

  if not v_allow_name_only then
    select exists (
      select 1
      from public.student_whitelist w
      where (email_norm <> '' and lower(trim(w.email)) = email_norm)
         or (sid_norm <> '' and lower(trim(w.student_id)) = sid_norm)
    ) into is_whitelisted;

    if not is_whitelisted then
      if sid_norm is null or sid_norm = '' then
        raise exception 'first_time_requires_student_id' using errcode = 'P0001';
      end if;

      select exists (
        select 1
        from public.first_time_signups f
        where (email_norm <> '' and lower(trim(f.email)) = email_norm)
           or (sid_norm <> '' and lower(trim(f.student_id)) = sid_norm)
      ) into seen_first_time;

      if seen_first_time then
        raise exception 'membership required' using errcode = 'P0001';
      end if;

      insert into public.first_time_signups (email, student_id)
      values (email_norm, sid_norm);
    end if;
  end if;

  if v_allow_name_only or v_use_email_key then
    select count(*) into current_signed
    from public.signups s
    where lower(trim(s.email)) = email_norm
      and s.status = 'signed_up'
      and s.created_at >= w_start
      and s.created_at < w_end;
  else
    select count(*) into current_signed
    from public.signups s
    where lower(trim(s.student_id)) = sid_norm
      and s.status = 'signed_up'
      and s.created_at >= w_start
      and s.created_at < w_end;
  end if;

  if current_signed >= quota then
    raise exception 'weekly limit reached (%)', quota using errcode = 'P0001';
  end if;

  if not v_allow_same_day_multi then
    select (s.starts_at at time zone 'Europe/London')::date
    into v_session_day
    from public.sessions s
    where s.id = p_session_id;

    if v_session_day is null then
      raise exception 'session not found' using errcode = 'P0001';
    end if;

    if v_allow_name_only or v_use_email_key then
      if exists (
        select 1
        from public.signups si
        join public.sessions ss on ss.id = si.session_id
        where lower(trim(si.email)) = email_norm
          and si.status in ('signed_up','waiting_list')
          and (ss.starts_at at time zone 'Europe/London')::date = v_session_day
          and si.session_id <> p_session_id
      ) then
        raise exception 'same-day booking not allowed' using errcode = 'P0001';
      end if;
    else
      if exists (
        select 1
        from public.signups si
        join public.sessions ss on ss.id = si.session_id
        where lower(trim(si.student_id)) = sid_norm
          and si.status in ('signed_up','waiting_list')
          and (ss.starts_at at time zone 'Europe/London')::date = v_session_day
          and si.session_id <> p_session_id
      ) then
        raise exception 'same-day booking not allowed' using errcode = 'P0001';
      end if;
    end if;
  end if;

  select capacity into cap
  from public.sessions
  where id = p_session_id
  for update;

  if cap is null then
    raise exception 'session not found' using errcode = 'P0001';
  end if;

  select count(*) into current_in_session
  from public.signups
  where session_id = p_session_id
    and status = 'signed_up';

  decided_status :=
    case
      when current_in_session < cap
        then 'signed_up'::signup_status
      else 'waiting_list'::signup_status
    end;

  insert into public.signups (session_id, name, status, student_id, email)
  values (p_session_id, p_name, decided_status, sid_norm, email_norm)
  returning id into new_id;

  return query
    select s.cancel_token, s.status::text
    from public.signups s
    where s.id = new_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.is_admin (
  uid uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  AS $function$
  select exists (
    select 1 from public.admins a where a.user_id = uid
  );
$function$;

CREATE OR REPLACE FUNCTION public.promote_waitlisted()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $function$
begin
  if (tg_op = 'DELETE' and old.status = 'signed_up') then
    update public.signups
      set status = 'signed_up'
    where id in (
      select id
      from public.signups
      where session_id = old.session_id
        and status = 'waiting_list'
      order by created_at asc
      limit 1
    );
  end if;
  return null;
end;
$function$;

ALTER TABLE "public"."admins"
  ADD CONSTRAINT "admins_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."club_champs_knockout_matches"
  ADD CONSTRAINT "club_champs_knockout_matches_pair_a_id_fkey" FOREIGN KEY (pair_a_id) REFERENCES public.club_champs_pairs(id) ON DELETE SET NULL;

ALTER TABLE "public"."club_champs_knockout_matches"
  ADD CONSTRAINT "club_champs_knockout_matches_pair_b_id_fkey" FOREIGN KEY (pair_b_id) REFERENCES public.club_champs_pairs(id) ON DELETE SET NULL;

ALTER TABLE "public"."club_champs_knockout_matches"
  ADD CONSTRAINT "club_champs_knockout_matches_winner_pair_id_fkey" FOREIGN KEY (winner_pair_id) REFERENCES public.club_champs_pairs(id) ON DELETE SET NULL;

ALTER TABLE "public"."club_champs_pair_attendance"
  ADD CONSTRAINT "club_champs_pair_attendance_pair_id_fkey" FOREIGN KEY (pair_id) REFERENCES public.club_champs_pairs(id) ON DELETE CASCADE;

ALTER TABLE "public"."club_champs_pool_matches"
  ADD CONSTRAINT "club_champs_pool_matches_pair_a_id_fkey" FOREIGN KEY (pair_a_id) REFERENCES public.club_champs_pairs(id) ON DELETE CASCADE;

ALTER TABLE "public"."club_champs_pool_matches"
  ADD CONSTRAINT "club_champs_pool_matches_pair_b_id_fkey" FOREIGN KEY (pair_b_id) REFERENCES public.club_champs_pairs(id) ON DELETE CASCADE;

ALTER TABLE "public"."feedback_questions"
  ADD CONSTRAINT "feedback_questions_form_id_fkey" FOREIGN KEY (form_id) REFERENCES public.feedback_forms(id) ON DELETE CASCADE;

ALTER TABLE "public"."feedback_answers"
  ADD CONSTRAINT "feedback_answers_question_id_fkey" FOREIGN KEY (question_id) REFERENCES public.feedback_questions(id) ON DELETE SET NULL;

ALTER TABLE "public"."feedback_responses"
  ADD CONSTRAINT "feedback_responses_form_id_fkey" FOREIGN KEY (form_id) REFERENCES public.feedback_forms(id) ON DELETE CASCADE;

ALTER TABLE "public"."feedback_answers"
  ADD CONSTRAINT "feedback_answers_response_id_fkey" FOREIGN KEY (response_id) REFERENCES public.feedback_responses(id) ON DELETE CASCADE;

ALTER TABLE "public"."signups"
  ADD CONSTRAINT "sign up_session_id_fkey" FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE "public"."signups"
  ADD CONSTRAINT "signups_session_id_fkey" FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE;

ALTER TABLE "public"."team_training_attendance"
  ADD CONSTRAINT "team_training_attendance_member_id_fkey" FOREIGN KEY (member_id) REFERENCES public.team_attendance_members(id) ON DELETE CASCADE;

CREATE VIEW "public"."admin_session_overview" WITH (security_invoker=on) AS  SELECT s.id,
    s.name,
    s.capacity,
    count(*) FILTER (WHERE (su.status = 'signed_up'::public.signup_status)) AS signed_up_count,
    count(*) FILTER (WHERE (su.status = 'waiting_list'::public.signup_status)) AS waiting_list_count
   FROM (public.sessions s
     LEFT JOIN public.signups su ON ((su.session_id = s.id)))
  GROUP BY s.id, s.name, s.capacity;

CREATE INDEX club_champs_knockout_event_stage_idx ON public.club_champs_knockout_matches USING btree (EVENT, stage, match_order);

CREATE INDEX club_champs_pair_attendance_updated_at_idx ON public.club_champs_pair_attendance USING btree (updated_at DESC);

CREATE INDEX club_champs_pairs_created_at_idx ON public.club_champs_pairs USING btree (created_at DESC);

CREATE INDEX club_champs_pairs_event_idx ON public.club_champs_pairs USING btree (EVENT);

CREATE UNIQUE INDEX club_champs_pairs_unique_pair_idx ON public.club_champs_pairs
  USING btree
  (EVENT, COALESCE(level_doubles_type, ''::text), LEAST(lower(TRIM(BOTH FROM player_one_name)), lower(TRIM(BOTH FROM player_two_name))), GREATEST(lower(TRIM(BOTH FROM
  player_one_name)), lower(TRIM(BOTH FROM player_two_name))));

CREATE INDEX club_champs_pool_matches_event_pool_idx ON public.club_champs_pool_matches USING btree (EVENT, pool_number, match_order);

CREATE INDEX events_public_order_idx ON public.events USING btree (is_active, sort_order, created_at DESC);

CREATE INDEX feedback_answers_question_idx ON public.feedback_answers USING btree (question_id);

CREATE INDEX feedback_answers_response_idx ON public.feedback_answers USING btree (response_id);

CREATE INDEX feedback_questions_form_order_idx ON public.feedback_questions USING btree (form_id, sort_order, created_at);

CREATE INDEX feedback_responses_form_created_idx ON public.feedback_responses USING btree (form_id, created_at DESC);

CREATE INDEX feedback_responses_status_created_idx ON public.feedback_responses USING btree (status, created_at DESC);

CREATE UNIQUE INDEX first_time_signups_email_key ON public.first_time_signups USING btree (lower(TRIM(BOTH FROM email)))
  WHERE (email IS NOT NULL);

CREATE UNIQUE INDEX first_time_signups_student_id_key ON public.first_time_signups USING btree (lower(TRIM(BOTH FROM student_id)))
  WHERE (student_id IS NOT NULL);

CREATE INDEX idx_cc_pool_matches_playing_event ON public.club_champs_pool_matches USING btree (is_playing, EVENT);

CREATE INDEX idx_signups_session ON public.signups USING btree (session_id);

CREATE INDEX idx_signups_status ON public.signups USING btree (status);

CREATE UNIQUE INDEX signups_session_email_uniq ON public.signups USING btree (session_id, lower(email))
  WHERE ((email IS NOT NULL) AND (btrim(email) <> ''::text));

CREATE UNIQUE INDEX signups_session_student_uniq ON public.signups USING btree (session_id, lower(student_id))
  WHERE ((student_id IS NOT NULL) AND (btrim(student_id) <> ''::text));

CREATE INDEX site_feedback_created_idx ON public.site_feedback USING btree (created_at DESC);

CREATE INDEX site_feedback_status_created_idx ON public.site_feedback USING btree (status, created_at DESC);

CREATE UNIQUE INDEX student_whitelist_email_uq ON public.student_whitelist USING btree (email)
  WHERE (email IS NOT NULL);

CREATE UNIQUE INDEX student_whitelist_student_id_uq ON public.student_whitelist USING btree (student_id)
  WHERE (student_id IS NOT NULL);

CREATE UNIQUE INDEX team_attendance_members_active_email_idx ON public.team_attendance_members USING btree (lower(email))
  WHERE ((email IS NOT NULL) AND (is_active = true));

CREATE INDEX team_attendance_members_team_idx ON public.team_attendance_members USING btree (gender, team_number, name);

CREATE INDEX team_training_attendance_week_idx ON public.team_training_attendance USING btree (week_start, member_id);

CREATE UNIQUE INDEX ux_signups_session_lowername ON public.signups USING btree (session_id, lower(name));

CREATE UNIQUE INDEX ux_signups_session_student ON public.signups USING btree (session_id, lower(TRIM(BOTH FROM student_id)));

CREATE TRIGGER trg_club_champs_knockout_updated_at
  BEFORE UPDATE ON public.club_champs_knockout_matches
  FOR EACH ROW
  EXECUTE FUNCTION public.club_champs_knockout_set_updated_at();

CREATE TRIGGER trg_promote_waitlisted
  AFTER DELETE ON public.signups
  FOR EACH ROW
  EXECUTE FUNCTION public.promote_waitlisted();

CREATE POLICY "admins can manage admins" ON "public"."admins"
  FOR ALL
  TO "authenticated"
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "admins can read admins" ON "public"."admins"
  FOR SELECT
  TO "authenticated"
  USING (public.is_admin(auth.uid()));

CREATE POLICY "read own admin row" ON "public"."admins"
  FOR SELECT
  TO "authenticated"
  USING ((user_id = auth.uid()));

CREATE POLICY "admins can manage club_champs_knockout_matches" ON "public"."club_champs_knockout_matches"
  FOR ALL
  TO "authenticated"
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "admins_select_knockout_matches" ON "public"."club_champs_knockout_matches"
  FOR SELECT
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.admins a
  WHERE (a.user_id = auth.uid()))));

CREATE POLICY "admins can manage club champs pairs" ON "public"."club_champs_pairs"
  FOR ALL
  TO "authenticated"
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "admins can manage champs pool matches" ON "public"."club_champs_pool_matches"
  FOR ALL
  TO "authenticated"
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "admins_select_pool_matches" ON "public"."club_champs_pool_matches"
  FOR SELECT
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.admins a
  WHERE (a.user_id = auth.uid()))));

CREATE POLICY "admins can delete pending_admin_emails" ON "public"."pending_admin_emails"
  FOR DELETE
  TO "authenticated"
  USING (public.is_admin(auth.uid()));

CREATE POLICY "admins can insert pending_admin_emails" ON "public"."pending_admin_emails"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "admins can read pending_admin_emails" ON "public"."pending_admin_emails"
  FOR SELECT
  TO "authenticated"
  USING (public.is_admin(auth.uid()));

CREATE POLICY "read sessions" ON "public"."sessions"
  FOR SELECT
  TO PUBLIC
  USING (true);

CREATE POLICY "admins update settings" ON "public"."settings"
  FOR UPDATE
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.admins a
  WHERE (a.user_id = auth.uid()))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM public.admins a
  WHERE (a.user_id = auth.uid()))));

CREATE POLICY "read settings" ON "public"."settings"
  FOR SELECT
  TO PUBLIC
  USING (true);

CREATE POLICY "insert signup if whitelisted" ON "public"."signups"
  FOR INSERT
  TO PUBLIC
  WITH CHECK (((student_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.student_whitelist w
  WHERE (w.student_id = signups.student_id)))));

CREATE POLICY "read signups" ON "public"."signups"
  FOR SELECT
  TO PUBLIC
  USING (true);

ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."club_champs_knockout_matches";

ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."club_champs_pool_matches";

ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."sessions";

ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."signups";

COMMENT ON EXTENSION "citext" IS 'data type for case-insensitive character strings';

COMMENT ON EXTENSION "pg_cron" IS 'Job scheduler for PostgreSQL';

REVOKE ALL ON FUNCTION "public"."cancel_signup_by_token"(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."cancel_signup_by_token"(uuid) TO "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."cancel_signup_by_token"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."cancel_signup_by_token"(uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."cancel_signup_by_token"(uuid) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."club_champs_knockout_set_updated_at"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."club_champs_knockout_set_updated_at"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."club_champs_knockout_set_updated_at"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."club_champs_knockout_set_updated_at"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."insert_signup_guarded"(uuid, text, text, text) TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."insert_signup_guarded"(uuid, text, text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."insert_signup_guarded"(uuid, text, text, text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."insert_signup_guarded"(uuid, text, text, text) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."is_admin"(uuid) TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."is_admin"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."is_admin"(uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."is_admin"(uuid) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."promote_waitlisted"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."promote_waitlisted"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."promote_waitlisted"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."promote_waitlisted"() TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."admins" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."admins" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."admins" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."admins" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."club_champs_knockout_matches" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."club_champs_knockout_matches" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."club_champs_knockout_matches" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."club_champs_knockout_matches" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."club_champs_pair_attendance" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."club_champs_pair_attendance" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."club_champs_pair_attendance" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."club_champs_pair_attendance" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."club_champs_pairs" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."club_champs_pairs" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."club_champs_pairs" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."club_champs_pairs" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."club_champs_pool_matches" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."club_champs_pool_matches" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."club_champs_pool_matches" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."club_champs_pool_matches" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."events" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."events" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."events" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."events" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."feedback_answers" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."feedback_answers" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."feedback_answers" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."feedback_answers" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."feedback_forms" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."feedback_forms" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."feedback_forms" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."feedback_forms" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."feedback_questions" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."feedback_questions" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."feedback_questions" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."feedback_questions" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."feedback_responses" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."feedback_responses" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."feedback_responses" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."feedback_responses" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."first_time_signups" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."first_time_signups" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."first_time_signups" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."first_time_signups" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."pending_admin_emails" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."pending_admin_emails" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."pending_admin_emails" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."pending_admin_emails" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."sessions" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."sessions" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."sessions" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."sessions" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."settings" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."settings" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."settings" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."settings" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."signups" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."signups" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."signups" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."signups" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."site_feedback" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."site_feedback" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."site_feedback" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."site_feedback" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."student_whitelist" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."student_whitelist" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."student_whitelist" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."student_whitelist" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."team_attendance_members" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."team_attendance_members" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."team_attendance_members" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."team_attendance_members" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."team_training_attendance" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."team_training_attendance" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."team_training_attendance" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."team_training_attendance" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."admin_session_overview" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."admin_session_overview" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."admin_session_overview" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."admin_session_overview" TO "service_role";

SELECT cron.schedule_in_database('project_keepalive', '17 3 */3 * *', ' select now(); ', 'postgres', NULL, true);

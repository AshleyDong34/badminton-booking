-- A confirmed booking reserves a credit immediately. Once the session starts,
-- deleting that booking leaves a spent-credit record for its original booking week.
-- Waitlist places have no credit reservation until promoted.
CREATE TABLE public.booking_credit_spends (
  signup_id uuid PRIMARY KEY,
  session_id uuid NOT NULL,
  email text,
  student_id text,
  booked_at timestamptz NOT NULL,
  session_starts_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.booking_credit_spends ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.booking_credit_spends FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.booking_credit_spends TO service_role;

CREATE OR REPLACE FUNCTION public.record_booking_credit_spend()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_starts_at timestamptz;
BEGIN
  IF OLD.status = 'signed_up' THEN
    SELECT starts_at INTO v_starts_at FROM public.sessions WHERE id = OLD.session_id;
    IF v_starts_at IS NOT NULL AND v_starts_at <= now() THEN
      INSERT INTO public.booking_credit_spends
        (signup_id, session_id, email, student_id, booked_at, session_starts_at)
      VALUES (OLD.id, OLD.session_id, OLD.email, OLD.student_id, OLD.created_at, v_starts_at)
      ON CONFLICT (signup_id) DO NOTHING;
    END IF;
  END IF;
  RETURN OLD;
END;
$function$;
CREATE TRIGGER record_booking_credit_spend_before_delete
BEFORE DELETE ON public.signups
FOR EACH ROW EXECUTE FUNCTION public.record_booking_credit_spend();
REVOKE ALL ON FUNCTION public.record_booking_credit_spend() FROM PUBLIC, anon, authenticated;

-- Include already spent bookings when enforcing the weekly quota.
CREATE OR REPLACE FUNCTION public.insert_signup_guarded (
  p_session_id uuid,
  p_name text,
  p_student_id text,
  p_email text
)
RETURNS TABLE (r_cancel_token uuid, r_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  w_start timestamptz;
  w_end timestamptz;
  current_signed integer;
  v_spent integer;
  cap integer;
  current_in_session integer;
  decided_status signup_status;
  quota integer;
  v_allow_same_day_multi boolean;
  v_default_allow_name_only boolean;
  v_allow_name_only boolean;
  v_session_day date;
  v_use_email_key boolean;
  sid_norm text;
  email_norm text;
  new_id uuid;
  v_id_member uuid;
  v_email_member uuid;
  v_email_member_sid text;
  v_member_id uuid;
  is_whitelisted boolean;
  seen_first_time boolean;
BEGIN
  SELECT week_start, week_end INTO w_start, w_end
  FROM public.booking_week_bounds(now());

  SELECT coalesce(weekly_quota, 2),
         coalesce(allow_same_day_multi, false),
         coalesce(allow_name_only, false)
  INTO quota, v_allow_same_day_multi, v_default_allow_name_only
  FROM public.settings
  WHERE id = 1;

  quota := coalesce(quota, 2);
  v_allow_same_day_multi := coalesce(v_allow_same_day_multi, false);
  v_default_allow_name_only := coalesce(v_default_allow_name_only, false);

  SELECT allow_name_only INTO v_allow_name_only
  FROM public.sessions WHERE id = p_session_id;
  IF v_allow_name_only IS NULL THEN
    v_allow_name_only := v_default_allow_name_only;
  END IF;

  email_norm := lower(btrim(coalesce(p_email, '')));
  sid_norm := nullif(lower(regexp_replace(btrim(coalesce(p_student_id, '')), '[^a-z0-9]', '', 'g')), '');

  IF email_norm = '' THEN
    RAISE EXCEPTION 'email required' USING errcode = 'P0001';
  END IF;
  IF sid_norm IS NOT NULL AND sid_norm !~ '^s[0-9]{7}$' THEN
    RAISE EXCEPTION 'invalid student_id' USING errcode = 'P0001';
  END IF;

  IF NOT v_allow_name_only THEN
    IF sid_norm IS NOT NULL THEN
      SELECT id INTO v_id_member
      FROM public.student_whitelist
      WHERE lower(btrim(student_id)) = sid_norm;
    END IF;
    SELECT id, student_id INTO v_email_member, v_email_member_sid
    FROM public.student_whitelist
    WHERE lower(btrim(email)) = email_norm;

    IF v_id_member IS NOT NULL AND v_email_member IS NOT NULL
       AND v_id_member <> v_email_member THEN
      RAISE EXCEPTION 'member identity mismatch' USING errcode = 'P0001';
    END IF;
    IF v_email_member IS NOT NULL AND sid_norm IS NOT NULL
       AND (v_email_member_sid IS NULL OR lower(btrim(v_email_member_sid)) <> sid_norm) THEN
      RAISE EXCEPTION 'member identity mismatch' USING errcode = 'P0001';
    END IF;

    v_member_id := coalesce(v_id_member, v_email_member);
    is_whitelisted := v_member_id IS NOT NULL;

    -- When an ID member books by their roster email, keep their quota and
    -- same-day checks keyed to that same ID.
    IF v_email_member IS NOT NULL AND sid_norm IS NULL AND v_email_member_sid IS NOT NULL THEN
      sid_norm := lower(btrim(v_email_member_sid));
    END IF;
  END IF;

  v_use_email_key := sid_norm IS NULL;

  -- Serialize bookings for the same member, including across sessions.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'booking:' || CASE
      WHEN v_allow_name_only THEN email_norm
      ELSE coalesce(v_member_id::text, sid_norm, email_norm)
    END, 0
  ));

  IF NOT v_allow_name_only AND NOT is_whitelisted THEN
    SELECT exists (
      SELECT 1 FROM public.first_time_signups f
      WHERE lower(btrim(f.email)) = email_norm
         OR lower(btrim(f.student_id)) = sid_norm
    ) INTO seen_first_time;

    IF seen_first_time THEN
      RAISE EXCEPTION 'membership required' USING errcode = 'P0001';
    END IF;

    INSERT INTO public.first_time_signups (email, student_id)
    VALUES (email_norm, sid_norm);
  END IF;

  IF v_allow_name_only OR v_use_email_key THEN
    SELECT count(*) INTO current_signed
    FROM public.signups s
    WHERE lower(btrim(s.email)) = email_norm
      AND s.status = 'signed_up'
      AND s.created_at >= w_start AND s.created_at < w_end;
  ELSE
    SELECT count(*) INTO current_signed
    FROM public.signups s
    WHERE (lower(btrim(s.student_id)) = sid_norm OR lower(btrim(s.email)) = email_norm)
      AND s.status = 'signed_up'
      AND s.created_at >= w_start AND s.created_at < w_end;
  END IF;

  SELECT count(*) INTO v_spent
  FROM public.booking_credit_spends h
  WHERE h.booked_at >= w_start AND h.booked_at < w_end
    AND (
      ((v_allow_name_only OR v_use_email_key) AND lower(btrim(h.email)) = email_norm)
      OR
      (NOT (v_allow_name_only OR v_use_email_key)
        AND (lower(btrim(h.student_id)) = sid_norm OR lower(btrim(h.email)) = email_norm))
    );
  current_signed := current_signed + v_spent;

  IF current_signed >= quota THEN
    RAISE EXCEPTION 'weekly limit reached (%)', quota USING errcode = 'P0001';
  END IF;

  IF NOT v_allow_same_day_multi THEN
    SELECT (s.starts_at AT TIME ZONE 'Europe/London')::date INTO v_session_day
    FROM public.sessions s WHERE s.id = p_session_id;

    IF v_session_day IS NULL THEN
      RAISE EXCEPTION 'session not found' USING errcode = 'P0001';
    END IF;

    IF v_allow_name_only OR v_use_email_key THEN
      IF exists (
        SELECT 1 FROM public.signups si
        JOIN public.sessions ss ON ss.id = si.session_id
        WHERE lower(btrim(si.email)) = email_norm
          AND si.status IN ('signed_up', 'waiting_list')
          AND (ss.starts_at AT TIME ZONE 'Europe/London')::date = v_session_day
          AND si.session_id <> p_session_id
      ) THEN
        RAISE EXCEPTION 'same-day booking not allowed' USING errcode = 'P0001';
      END IF;
    ELSE
      IF exists (
        SELECT 1 FROM public.signups si
        JOIN public.sessions ss ON ss.id = si.session_id
        WHERE (lower(btrim(si.student_id)) = sid_norm OR lower(btrim(si.email)) = email_norm)
          AND si.status IN ('signed_up', 'waiting_list')
          AND (ss.starts_at AT TIME ZONE 'Europe/London')::date = v_session_day
          AND si.session_id <> p_session_id
      ) THEN
        RAISE EXCEPTION 'same-day booking not allowed' USING errcode = 'P0001';
      END IF;
    END IF;
  END IF;

  SELECT capacity INTO cap
  FROM public.sessions WHERE id = p_session_id FOR UPDATE;
  IF cap IS NULL THEN
    RAISE EXCEPTION 'session not found' USING errcode = 'P0001';
  END IF;

  SELECT count(*) INTO current_in_session
  FROM public.signups WHERE session_id = p_session_id AND status = 'signed_up';

  decided_status := CASE
    WHEN current_in_session < cap THEN 'signed_up'::signup_status
    ELSE 'waiting_list'::signup_status
  END;

  INSERT INTO public.signups (session_id, name, status, student_id, email)
  VALUES (p_session_id, p_name, decided_status, sid_norm, email_norm)
  RETURNING id INTO new_id;

  RETURN QUERY SELECT s.cancel_token, s.status::text
  FROM public.signups s WHERE s.id = new_id;
END;
$function$;

-- Show the balance for the booking week, not necessarily the week an email is sent.
CREATE OR REPLACE FUNCTION public.get_booking_credits(
  p_email text,
  p_student_id text,
  p_session_id uuid,
  p_booked_at timestamptz
)
RETURNS TABLE (
  weekly_quota integer,
  used_credits integer,
  remaining_credits integer,
  week_start timestamptz,
  week_end timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_student_id text := nullif(lower(regexp_replace(btrim(coalesce(p_student_id, '')), '[^a-z0-9]', '', 'g')), '');
  v_allow_name_only boolean;
  v_default_allow_name_only boolean;
  v_used integer;
  v_spent integer;
  v_quota integer;
  v_start timestamptz;
  v_end timestamptz;
BEGIN
  IF v_email = '' THEN RAISE EXCEPTION 'email required'; END IF;
  SELECT coalesce(s.weekly_quota, 2), coalesce(s.allow_name_only, false)
  INTO v_quota, v_default_allow_name_only
  FROM public.settings s WHERE s.id = 1;
  v_quota := coalesce(v_quota, 2);
  SELECT s.allow_name_only INTO v_allow_name_only
  FROM public.sessions s WHERE s.id = p_session_id;
  v_allow_name_only := coalesce(v_allow_name_only, v_default_allow_name_only, false);

  IF NOT v_allow_name_only AND v_student_id IS NULL THEN
    SELECT lower(btrim(m.student_id)) INTO v_student_id
    FROM public.student_whitelist m
    WHERE lower(btrim(m.email)) = v_email;
  END IF;

  SELECT b.week_start, b.week_end INTO v_start, v_end
  FROM public.booking_week_bounds(p_booked_at) b;
  SELECT count(*) INTO v_used FROM public.signups s
  WHERE s.status = 'signed_up'
    AND s.created_at >= v_start AND s.created_at < v_end
    AND (lower(btrim(s.email)) = v_email
      OR (NOT v_allow_name_only AND v_student_id IS NOT NULL AND lower(btrim(s.student_id)) = v_student_id));

  SELECT count(*) INTO v_spent FROM public.booking_credit_spends h
  WHERE h.booked_at >= v_start AND h.booked_at < v_end
    AND (lower(btrim(h.email)) = v_email
      OR (NOT v_allow_name_only AND v_student_id IS NOT NULL AND lower(btrim(h.student_id)) = v_student_id));
  v_used := v_used + v_spent;

  RETURN QUERY SELECT v_quota, v_used, greatest(v_quota - v_used, 0), v_start, v_end;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_booking_credits(text, text, uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_booking_credits(text, text, uuid, timestamptz) TO service_role;

-- Preserve the old server-only signature for callers that need the current week.
CREATE OR REPLACE FUNCTION public.get_booking_credits(
  p_email text, p_student_id text, p_session_id uuid
)
RETURNS TABLE (
  weekly_quota integer, used_credits integer, remaining_credits integer,
  week_start timestamptz, week_end timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT * FROM public.get_booking_credits(p_email, p_student_id, p_session_id, now());
$function$;

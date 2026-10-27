-- Keep the booking count tied to when a booking was made. The week starts
-- at Monday 00:00 Europe/London, including across daylight-saving changes.
CREATE OR REPLACE FUNCTION public.booking_week_bounds(p_at timestamptz)
RETURNS TABLE (week_start timestamptz, week_end timestamptz)
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT date_trunc('week', p_at AT TIME ZONE 'Europe/London') AT TIME ZONE 'Europe/London',
         (date_trunc('week', p_at AT TIME ZONE 'Europe/London') + interval '7 days') AT TIME ZONE 'Europe/London';
$function$;

-- A new project has schema but no settings row; booking rules need their defaults.
INSERT INTO public.settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

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

-- Release an unused taster whether it was tracked by ID and email or email alone.
CREATE OR REPLACE FUNCTION public.cancel_signup_by_token(p_token uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_signup_id uuid;
  v_email text;
  v_student_id text;
  v_signup_created_at timestamptz;
  v_attended boolean;
  v_session_starts_at timestamptz;
BEGIN
  SELECT s.id, s.email, s.student_id, s.created_at, s.attended, ss.starts_at
  INTO v_signup_id, v_email, v_student_id, v_signup_created_at, v_attended, v_session_starts_at
  FROM public.signups s
  JOIN public.sessions ss ON ss.id = s.session_id
  WHERE s.cancel_token = p_token
  LIMIT 1
  FOR UPDATE OF s;

  IF v_signup_id IS NULL THEN RETURN false; END IF;

  IF v_attended IS NOT TRUE AND v_session_starts_at > now() THEN
    DELETE FROM public.first_time_signups f
    WHERE f.created_at = v_signup_created_at
      AND lower(btrim(f.email)) = lower(btrim(v_email))
      AND lower(btrim(f.student_id)) IS NOT DISTINCT FROM lower(btrim(v_student_id));
  END IF;

  DELETE FROM public.signups WHERE id = v_signup_id;
  RETURN true;
END;
$function$;

-- The server reads this immediately after a booking, promotion or cancellation.
-- Waitlist places do not use a weekly credit until promoted.
CREATE OR REPLACE FUNCTION public.get_booking_credits(
  p_email text,
  p_student_id text,
  p_session_id uuid
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
  FROM public.booking_week_bounds(now()) b;
  SELECT count(*) INTO v_used FROM public.signups s
  WHERE s.status = 'signed_up'
    AND s.created_at >= v_start AND s.created_at < v_end
    AND (lower(btrim(s.email)) = v_email
      OR (NOT v_allow_name_only AND v_student_id IS NOT NULL AND lower(btrim(s.student_id)) = v_student_id));

  RETURN QUERY SELECT v_quota, v_used, greatest(v_quota - v_used, 0), v_start, v_end;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_booking_credits(text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_booking_credits(text, text, uuid) TO service_role;

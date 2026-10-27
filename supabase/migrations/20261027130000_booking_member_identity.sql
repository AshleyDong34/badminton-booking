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
  w_start := date_trunc('week', now());
  w_end := w_start + interval '7 days';

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
    IF sid_norm IS NULL THEN
      RAISE EXCEPTION 'first_time_requires_student_id' USING errcode = 'P0001';
    END IF;

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

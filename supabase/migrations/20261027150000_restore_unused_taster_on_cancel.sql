-- The taster record and signup created by insert_signup_guarded share the
-- same transaction timestamp. Release that specific taster use when its
-- booking is cancelled before the session begins and before attendance.
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

  IF v_signup_id IS NULL THEN
    RETURN false;
  END IF;

  IF v_attended IS NOT TRUE AND v_session_starts_at > now() AND v_student_id IS NOT NULL THEN
    DELETE FROM public.first_time_signups f
    WHERE f.created_at = v_signup_created_at
      AND lower(btrim(f.email)) = lower(btrim(v_email))
      AND lower(btrim(f.student_id)) = lower(btrim(v_student_id));
  END IF;

  -- Existing delete trigger promotes the earliest waiting-list signup.
  DELETE FROM public.signups WHERE id = v_signup_id;
  RETURN true;
END;
$function$;

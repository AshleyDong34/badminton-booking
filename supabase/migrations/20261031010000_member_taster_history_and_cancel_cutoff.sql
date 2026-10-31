-- Keep the free-taster eligibility marker after someone joins the club.
-- An existing taster row remains a taster record; a member-only marker is
-- distinguished by member_precluded, so it never marks a booking as a taster.
ALTER TABLE public.first_time_signups
  ADD COLUMN member_precluded boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.record_member_taster_ineligible(
  p_name text, p_email text, p_student_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_sid text := nullif(lower(btrim(coalesce(p_student_id, ''))), '');
  v_by_id public.first_time_signups%ROWTYPE;
  v_by_email public.first_time_signups%ROWTYPE;
  v_target uuid;
BEGIN
  -- A name-only admin record does not identify a booker yet.
  IF v_email IS NULL AND v_sid IS NULL THEN RETURN; END IF;

  IF v_sid IS NOT NULL THEN
    SELECT * INTO v_by_id FROM public.first_time_signups
    WHERE lower(btrim(student_id)) = v_sid FOR UPDATE;
  END IF;
  IF v_email IS NOT NULL THEN
    SELECT * INTO v_by_email FROM public.first_time_signups
    WHERE lower(btrim(email)) = v_email FOR UPDATE;
  END IF;

  IF v_by_id.id IS NOT NULL AND v_by_email.id IS NOT NULL
     AND v_by_id.id <> v_by_email.id THEN
    RAISE EXCEPTION 'member ID and email match different first-time records; review manually';
  END IF;
  IF v_by_email.id IS NOT NULL AND v_sid IS NOT NULL
     AND v_by_email.student_id IS NOT NULL
     AND lower(btrim(v_by_email.student_id)) <> v_sid THEN
    RAISE EXCEPTION 'member email is tied to another first-time student ID; review manually';
  END IF;

  v_target := coalesce(v_by_id.id, v_by_email.id);
  IF v_target IS NULL THEN
    INSERT INTO public.first_time_signups (name, email, student_id, member_precluded)
    VALUES (p_name, v_email, v_sid, true);
  ELSE
    UPDATE public.first_time_signups
    SET member_precluded = true,
        name = coalesce(name, p_name),
        email = coalesce(v_email, email),
        student_id = coalesce(v_sid, student_id)
    WHERE id = v_target;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.record_member_taster_ineligible(text, text, text)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.record_member_taster_ineligible_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  PERFORM public.record_member_taster_ineligible(NEW.name, NEW.email, NEW.student_id);
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.record_member_taster_ineligible_trigger()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER record_member_taster_ineligible_after_write
AFTER INSERT OR UPDATE OF name, email, student_id ON public.student_whitelist
FOR EACH ROW EXECUTE FUNCTION public.record_member_taster_ineligible_trigger();

-- Existing members also lose free-taster eligibility. Preserve any actual
-- taster row and its original date when the identities match.
DO $backfill$
DECLARE member record;
BEGIN
  FOR member IN
    SELECT name, email, student_id FROM public.student_whitelist
    WHERE email IS NOT NULL OR student_id IS NOT NULL
  LOOP
    PERFORM public.record_member_taster_ineligible(
      member.name, member.email, member.student_id
    );
  END LOOP;
END;
$backfill$;

-- A member-only eligibility marker is not a taster booking indicator.
CREATE OR REPLACE FUNCTION public.mark_taster_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  UPDATE public.first_time_signups f
  SET name = NEW.name
  WHERE f.created_at = NEW.created_at
    AND NOT f.member_precluded
    AND lower(btrim(f.email)) = lower(btrim(NEW.email))
    AND lower(btrim(f.student_id)) IS NOT DISTINCT FROM lower(btrim(NEW.student_id));
  IF FOUND THEN NEW.is_taster := true; END IF;
  RETURN NEW;
END;
$function$;

-- Cancellation links stop working when the session starts. The committee can
-- still remove a booking directly; the existing delete trigger records its
-- spent credit if the session has started.
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
  IF v_session_starts_at IS NOT NULL AND v_session_starts_at <= clock_timestamp() THEN
    RETURN false;
  END IF;

  IF v_attended IS NOT TRUE THEN
    DELETE FROM public.first_time_signups f
    WHERE f.created_at = v_signup_created_at
      AND NOT f.member_precluded
      AND lower(btrim(f.email)) = lower(btrim(v_email))
      AND lower(btrim(f.student_id)) IS NOT DISTINCT FROM lower(btrim(v_student_id));
  END IF;

  DELETE FROM public.signups WHERE id = v_signup_id;
  RETURN true;
END;
$function$;

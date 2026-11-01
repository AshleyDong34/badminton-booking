-- Membership history is needed to prevent former members from taking a free
-- taster, but it should not appear in the admin's actual-taster list.
ALTER TABLE public.first_time_signups
  ADD COLUMN is_taster_record boolean NOT NULL DEFAULT false;

-- Existing non-member records are tasters. Preserve former tasters who later
-- joined the club when their original signup can still be identified.
UPDATE public.first_time_signups f
SET is_taster_record = true
WHERE NOT f.member_precluded
   OR EXISTS (
     SELECT 1 FROM public.signups s
     WHERE s.is_taster
       AND s.created_at = f.created_at
       AND (
         (f.student_id IS NOT NULL AND lower(btrim(s.student_id)) = lower(btrim(f.student_id)))
         OR (f.email IS NOT NULL AND lower(btrim(s.email)) = lower(btrim(f.email)))
       )
   );

-- Both the booking function and the admin form insert ordinary taster records.
-- The roster trigger inserts member-only history with member_precluded=true.
CREATE FUNCTION public.set_first_time_taster_record()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.is_taster_record := NOT NEW.member_precluded;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER set_first_time_taster_record_before_insert
BEFORE INSERT ON public.first_time_signups
FOR EACH ROW EXECUTE FUNCTION public.set_first_time_taster_record();

-- A taster cancelled before the session starts has not used the free visit.
-- If they joined the club in the meantime, retain their membership-history
-- marker while removing them from the actual-taster list.
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
    UPDATE public.first_time_signups f
    SET is_taster_record = false
    WHERE f.created_at = v_signup_created_at
      AND f.member_precluded
      AND f.is_taster_record
      AND lower(btrim(f.email)) = lower(btrim(v_email))
      AND lower(btrim(f.student_id)) IS NOT DISTINCT FROM lower(btrim(v_student_id));

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

-- A waitlist place reserves no credit. Check availability again when it is
-- promoted because the person may have booked other sessions meanwhile.
CREATE OR REPLACE FUNCTION public.promotion_credit_available(p_signup_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_signup public.signups%ROWTYPE;
  v_available boolean;
BEGIN
  SELECT * INTO v_signup FROM public.signups WHERE id = p_signup_id;
  IF NOT FOUND OR nullif(btrim(v_signup.email), '') IS NULL THEN
    RETURN false;
  END IF;

  SELECT remaining_credits > 0 INTO v_available
  FROM public.get_booking_credits(
    v_signup.email, v_signup.student_id, v_signup.session_id, v_signup.created_at
  );
  RETURN coalesce(v_available, false);
END;
$function$;
REVOKE ALL ON FUNCTION public.promotion_credit_available(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.promotion_credit_available(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.enforce_promotion_credit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF OLD.status = 'waiting_list' AND NEW.status = 'signed_up'
     AND NOT public.promotion_credit_available(OLD.id) THEN
    RAISE EXCEPTION 'weekly limit reached for waitlist promotion' USING errcode = 'P0001';
  END IF;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER enforce_promotion_credit_before_update
BEFORE UPDATE OF status ON public.signups
FOR EACH ROW EXECUTE FUNCTION public.enforce_promotion_credit();
REVOKE ALL ON FUNCTION public.enforce_promotion_credit() FROM PUBLIC, anon, authenticated;

-- Moving a confirmed person back to the waitlist after a session starts
-- also leaves their already-spent credit in the booking week.
CREATE OR REPLACE FUNCTION public.record_booking_credit_spend()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_starts_at timestamptz;
  v_should_log boolean := false;
BEGIN
  IF OLD.status = 'signed_up' THEN
    IF TG_OP = 'DELETE' THEN
      v_should_log := true;
    ELSIF NEW.status <> 'signed_up' THEN
      v_should_log := true;
    END IF;
  END IF;
  IF v_should_log THEN
    SELECT starts_at INTO v_starts_at FROM public.sessions WHERE id = OLD.session_id;
    IF v_starts_at IS NOT NULL AND v_starts_at <= now() THEN
      INSERT INTO public.booking_credit_spends
        (signup_id, session_id, email, student_id, booked_at, session_starts_at)
      VALUES (OLD.id, OLD.session_id, OLD.email, OLD.student_id, OLD.created_at, v_starts_at)
      ON CONFLICT (signup_id) DO NOTHING;
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER record_booking_credit_spend_before_update
BEFORE UPDATE OF status ON public.signups
FOR EACH ROW EXECUTE FUNCTION public.record_booking_credit_spend();

-- Skip people who have exhausted the booking week's quota. Keep their
-- waitlist rows for committee review and offer the space to the next person.
CREATE OR REPLACE FUNCTION public.promote_waitlisted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  candidate record;
BEGIN
  IF TG_OP = 'DELETE' AND OLD.status = 'signed_up' THEN
    FOR candidate IN
      SELECT id FROM public.signups
      WHERE session_id = OLD.session_id AND status = 'waiting_list'
      ORDER BY created_at ASC, id ASC
    LOOP
      IF public.promotion_credit_available(candidate.id) THEN
        UPDATE public.signups SET status = 'signed_up'
        WHERE id = candidate.id AND status = 'waiting_list';
        EXIT WHEN FOUND;
      END IF;
    END LOOP;
  END IF;
  RETURN NULL;
END;
$function$;

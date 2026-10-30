-- A started booking moved to the waitlist has already spent its credit.
-- Do not count that same signup once as spent and again as newly confirmed.
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
  IF EXISTS (
    SELECT 1 FROM public.booking_credit_spends WHERE signup_id = p_signup_id
  ) THEN
    RETURN false;
  END IF;

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

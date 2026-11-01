-- PostgREST loads safeupdate, which rejects DELETE without a WHERE clause.
-- The roster's primary key is non-null, so this predicate still clears every
-- member after the locked count check while satisfying that safeguard.
CREATE OR REPLACE FUNCTION public.clear_membership_roster(p_expected_count integer)
RETURNS integer
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_current_count integer;
  v_deleted_count integer;
BEGIN
  IF p_expected_count IS NULL OR p_expected_count < 1 THEN
    RAISE EXCEPTION 'expected membership count must be positive';
  END IF;

  LOCK TABLE public.student_whitelist IN SHARE ROW EXCLUSIVE MODE;
  SELECT count(*) INTO v_current_count FROM public.student_whitelist;
  IF v_current_count <> p_expected_count THEN
    RAISE EXCEPTION 'membership list changed; refresh and confirm again';
  END IF;

  DELETE FROM public.student_whitelist WHERE id IS NOT NULL;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RETURN v_deleted_count;
END;
$function$;

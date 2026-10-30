-- Keep the name used for a free taster and mark that specific booking for
-- committee checks, even if the person becomes a paid member later.
ALTER TABLE public.first_time_signups ADD COLUMN name text;
ALTER TABLE public.signups ADD COLUMN is_taster boolean NOT NULL DEFAULT false;

UPDATE public.first_time_signups f
SET name = s.name
FROM public.signups s
WHERE f.created_at = s.created_at
  AND lower(btrim(f.email)) = lower(btrim(s.email))
  AND lower(btrim(f.student_id)) IS NOT DISTINCT FROM lower(btrim(s.student_id));

UPDATE public.signups s
SET is_taster = true
FROM public.first_time_signups f
WHERE f.created_at = s.created_at
  AND lower(btrim(f.email)) = lower(btrim(s.email))
  AND lower(btrim(f.student_id)) IS NOT DISTINCT FROM lower(btrim(s.student_id));

CREATE OR REPLACE FUNCTION public.mark_taster_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Both rows are inserted by insert_signup_guarded in one transaction, so
  -- their default created_at values are the same transaction timestamp.
  UPDATE public.first_time_signups f
  SET name = NEW.name
  WHERE f.created_at = NEW.created_at
    AND lower(btrim(f.email)) = lower(btrim(NEW.email))
    AND lower(btrim(f.student_id)) IS NOT DISTINCT FROM lower(btrim(NEW.student_id));

  IF FOUND THEN NEW.is_taster := true; END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER mark_taster_signup_before_insert
BEFORE INSERT ON public.signups
FOR EACH ROW EXECUTE FUNCTION public.mark_taster_signup();

REVOKE ALL ON FUNCTION public.mark_taster_signup() FROM PUBLIC, anon, authenticated;

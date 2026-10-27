-- Support roster imports that identify students by student ID and keep
-- manually maintained members who do not have an ID.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.student_whitelist
    WHERE student_id IS NOT NULL AND btrim(student_id) <> ''
    GROUP BY lower(btrim(student_id))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'student_whitelist contains duplicate student IDs after trimming and case normalization';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.student_whitelist
    WHERE email IS NOT NULL AND btrim(email) <> ''
    GROUP BY lower(btrim(email))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'student_whitelist contains duplicate emails after trimming and case normalization';
  END IF;
END;
$$;

UPDATE public.student_whitelist
SET student_id = nullif(lower(btrim(student_id)), ''),
    email = nullif(lower(btrim(email)), '');

ALTER TABLE public.student_whitelist
  ADD COLUMN id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN name text;

ALTER TABLE public.student_whitelist
  ALTER COLUMN id SET NOT NULL;

ALTER TABLE public.student_whitelist
  DROP CONSTRAINT student_whitelist_pkey;

ALTER TABLE public.student_whitelist
  ALTER COLUMN student_id DROP NOT NULL;

ALTER TABLE public.student_whitelist
  ADD CONSTRAINT student_whitelist_pkey PRIMARY KEY (id);

DROP INDEX IF EXISTS public.student_whitelist_email_uq;
DROP INDEX IF EXISTS public.student_whitelist_student_id_uq;

CREATE UNIQUE INDEX student_whitelist_student_id_uq
  ON public.student_whitelist (lower(btrim(student_id)))
  WHERE student_id IS NOT NULL AND btrim(student_id) <> '';

CREATE UNIQUE INDEX student_whitelist_email_uq
  ON public.student_whitelist (lower(btrim(email)))
  WHERE email IS NOT NULL AND btrim(email) <> '';

CREATE INDEX student_whitelist_name_normalized_idx
  ON public.student_whitelist (lower(regexp_replace(btrim(name), '\s+', ' ', 'g')))
  WHERE name IS NOT NULL AND btrim(name) <> '';

ALTER TABLE public.settings
  ALTER COLUMN membership_import_columns
  SET DEFAULT '{"name":"name","email":"email","studentId":"student_id"}'::jsonb;

UPDATE public.settings
SET membership_import_columns = jsonb_build_object('name', 'name') || membership_import_columns
WHERE NOT (membership_import_columns ? 'name');

CREATE OR REPLACE FUNCTION public.upsert_membership_roster(p_members jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_count integer;
BEGIN
  IF jsonb_typeof(p_members) <> 'array' THEN
    RAISE EXCEPTION 'membership roster must be a JSON array';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_members) AS member(student_id text, name text, email text)
    WHERE nullif(lower(regexp_replace(btrim(coalesce(student_id, '')), '[^a-z0-9]', '', 'g')), '') IS NULL
       OR lower(regexp_replace(btrim(coalesce(student_id, '')), '[^a-z0-9]', '', 'g')) !~ '^s[0-9]{7}$'
       OR nullif(btrim(coalesce(name, '')), '') IS NULL
  ) THEN
    RAISE EXCEPTION 'each imported roster member needs a valid student ID and name';
  END IF;

  INSERT INTO public.student_whitelist AS current_member (student_id, name, email)
  SELECT lower(regexp_replace(btrim(member.student_id), '[^a-z0-9]', '', 'g')),
         btrim(member.name),
         nullif(lower(btrim(member.email)), '')
  FROM jsonb_to_recordset(p_members) AS member(student_id text, name text, email text)
  ON CONFLICT ((lower(btrim(student_id))))
    WHERE student_id IS NOT NULL AND btrim(student_id) <> ''
  DO UPDATE SET
    name = excluded.name,
    email = coalesce(excluded.email, current_member.email);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.upsert_membership_roster(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_membership_roster(jsonb) TO service_role;

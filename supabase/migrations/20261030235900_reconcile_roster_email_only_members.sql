-- When a manually added no-ID member later appears in a student-ID roster,
-- attach the ID to that member if both email and normalized name agree.
-- A conflicting email/name or an email already tied to another ID needs
-- committee review instead of creating a duplicate or silently merging people.
CREATE OR REPLACE FUNCTION public.upsert_membership_roster(p_members jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  member record;
  v_id text;
  v_name text;
  v_email text;
  v_id_row public.student_whitelist%ROWTYPE;
  v_email_row public.student_whitelist%ROWTYPE;
  v_count integer := 0;
BEGIN
  IF jsonb_typeof(p_members) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'membership roster must be a JSON array';
  END IF;

  FOR member IN
    SELECT student_id, name, email
    FROM jsonb_to_recordset(p_members) AS item(student_id text, name text, email text)
    ORDER BY lower(regexp_replace(btrim(coalesce(student_id, '')), '[^a-z0-9]', '', 'g'))
  LOOP
    v_id := nullif(lower(regexp_replace(btrim(coalesce(member.student_id, '')), '[^a-z0-9]', '', 'g')), '');
    v_name := regexp_replace(btrim(coalesce(member.name, '')), '\s+', ' ', 'g');
    v_email := nullif(lower(btrim(coalesce(member.email, ''))), '');
    IF v_id IS NULL OR v_id !~ '^s[0-9]{7}$' OR v_name = '' THEN
      RAISE EXCEPTION 'each imported roster member needs a valid student ID and name';
    END IF;

    SELECT * INTO v_id_row
    FROM public.student_whitelist
    WHERE lower(btrim(student_id)) = v_id
    FOR UPDATE;

    v_email_row := NULL;
    IF v_email IS NOT NULL THEN
      SELECT * INTO v_email_row
      FROM public.student_whitelist
      WHERE lower(btrim(email)) = v_email
      FOR UPDATE;
    END IF;

    IF v_id_row.id IS NOT NULL AND v_email_row.id IS NOT NULL
       AND v_id_row.id <> v_email_row.id THEN
      RAISE EXCEPTION 'roster ID and email belong to different members; review manually';
    END IF;

    IF v_id_row.id IS NOT NULL THEN
      UPDATE public.student_whitelist
      SET name = v_name, email = coalesce(v_email, email)
      WHERE id = v_id_row.id;
    ELSIF v_email_row.id IS NOT NULL THEN
      IF v_email_row.student_id IS NOT NULL THEN
        RAISE EXCEPTION 'roster email belongs to another student ID; review manually';
      END IF;
      IF lower(regexp_replace(btrim(coalesce(v_email_row.name, '')), '\s+', ' ', 'g'))
         <> lower(regexp_replace(btrim(v_name), '\s+', ' ', 'g')) THEN
        RAISE EXCEPTION 'roster name does not match existing email-only member; review manually';
      END IF;
      UPDATE public.student_whitelist
      SET student_id = v_id, name = v_name
      WHERE id = v_email_row.id;
    ELSE
      INSERT INTO public.student_whitelist (student_id, name, email)
      VALUES (v_id, v_name, v_email);
    END IF;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.upsert_membership_roster(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_membership_roster(jsonb) TO service_role;

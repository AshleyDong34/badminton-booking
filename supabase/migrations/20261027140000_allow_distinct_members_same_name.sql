-- Distinct members can share a name. Email is required for public booking and
-- already has a per-session unique index; student IDs have one too.
DROP INDEX IF EXISTS public.ux_signups_session_lowername;

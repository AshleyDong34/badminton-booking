-- Keep the public player list opt-in, including for existing projects.
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS show_public_signup_names boolean NOT NULL DEFAULT false;

-- The public session endpoint serves names when this setting is enabled.
-- Direct anonymous access to signups would otherwise expose email addresses,
-- student IDs, cancellation tokens and waitlist entries regardless of the toggle.
DROP POLICY IF EXISTS "read signups" ON public.signups;
CREATE POLICY "admins read signups" ON public.signups
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

# Docs for the Project

This is a simple handover for anyone joining the badminton website project.

## Start Here

1. `../README.md` for feature list and env vars
2. `onboarding.md` for exact local setup and commands
3. `architecture/system-overview.md` for how requests flow through the app
4. `business-rules.md` for logic and edge cases
5. `runbooks/deploy-and-rollback.md` for safe release steps

## Important Rule

Never commit `.env.local` or any secrets (Supabase keys, Resend key, tokens).

If a secret is accidentally pushed:

1. Rotate/revoke the key immediately.
2. Replace it in Vercel and local `.env.local`.
3. Remove it from git history if needed.

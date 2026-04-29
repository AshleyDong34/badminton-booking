# Deploy and Rollback

This is the lightweight release guide for the club project.

## Current setup

- We currently test on localhost only.
- We currently use one production Supabase/env setup.
- Pushes to GitHub (main branch) deploy automatically to production via Vercel.

## Before pushing

1. Run local checks:

```bash
npm run build
npm run lint
```

2. Manually test key flows:
   - session list page loads
   - booking works
   - cancellation works
   - admin login works
   - admin page loads
   - session creation workflow works
   - one club champs flow works
3. Be extra careful with large full-feature changes.
   - Prefer small, focused changes.
   - If you are changing multiple core flows at once, split into smaller pushes.

## About lint

`npm run lint` runs ESLint.

It checks for common code issues and style problems before you deploy.

It is not perfect, but it catches many avoidable mistakes.

## Deploy flow

1. Push to GitHub main branch.
2. Vercel auto deploys to production.
3. Do a quick production smoke test:
   - homepage/session list
   - one booking flow
   - one admin flow

## Rollback flow

If production breaks:

1. Roll back to previous working deployment in Vercel.
2. Re-test booking + cancellation + admin quickly.
3. Fix locally, test locally, then push a new fix deploy.

## Environment variable safety

- Never commit `.env.local`(use gitignore).
- Never share keys to non dev members.
- Keep production keys in Vercel project settings only.

If a key leaks:

1. rotate key immediately
2. update Vercel env
3. update local `.env.local`

## Future improvement 

Ideal setup later:

- Separate preview/development Supabase project
- Separate preview/development env keys in Vercel
- Preview deployment testing before production

For now, local testing is the only safety step before production deploy, so keep releases careful and small.

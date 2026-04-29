# Onboarding

This is the practical setup guide for someone helping on the site.

## What this project is

A club tool for:

- session booking
- waitlist and cancellations
- admin attendance and management
- club champs tournament setup and results

## Stack (plain version)

- Next.js + TypeScript (website and API routes)
- Supabase (auth + Postgres database)
- Resend (emails)
- Vercel (hosting/deploy)
- cloudflare for dns

## Deploy model (important)

- Current model is local testing only.
- GitHub main branch push triggers automatic production deploy in Vercel.
- There is no separate preview environment setup yet.
- Keep changes small and test core flows locally before pushing.

## Local setup

1. Install Node.js LTS.
2. In project folder run:

```bash
npm install
```

3. Create `.env.local` in the project root with:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
RESEND_API_KEY=...
RESEND_FROM=...
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

4. Start dev server:

```bash
npm run dev
```

5. Open `http://localhost:3000`.

## Never push secrets

- Do not commit `.env.local`.
- Do not paste keys in code, docs, screenshots, or logs.

## Useful commands

```bash
npm run dev
npm run build
npm run start
npm run lint
```

What these mean:

- `dev`: run local development server
- `build`: production build check
- `start`: run built app
- `lint`: checks code style/basic mistakes using ESLint

If you have never used lint before:

- think of it as an automated code checker
- it does not run the app, it checks code quality/rules

## Project areas

- Public pages: `app/`, `app/sessions`, `app/club-champs`
- Admin pages: `app/admin`
- API routes: `app/api`
- Shared helpers: `lib`

## First checks after setup

1. Home page loads session list.
2. Booking flow works for a test user.
3. Cancellation link flow works.
4. Admin login works and admin dashboard loads.
5. One club champs page loads correctly.

## Dependency note

Supabase tables and RPC functions must already exist in the project database.

# System Overview

## Big picture

This is one Next.js app that contains:

- website pages
- admin pages
- API routes (backend endpoints)

It uses Supabase for auth + database and Resend for emails.

## Request flow (core logic path)

Most features follow this flow:

1. User clicks/submits in UI page
2. Request goes to a route in `app/api/.../route.ts`
3. Route checks auth/permissions if needed
4. Route validates input
5. Route applies logic/rules
6. Route reads/writes Supabase
7. Route returns JSON/redirect
8. Optional: send email

## Where code lives

- `app/`: pages and API routes
- `app/api/`: backend logic entry points
- `lib/`: shared helpers (auth/client/email/formatting/progress)
- `middleware.ts`: route protection

## Main data areas

- sessions
- signups and waitlist
- attendance
- settings
- admin users
- whitelist + first-time records
- club champs (pairs, pool, knockout)

## Auth model

- magic link sign-in
- admin routes need admin identity in supabase
- middleware + server checks enforce protection

## Known architecture caveat

Some logic is still directly inside route handlers instead of a separate service layer.

That is fine for now, but if features grow:

- move heavy logic into `lib` service modules
- keep route handlers thin (validate -> call service -> respond)

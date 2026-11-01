# Booking and membership rules

Last reviewed: 1 November 2026. This is the handover for club sessions, paid membership, free tasters, credits, waitlists, cancellation and roster renewal. It distinguishes agreed behavior from gaps in the current implementation. It does not cover Club Champs or team attendance.

## Agreed behavior at a glance

| Situation | Expected outcome |
| --- | --- |
| Identifiable paid member books a member session | Treat the **first** and every later booking as an ordinary member booking; apply credits and the same-day rule. Do not give a free taster. |
| Non-member has never booked a taster | Allow one free taster, including an email-only taster for someone without a student ID. A student should provide their ID. |
| Taster cancelled before session start and before attendance | Restore taster eligibility. If the person bought membership meanwhile, retain hidden member-ineligibility history. |
| Taster attended or session started | Taster privilege stays used, even if the person did not show up after the session began. |
| Member books a confirmed place | Reserve one weekly credit immediately, for the **week they booked**, not the week the session takes place. |
| Member joins a waitlist | Reserve no credit until promotion; recheck credit before promotion. |
| Confirmed member cancels before start | Return the credit to the week in which they booked. |
| Session has started | Public cancellation is closed. Admin removal is possible, but the credit remains spent. |
| Membership period ends | Remove current paid-member entitlement; retain bookings, spent-credit history and ineligibility for another free taster. |

The weekly limit is an admin setting. **Dev was 3 credits at the 1 November read-only check**; the database fallback if settings are missing is 2. Dev also had same-day multiple sessions enabled, a seven-day session visibility window and public signup names enabled at that check. Verify settings in each environment before stating a live limit. Booking weeks start Monday 00:00 **Europe/London**, including daylight-saving changes. The same-day rule, when disabled, compares the *session dates* in UK time and counts both confirmed and waitlisted places on that date.

## Identity and paid membership

- `student_whitelist` is the current entitlement list. A member is recognized by normalized student ID **or** normalized roster email. If an ID and email identify different members, reject the booking for admin review. If an ID member books by their roster email and leaves the ID blank, the database resolves the roster ID for credit and same-day checks.
- The public form asks for name, email and (for students) student ID. A non-student member can be added manually with name and email, then book using that email. A name-only roster row cannot authorize booking until an email or ID is supplied. Name matching is for import review; it is not proof of booking eligibility.
- Student IDs normalize to `s` plus seven digits. The form says ID is required for students, but the server does **not** know whether an email-only visitor is a student. Email-only taster abuse through fresh addresses cannot be fully prevented without stronger identity verification; Ashley accepted this practical limit for now.
- Adding a member creates or updates a hidden `first_time_signups` *membership-ineligibility marker*. This blocks another free taster after membership expires. It does **not** make the first session a taster; ordinary member bookings use credits immediately.
- The import accepts a flat XLSX/CSV roster with name and student-ID columns and optional email mapping. It also recognizes the union's **Product Purchasers Report** XLSX layout: only Full Year membership and the selected semester's membership purchases count; all team-fee purchases are ignored. Choose Semester 1 or Semester 2 before upload. Export a date range that includes all relevant full-year purchases, especially when importing Semester 2. The report has no email column, so no-ID buyers remain in manual review and need an email added before they can book.
- Rows with IDs are added/updated by ID; repeat imports do not duplicate them or delete absent members. Identical duplicate ID rows collapse; conflicting names/emails for one ID are skipped and reported with row numbers. No-ID rows are reviewed by normalized name and must be added/updated manually when missing or ambiguous. Correct the source file and re-upload skipped IDs. Manual email-only members can later gain an ID only when identity details agree. The import period filters incoming purchases; it does not store each member's term or expire existing rows. Clear the old roster before a new membership period if the old entitlement list is no longer valid.
- The admin **Clear membership list** action removes every roster entry, including full-year members. It requires typing `CLEAR MEMBERSHIP` and checks that the displayed count is still current. It retains session signups, taster history and spent credits. Use it only when everyone should lose current entitlement; it is not selective semester expiry. Reimport renewed members afterward.

## Taster history and admin visibility

- A non-member's first guarded signup creates a first-time record and flags that session signup `is_taster`. The first-time check is an **OR** match on student ID and email. A student with a new email but the same ID, or a new ID but the same email, is recognized. Someone without an ID is tracked by email only.
- The admin **Free taster bookings** list filters to `is_taster_record=true`. Member-only markers remain in the database but are hidden. A genuine taster who later joins remains visible as a former taster; their old signup stays flagged. Committee session and attendance screens mark taster signups for an in-person check.
- Admins can add an ordinary first-time record manually and remove one that is not tied to member history. Adding paid membership after a taster does not convert the existing taster signup into a member booking; subsequent bookings use member credits.
- A pre-start, unattended cancellation deletes an ordinary taster record so another taster is possible. If membership was added after the taster signup, cancellation clears its visible taster flag but retains the hidden membership marker. An attended taster retains history even if its signup is removed. A member-only marker cannot be removed through the ordinary first-time admin remove action.
- Taster confirmation, promotion and cancellation emails deliberately omit weekly-credit text. This is a messaging rule, **not** an exemption from the current database quota: a confirmed taster currently counts toward that booking week's limit. If they join the club in the same week, the earlier taster can reduce remaining member credits. See the policy decision below.

## Capacity, waitlist and credits

1. The booking function validates identity, taster eligibility, weekly quota and same-day rules, then locks the session row to allocate capacity. A free place becomes `signed_up`; a full session becomes `waiting_list`. Email and student-ID uniqueness within a session prevent duplicates, while different people may share a name.
2. A confirmed place reserves one credit immediately. A waitlist place uses none; it also cannot be a second same-day session when that restriction is on. When a place opens or capacity increases, the earliest eligible waitlisted person is promoted. Promotion rechecks credits for the week they originally joined the waitlist; exhausted people stay on the waitlist for committee review and the next eligible person is tried.
3. Promotion reserves a credit and sends a promotion email. Moving a confirmed booking back to the waitlist **after** session start keeps its spent credit, and it must not be promoted again as a fresh credit. Before start, removing a confirmed signup releases its credit and may promote someone else.
4. Credit balances in member confirmation, promotion and cancellation emails show the booked week's limit, used/reserved amount and remaining amount. They say when no credits remain. A failed email does not undo a successful booking, cancellation or promotion; staff may need to contact the player if delivery fails.

Each session can allow name-and-email booking without paid membership, using the global setting as its default. Such a session bypasses the membership/taster check but still applies the weekly quota and same-day rule. The public session page can optionally show confirmed and waitlist **names** in a Who's going tab; contact details are not published by that API.

Example: with a three-credit quota, a person books one future session on Sunday and two on Monday. The Sunday booking counts in the *previous* UK booking week; the Monday bookings count in the new one, even if all three sessions happen later in that week. If same-day multiple sessions are disabled, they still cannot hold two places for the same UK session date.

## Cancellation and admin interventions

- A cancellation token in the email works only **before the session start time**. The API checks again in the database; invalid or already-used tokens do nothing. Cancelling a confirmed place may promote the next eligible waitlisted person. Cancelling a waitlist place returns no credit because none was reserved.
- Once the session starts, a player cannot cancel through the public link. The committee can remove or move a signup; deleting or moving a confirmed signup then records a spent credit for the original booking week, even for a no-show. Attendance is separate from spending a credit.
- Admin session screens can manually promote, move or remove people; promotion is guarded by capacity and credits. The committee can add someone directly to attendance. Direct attendance addition is an override path and does not run the normal membership/taster booking function; see the gap below before treating it as a free taster.
- Existing signups survive a later membership addition or membership-list reset. The reset does not retrospectively cancel upcoming bookings or waitlist places. Readding a member in the same booking week does not erase earlier credit use.

## Gaps and policy decisions to carry forward

These are **not** guaranteed by the current code. Keep them visible in release review and add tests when implementing a change.

1. **Waitlisted taster that never gets a place.** The current booking function creates a taster-history record when the person joins the waitlist. Cancelling before start removes it, but an unpromoted waitlist place that expires without cancellation can leave the taster marked as used. Desired rule: one pending taster at a time, without permanently consuming it when no place was ever offered. Decide whether to release it automatically after the session ends.
2. **Membership changes during a wait.** Promotion rechecks credits but not paid membership. Someone whose entitlement was cleared could still be promoted from a prior waitlist. Desired rule: for a member session, recheck present eligibility at promotion and skip ineligible people unless the row represents a valid taster.
3. **Bookings after start / when hidden.** Public session APIs enforce visibility and the opening window, but `insert_signup_guarded` does not independently reject a direct RPC call for a hidden, not-yet-open or already-started session. Add database-side checks if these rules must be enforceable against direct clients.
4. **Post-start automatic promotion.** Removing a confirmed signup after start can still run the waitlist promotion trigger. Desired rule: do not offer a place after the session has started; keep the waitlist for historical/admin review.
5. **Direct admin attendance addition.** It bypasses normal membership and taster creation. If staff record a genuine walk-in taster there, they must currently add a first-time record manually or a later taster may be allowed. Decide whether attendance should create that history automatically.
6. **Taster credit policy.** Taster emails hide credits, but the database counts a confirmed taster against weekly quota. Confirm whether tasters should be exempt before changing credit logic.
7. **Semester-only expiry.** Clear removes every member, and the purchase-report period selector only filters the new upload. Renewal currently requires clearing the old roster and reimporting a cumulative report with full-year plus current-semester purchases. If selective expiry without a clear/reimport is required, add explicit membership type/expiry.
8. **Pre-start attendance anomaly.** Admins can mark attendance before start. A subsequent cancellation can restore a member credit while retaining taster history. Decide whether early attendance should be disallowed or should spend the credit.

## Where to change and verify the rules

| Concern | Main implementation |
| --- | --- |
| Booking, member matching, quota, capacity | `supabase/migrations/20261030234500_spend_started_booking_credits.sql` (`insert_signup_guarded`, `get_booking_credits`) |
| UK booking-week boundary | `supabase/migrations/20261027160000_email_only_tasters_and_booking_credits.sql` (`booking_week_bounds`) |
| Membership/taster history and cancellation | `supabase/migrations/20261031010000_member_taster_history_and_cancel_cutoff.sql`, `20261101150000_first_time_taster_visibility.sql` |
| Waitlist credit guards | `supabase/migrations/20261030235000_guard_waitlist_promotions.sql`, `20261030235500_prevent_repromoting_spent_booking.sql` |
| Roster import and reset | `lib/membership-roster.ts`, `app/api/admin/whitelist`, `app/admin/whitelist`, `supabase/migrations/20261101160000_clear_membership_roster.sql` |
| Public signup and cancellation | `app/sessions/[id]/page.tsx`, `app/api/public/cancel/route.ts`, `lib/session-waitlist.ts` |
| Emails and public names | `lib/email-templates-core.ts`, `app/api/public/sessions/[id]/route.ts`, `app/admin/settings/page.tsx` |
| Tests | `tests/integration/booking-dev.test.mjs`, `membership-import-dev.test.mjs`, `membership-clear-dev.test.mjs`, and `tests/*.test.mjs` |

Run unit tests with `npm test` and dev-only database integration tests with `npm run test:db`. The DB tests explicitly refuse any Supabase URL other than the known dev project. SQL changes go in a **new** migration, are dry-run and applied to dev first, and must be applied to production **before** deploying app code that requires them. Vercel's `main` deployment does not apply Supabase SQL automatically. See `docs/runbooks/deploy-and-rollback.md` and the separate `badminton-dev-environment-plan.md` in the parent projects directory for environment history.

# Logic Rules, Edge Cases, and Known Issues

This is the practical behavior guide for the app.

## Booking logic

- A session has a capacity.
- If spots are available, user is confirmed.
- If full, user goes to waitlist.
- Signup is guarded to avoid invalid/duplicate entries.
- Global settings affect booking behavior (quota, booking windows, etc.).
- Users may need to have membership to book tied to either their email and/or their student id.
- A new first time booking may be made for a new user provided that they are a student, they will then be prompted to have membership the next time they try to book.
- Sessions may have the option to not require membership (eg. taster sessions.)


## Cancellation logic

- User cancels with token link.
- When a confirmed slot opens, waitlist promotion can happen.
- Promotion order/eligibility needs to stay consistent with current rules.

## Admin Signin Logic

- Admin logs in with just their email address -> magic link token
- Admin can add and remove other admins
- New admin can attempt sign in once admin has added them to the list (magic link will only be sent when you attempt login).
- Cookies will keep them signed in until expiration. 
- Admin will not have 

## Admin Tools

- Admin can create new sessions with various parameters
- Admin can add or remove people and move people around the waitlist
- Admin can export session data and control release date for sessions.
- Admin has full control over the club champs logic flow
- A quick view of public site button is avaliable.


## Visibility logic

- Booking pages can be switched on/off globally.
- Club Champs public pages can be switched on/off.
- Admin actions are protected and should never be available to regular users.

## Tournament logic (Club Champs)

- Admin workflow is step-based:
  1. pair setup
  2. pool setup
  3. pool matches
  4. knockout setup
  5. knockout matches
  6. export/finalize/reset

## Edge cases to watch

1. Last slot race case:
   - two users submit very close together
   - one should get spot, other should go waitlist
2. Duplicate signup attempts:
   - repeated submits/refreshes should not create duplicates
3. Cancellation token issues:
   - expired/invalid token should fail cleanly
4. Settings toggled mid-flow:
   - if booking is turned off while user is on page, submission should handle gracefully
5. Tournament reset:
   - ensure reset only touches intended club champs data
6. membership booking logic for students vs non students:
   - make sure that email check will work if no student id is provided.
   - make sure that both are checked for the membership and first time booking lists.
   - if first time booking, they cannot use random new emails to bypass system (this is why its only avalible to students and tied to their student id).


## Known common issues

- Testing on local host 3000 will also connect to production, if website in use, consider implementing a new preview environment api keys as well for testing in vercel. this could just be supabase keys needed and the rpc logic copied over.
- If Supabase schema/RPC differs from expected, booking logic fails.
- login for admins only works right now if they are not using the school outlook, there are some security issues that was not able to be bypassed, please use some other email provider or their personal email.
- Logistic issue with late court avaliablity cancellation from the sports union or more courts available last minute. how to mitigate this issue?
- whitelist/membership does not work with excel sheet import yet due to no confirmed coloumn names, can be changed.


## Quick testing checklist after changes

1. Book into non-full session.
2. Book into full session and verify waitlist path.
3. Cancel signup and verify slot/waitlist behavior.
4. Verify admin session edit still works.
5. Verify one club champs action path still works.

## Things to consider implementing

1. Preview api keys once website goes live and in use.
2. Possibly a attendance sheet for team members. (GET YOURSELF TO TRAINING).
3. A more polished ui for users and possibly a new accouncement section that is easy to see and publish in. (images included etc?)

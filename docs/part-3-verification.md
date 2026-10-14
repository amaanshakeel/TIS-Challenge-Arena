# Part 3 — Student Dashboard, Scoring, Leaderboards and Deployment Preparation

Date: 14 October 2026.

**Implementation and local verification are complete. The application is prepared for deployment, not deployed or fully live-verified.** The user reports successful foundation/Part 2 SQL installation; Part 3 SQL must still be installed in the live project. No production accounts, attempts, scores or puzzles were created by these tests.

## Implemented and tested locally

- Exactly two complete dashboards. Student sections: Puzzles, My Profile and Leaderboard, with trusted personal points/rank/solved/availability cards.
- View-only private profile fields, guarded role/status routing, refresh/session restoration and access revocation handling.
- Available published puzzle cards, own attempt/solved state and accessible answer dialogs.
- Safe correct/incorrect/already-solved/unavailable/rate-limit/network/session feedback, validation and submission loading states.
- Atomic answer checking from protected answers, authenticated identity and current profile eligibility; no browser-supplied points or correctness.
- Profile/puzzle row locks coordinating scoring with termination, editing and closure; unique successful-solve protection and immutable point snapshots.
- Multiple incorrect attempts, no additional points/attempt row after a puzzle is solved, and a trusted rolling 20-attempt/minute student limit.
- One canonical database-derived rank calculation shared by public preview, public page, student board and admin board.
- Approved-student ranking membership and equal-score ranks (1,1,3); protected public projection with no IDs/email/registration/status/history/answers.
- Connected landing preview and full public pagination/loading/empty/error/retry states.
- Connected admin ranking table with private participant details and last-solve timestamps; no score editing.
- Mobile/tablet/desktop layouts, keyboard-accessible dialogs and safe DOM text rendering.
- Static GitHub Pages workflow plus full installation/Auth/first-admin/logo/deployment/QR instructions.

## Actual verification results

| Verification | Result | Scope |
| --- | --- | --- |
| `npm.cmd test` | **60 passed, 0 failed** | Full prior and new validation/service/SQL permission/scoring/ranking suites |
| `npm.cmd run test:browser` | **52 checks passed** | Auth/public 19 + administrative 16 + integrated competition 17 |
| `npm.cmd run test:concurrency` | **5 passed** | Native PostgreSQL 17.10, separate connections and verified overlapping lock waits |
| `npm.cmd run check` | **Passed** | 7 pages, 42 local references, 23 JS syntax checks and safe-rendering/public-key checks |
| `npm.cmd run test:live-smoke` | **Passed** | Actual pinned client loads; anonymous live profile/admin access denied; no session fabricated |
| Live public-key HTTP probes | **401 / 42501 as expected** | Installed profiles and admin_overview exist and reject anonymous calls |
| Screenshot inspection | **Performed** | Student desktop/progress/solved card and mobile solving dialog |
| Independent security/code review | **No critical or important findings** | SQL authorization/locks/scoring/privacy and frontend race/error handling |
| Private-key signature scan | **No matches** | Application/test/documentation files, excluding dependencies and ignored scratch artifacts |

New SQL and frontend contracts were written as failing tests before implementation. A native test initially rejected an optimistic version because the pg driver's JavaScript Date parser truncated microseconds; the test now passes the exact database timestamp text, matching the production JSON contract. No timestamp precision was weakened in production.

The independent reviewer suggested matching admin expired-JWT handling to student handling. A regression assertion was observed failing, then passed after adding explicit session-expiry messages and admin access rechecks.

## Genuine overlapping-transaction tests

The native test starts an ignored temporary PostgreSQL cluster on a loopback-only random port, opens separate clients, deliberately holds locks and confirms blocked requests in pg_stat_activity before releasing them. It verifies:

1. Two simultaneous correct submissions for the same student/puzzle result in exactly one correct solve and one `already_solved`, with one point award and one attempt row.
2. A waiting submission sees a committed puzzle closure and cannot record points.
3. A waiting submission sees an authorized admin point edit and records the newly committed point snapshot.
4. A waiting submission sees committed participant termination, fails eligibility and preserves prior scores.
5. A puzzle that expires while the submission waits is rejected using clock time after acquiring its lock.

This is separate-connection PostgreSQL concurrency testing, not merely Promise.all calls serialized through one embedded connection. The temporary server stops at test completion. Ignored scratch database directories remain under `test-results/pg-concurrency-*` for inspection.

## End-to-end browser integration

The competition browser uses the actual application modules and SQL with a test-only HTTP transport and disposable PostgreSQL. It follows:

Registration → trusted pending profile creation → sign-in/pending screen → admin approval → approved Student Dashboard → admin puzzle creation/publication → wrong attempt → correct solve → public/student/admin rankings → refresh/restored progress → termination of an existing session.

It checks profile privacy, no answer fields in student puzzle data, no public identity leakage, exact totals, duplicate awards, tie ranks and layouts at 375/768/1440px. The test Auth transport simulates account/session/email behavior; it is never imported by production modules.

## Live evidence and remaining external dependencies

The user reports applying `schema.sql` and `part2.sql` separately. Current anonymous HTTP probes now return permission denied rather than missing objects. The actual browser client also confirms those denials. **These checks do not establish the complete deployed schema, authenticated policies, signup/confirmation delivery, first-admin provisioning, or production scoring.**

The management connector still reports no permission for project `yrbfryjfnnurpzvwykea`. No unrelated project was altered. A publishable key cannot install DDL or promote an admin, so the new extension is prepared for the user's SQL Editor.

## Required actions

1. In [the supplied project's SQL Editor](https://supabase.com/dashboard/project/yrbfryjfnnurpzvwykea/sql/new), run **`supabase/part3.sql` only**, once. Keep the already installed foundation and Part 2.
2. Configure Auth minimum password length 12, Email confirmation/delivery, and exact site/callback URLs. Local: `http://127.0.0.1:5500/` and `http://127.0.0.1:5500/account.html`.
3. If not already done, create/confirm the intended admin through the website and run `supabase/provision-admin.sql` with its verified UUID/email in trusted SQL Editor. Never add a public promotion operation.
4. Perform the live checklist below before the event.
5. Add the official logo at **assets/logo.png** when available. Text fallback remains functional and aspect ratio is preserved.
6. Commit/push when ready, enable GitHub Pages with **GitHub Actions**, and run/review the supplied Pages workflow. This agent has not committed or published the project.
7. Use the actual successful deployment URL for Supabase Site URL and its exact `account.html` redirect. Expected default URL for the existing remote: `https://amaanshakeel.github.io/TIS-Challenge-Arena/`; verify it before treating it as live.
8. Create the stall QR code from the final verified HTTPS landing URL, not a temporary or dashboard URL.

## Final live checklist — not yet verified

- [ ] Part 3 endpoints and private ranking views installed; correct RLS/grants and no private schema exposure.
- [ ] Real student signup/duplicate handling and actual email confirmation delivery.
- [ ] Intended admin correctly provisioned and able to manage real test registrations/puzzles.
- [ ] Real approved student can solve published/currently available puzzles; wrong attempts award zero.
- [ ] Retries and concurrent live submissions award only one solve.
- [ ] Pending/rejected/terminated users and student calls to admin RPCs are rejected directly.
- [ ] Termination/edit/closure timing behaves correctly in the deployed project.
- [ ] Correct answers inaccessible through ordinary student requests and public responses.
- [ ] All live rankings match trusted solve records and reveal only authorized details.
- [ ] Real session refresh/expiry/logout and allowed Auth callback URLs verified.
- [ ] Supabase Security Advisor reviewed; outstanding relevant findings resolved.
- [ ] Static Pages workflow successfully published, all assets/links work over HTTPS with repository subpath.
- [ ] Real registration → approval → solving → rankings tested on deployed desktop/mobile site.
- [ ] Final QR URL and logo verified.

## Files created or modified in Part 3

```text
Created:
  supabase/part3.sql
  js/competition-service.js
  js/competition-validation.js
  js/leaderboard-ui.js
  js/admin-rankings.js
  js/student-puzzles.js
  css/student.css
  tests/competition.test.mjs
  tests/competition-database.test.mjs
  tests/competition-browser.mjs
  tests/helpers/competition-harness.mjs
  tests/native-concurrency.mjs
  tests/live-smoke.mjs
  .github/workflows/pages.yml
  docs/superpowers/specs/2026-10-14-part-3-design.md
  docs/superpowers/plans/2026-10-14-part-3.md
  docs/part-3-verification.md

Modified:
  student.html
  leaderboard.html
  index.html
  admin.html
  js/student.js
  js/leaderboard.js
  js/admin.js
  js/admin-validation.js
  css/style.css
  tests/admin.test.mjs
  package.json
  package-lock.json
  .gitignore
  README.md
```

## Known limits

- Prepared for deployment; not published by this agent and no deployed HTTPS acceptance test performed.
- Production signup/email/session and authenticated scoring remain unverified until live setup/tests occur. Local Auth fixtures do not prove those paths.
- Client delivery requires network access to Supabase and the pinned esm.sh module. System font fallbacks exist; network request failures are visible.
- Rank data reloads on refresh/tab return and personal successful solves, rather than a Realtime push feed. Refresh to see another student's latest solve.
- Access rechecks close solving/admin dialogs; unsent edits/answers are not autosaved. A lost submission response may leave uncertainty, so refresh trusted progress before retrying; the backend prevents a duplicate award.
- The built-in attempt limiter controls student guessing, not all forms of network abuse. Review Supabase Auth/email limits for expected event traffic.

All requested application functionality is implemented. Full live acceptance and deployment completion depend on the listed external setup and verification.

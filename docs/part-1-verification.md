# Part 1 verification and setup checkpoint

Date: 14 October 2026.

**Part 1 implementation and local verification are complete. Live Supabase setup/verification and GitHub Pages deployment have not been performed.** No external project was created or modified, and no files were committed or pushed.

## Implemented

- Static responsive landing, registration, login, account status, and leaderboard structure.
- Exact application and society branding, tagline, six-step participation instructions, configurable event/contact details, logo text fallback.
- Seven required registration fields, controlled/configurable semesters, optional department dropdown, inline validation, password controls, submission loading and duplicate-click protection.
- Pinned official Supabase client integration with public-key validation and request timeouts.
- Email-confirmation-aware registration feedback, privacy-aware duplicate email handling, safe duplicate-number/signup failure guidance.
- Login, session validation/restoration, sign-out, status refresh, missing-profile handling, guarded routing for approved/pending/rejected/terminated users, approved-admin verification.
- Exactly two dashboard shells. Full admin operations and student competition controls are deferred to their specified parts.
- Single SQL foundation: profiles, puzzles, protected answers, submissions, limited admin audit records, constraints, indexes, RLS and explicit grants.
- Trusted profile creation defaults every signup to student/pending regardless of supplied role/status. Auth email synchronization, restricted first-admin setup script, and protected scoring foundation.
- Setup/deployment/logo instructions and test tooling.

## Actual test results

| Verification | Result | What it establishes |
| --- | --- | --- |
| `npm.cmd test` | **26 passed, 0 failed** | Authentication contracts plus 17 SQL subtests and the SQL suite container |
| `npm.cmd run test:browser` | **19 checks passed** | Actual pages/modules in Chromium, with fixture Auth transport for online flows |
| `npm.cmd run check` | **Passed** | 7 HTML pages, 38 local references, 13 JS syntax checks, no innerHTML assignments, public-key configuration checks |
| Screenshot inspection | **Performed** | Desktop landing at 1440px and mobile registration at 375px |
| Responsive overflow checks | **Passed** | Landing/register/login/account/leaderboard at 375, 768, and 1440px |
| Independent review | **No blocking or important findings** | SQL privileges/RLS, registration/provisioning, session routing, safe rendering and tests reviewed |
| Pinned client URL | **HTTP fetch succeeded** | Version 2.57.4 module wrapper exports the expected browser bundle |

The authentication tests were written and observed failing before their implementation. The SQL test initially failed because the schema was absent, then exposed an actual SQL quoting error, which was corrected before the suite passed.

SQL tests use PGlite's PostgreSQL engine, execute the complete schema, and switch actual database roles. They test:

- Spoofed admin/approved signup metadata remains student/pending.
- Registration uniqueness after trim/case normalization, with Auth insertion rolled back on duplicate.
- Trusted validation of required metadata.
- Anonymous profile/answer access denied; student profile access limited to ownership.
- Direct self-approval, promotion, profile insertion and submission insertion denied.
- Editable Auth metadata cannot change profile authorization.
- Verified admin reads without recursive RLS.
- Pending, rejected, terminated, future, expired and closed/draft puzzle access restrictions.
- Approved student puzzle reads and protected-answer non-disclosure.
- Status termination taking effect immediately without replacing token context.
- Email mirroring and private submission history.
- Successful-solve uniqueness, awarded-point constraints and scoring-term locks.
- Admin privileges removed when approved status is revoked.
- Admin provisioning placeholder/mismatched-email rejection, successful promotion and audit privacy.

Browser checks cover required branding, validation, loading recovery, password visibility, configuration failure, mobile navigation, refresh/session routing, protected dashboards, sign-out, required pending message, confirmation redirect subpaths, duplicate-email privacy, signup error redaction, safe rendering and missing-profile denial.

## Important verification limits

The local Auth schema and auth.uid() are test fixtures. The browser's online Auth transport is also a test fixture, isolated to tests. **No live email/password signup, email confirmation, production session, deployed PostgREST permission check, or live admin login has been verified.** PGlite is not a full Supabase deployment. No production mocks or fake leaderboard records are present.

No concurrent answer submission or live scoring was tested: those operations are deliberately not implemented until Part 3. The SQL tests verify the foundation constraints, not the full scoring workflow.

Duplicate registration numbers are prevented securely, but Supabase Auth may hide the underlying trigger error. The public UI cannot reliably distinguish that specific failure without a private-data enumeration endpoint. It provides understandable sign-in/TIS-stall guidance instead of exposing internal errors.

The SDK and optional typography require external delivery; auth-module load failures are visible and system fonts provide a typography fallback. Supabase Auth email recipient limits/delivery settings need review before use with real students.

## Required actions before live Part 1 verification

Follow the step-by-step instructions in `README.md`:

1. Create/select a fresh dedicated Supabase project.
2. Apply `supabase/schema.sql` once through SQL Editor.
3. Set the public URL and publishable/anon key in `js/config.js`; never use a private key.
4. Configure email/password, minimum password length, confirmation choice, and exact local/production redirect URLs.
5. Register and confirm the intended admin, then run the restricted provisioning script with its verified UUID/email.
6. Add the official logo at `assets/logo.png` when available.

## Live test checklist — not yet performed

- [ ] Register a real student with valid information and verify the profile is student/pending.
- [ ] Register with a duplicate email and with a duplicate normalized registration number; verify no conflicting profile exists and UI offers safe guidance.
- [ ] Confirm the email using the actual delivered link; verify `account.html` works under the intended site subpath.
- [ ] Sign in as a pending student; verify required message and sign-out.
- [ ] As the trusted SQL operator, temporarily set test profiles to approved/rejected/terminated, verify routing, and restore the intended state. Full admin management arrives in Part 2.
- [ ] Sign in as the securely provisioned admin and verify the admin shell.
- [ ] Refresh a signed-in page, sign out, and test an expired/invalid session.
- [ ] Using authenticated student requests directly in browser developer tools, attempt profile update/insert and submission insert; verify permission denial, not merely hidden controls.
- [ ] Query another student's profile and `puzzle_answers`; verify no private rows or answers are returned.
- [ ] Use the public key without a session; verify private table queries are denied.
- [ ] Revoke a test student's approved status while its session remains active; verify protected puzzle queries stop returning rows.
- [ ] Verify RLS is enabled on all five tables, the private schema is not exposed, and Security Advisor has no unresolved relevant findings.
- [ ] Verify delivery/limits for the actual event's student email domains.

## Created files

```text
.gitignore
.nojekyll
README.md
index.html
register.html
login.html
account.html
leaderboard.html
admin.html
student.html
assets/README.md
css/style.css
css/auth.css
css/dashboard.css
css/responsive.css
js/config.js
js/supabase-client.js
js/auth-service.js
js/access.js
js/validation.js
js/common.js
js/auth.js
js/registration.js
js/login.js
js/account.js
js/admin.js
js/student.js
js/leaderboard.js
supabase/schema.sql
supabase/provision-admin.sql
package.json
package-lock.json
tests/auth.test.mjs
tests/database.test.mjs
tests/browser.mjs
tests/check.mjs
docs/superpowers/specs/2026-10-14-part-1-design.md
docs/superpowers/plans/2026-10-14-part-1.md
docs/part-1-verification.md
```

Screenshots are local ignored artifacts in `test-results/`. The official logo itself is intentionally absent.

## Next part

Part 2 will add the single Admin Dashboard's real statistics, registration search/filtering, approval/rejection, termination/restoration, audit records, and secure puzzle creation/editing/publication/closure. **Do not start Part 2 without the user's explicit instruction.**

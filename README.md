# TIS Challenge Arena

**Tech and Innovative Society (TIS)** · **Think. Solve. Rise.**

A campus puzzle competition: students register, visit the TIS stall for verification, wait for approval, and then solve challenges for points. **All three original parts are implemented and locally tested, and the organizer reports the deployed application is working.** The new five-level visual competition is implemented locally; its SQL extension, updated GitHub Pages files and organizer-selected question sets must be installed before it opens to participants.

## What is included

- Responsive landing, registration, login, account-status, and public leaderboard structure.
- Email/password Supabase Auth integration, email-confirmation handling, validation, safe error messages, session restoration, and logout.
- Pending, rejected, terminated, and approved account routing.
- A complete Admin Dashboard with database-derived overview statistics, searchable/filterable/paginated registration and participant tables, approvals, rejection, termination/restoration, and puzzle creation/editing/publication/closure.
- A complete Student Dashboard with Puzzles, My Profile and Leaderboard, trusted progress/rank cards, solving dialogs and view-only registration details. Exactly two dashboards exist.
- Atomic, audited admin operations authorized by the current database role/status; stale edits and historical scoring terms are protected.
- PostgreSQL schema, trusted signup/email-sync triggers, RLS, explicit read-only client privileges, and secure first-admin provisioning.
- Atomic answer checking and point awards; repeated and simultaneous correct requests cannot double-score.
- Shared database-derived public/student/admin leaderboards with equal-points ranks and a restricted public projection.
- Local authentication/permission tests, complete UI-to-SQL browser tests, and native PostgreSQL multi-connection race tests.

No sample participants, invented scores, custom passwords, or mock backend transport are included in production. Test records and Auth transports are isolated to `tests/` and disposable local databases.

## Five-level visual competition

The optional course adds opening questions, the supplied society-logo jigsaw, the supplied robot-image jigsaw, a timed branching maze, and final questions. Levels unlock in order, with a yellow/green/red progress strip. Timed boards resume their server-owned deadlines after refresh, and visual completion uses the existing leaderboard.

Run `supabase/visual-puzzles.sql` after the first three SQL files, then `supabase/question-attempt-limit.sql`. Configure **Competition levels** in the Admin Dashboard. Questions allow two attempts; two incorrect answers close the question at zero points. A phase finishes when every assigned question is solved or closed. The course starts closed and needs real question sets selected by the organizer. Follow [the installation guide](docs/visual-puzzles-setup.md) and [two-attempt update instructions](docs/question-attempts-setup.md) before opening it to participants.

## Technology and files

Production uses HTML5, CSS3, vanilla ES modules, Supabase Auth/PostgreSQL, and GitHub Pages. No build or Node production server is required. Node packages are optional **development test tools only**.

```text
index.html                 Public landing
register.html / login.html Authentication forms
account.html               Confirmation and access-status screen
leaderboard.html           Public database-derived rankings
admin.html / student.html  The two complete guarded dashboards
assets/README.md           Official logo instructions
css/                       Shared, authentication, dashboard, responsive styles
js/config.js               Editable public configuration
js/supabase-client.js       Version-pinned client loader
js/auth-service.js          Auth API contracts
js/auth.js / access.js      Page guards and role/status destinations
js/validation.js            Input validation and safe messages
js/common.js                Shared navigation, branding, UI utilities
js/*.js                     Focused page controllers
supabase/schema.sql         Single transactional foundation schema
supabase/part2.sql           Admin RPC extension; apply after schema.sql
supabase/part3.sql           Scoring/student/leaderboard extension; apply after part2.sql
supabase/provision-admin.sql Restricted setup script
tests/                      Development tests
docs/part-1-verification.md Actual verification results and external checklist
docs/part-2-verification.md Part 2 results and current project setup checklist
docs/part-3-verification.md Final verification and live/deployment checklist
.github/workflows/pages.yml Static-only GitHub Pages deployment workflow
```

## 1. Run the frontend locally

Open this folder in VS Code. In a terminal in the project folder, run:

```powershell
python -m http.server 5500 --bind 127.0.0.1
```

Visit `http://127.0.0.1:5500/`. Keep the terminal open while testing. VS Code Live Server is another option. Use HTTP rather than opening files with `file://`; browser modules and Auth redirects need a web origin.

The public project configuration is already entered. Registration requires the foundation, management requires Part 2 SQL, and solving/rankings require Part 3 SQL. Use the browser developer tools Console and Network panels for diagnostics, but never paste session tokens or private credentials into issues or chat.

## 2. Create and configure Supabase

**Current project:** `https://yrbfryjfnnurpzvwykea.supabase.co`. Its publishable key is in `js/config.js`. On 14 October 2026, Auth settings returned HTTP 200 with Email enabled and confirmation required. After your reported SQL installation, private profile and admin RPC probes returned permission denied as expected for anonymous clients. A real browser loaded the pinned SDK and confirmed those denials. The connected management account still lacks access to this project, so this agent cannot apply the new SQL or inspect private records.

**Your next step:** open this project's [SQL Editor](https://supabase.com/dashboard/project/yrbfryjfnnurpzvwykea/sql/new) and run **`supabase/part3.sql` only**, as a new query. Do not rerun the foundation or Part 2 you already installed. All extensions are transactional and reload the PostgREST schema cache.

For a fresh installation, apply **`schema.sql` → `part2.sql` → `part3.sql`** in order, as separate queries. Check existing state with `select to_regclass('public.profiles');` before installing the foundation. If an object exists but REST cannot find it, check the exposed `public` schema and run `notify pgrst, 'reload schema';` through SQL Editor.

1. Use the supplied project in the [Supabase Dashboard](https://supabase.com/dashboard/project/yrbfryjfnnurpzvwykea). For a different installation, create a dedicated fresh project. Do not install over another application's tables or triggers.
2. In **SQL Editor**, open a new query, paste the complete contents of `supabase/schema.sql`, and run it as the trusted default database role. It creates all objects within one transaction. Apply it **once**. A failed statement rolls back the foundation; diagnose the error before retrying. An installed schema must be extended through later SQL changes, not reinstalled.
3. Run `supabase/part2.sql` once after the foundation, then `supabase/part3.sql` once. They install administrative/competition RPCs without direct client table-write permissions. Skip scripts already installed.
4. The supplied public URL/key are configured. For another project, copy its **Project URL** and **publishable key** into `js/config.js`. A legacy **anon** key also works. Never use a secret key, service-role key, database password, or private token in the website:

```js
supabaseUrl: 'https://yrbfryjfnnurpzvwykea.supabase.co',
supabaseKey: 'sb_publishable_Jeamq-xPFcNkDroiaHjusQ_QqIsb8Uf',
```

5. Leave the Data API enabled for the `public` schema. Do **not** expose the `private` schema. Verify the five application tables have RLS enabled. The SQL explicitly grants SELECT to `authenticated`; `anon` has no private table access. Do not add broad write grants to fix a permission error.
6. Under **Authentication**, enable the Email provider and email/password signup. Disable anonymous sign-in and unused social providers. Set the minimum password length to **12** to match the form; the app accepts 12–128 characters. Database signup validation checks student fields; Auth is responsible for password enforcement.
7. Decide whether to require email confirmation. If enabled, users confirm their email and then wait for TIS approval. Confirmation never approves a student.
8. In **Authentication → URL Configuration**, set a local Site URL of `http://127.0.0.1:5500/` while testing and allow the exact redirect `http://127.0.0.1:5500/account.html`. Add the production origin/subpath when deploying. If using `localhost` instead, add its exact URL too; it is a different origin.
9. Keep the default confirmation email template using `{{ .ConfirmationURL }}`. This static frontend uses the client's implicit callback handling on `account.html`. Do not replace it with a server-only callback template.
10. Review Auth rate limits and email delivery before the event. Supabase's default email service has recipient/throughput restrictions; with confirmation enabled, test actual student email delivery. Configure Supabase-supported SMTP if needed, or deliberately disable email confirmation after considering your registration verification process. No separate notification integration is part of this app.

The client is the official **`@supabase/supabase-js` version `2.57.4`**, loaded on demand from `https://esm.sh/@supabase/supabase-js@2.57.4?bundle`. Its API version is pinned. esm.sh serves its browser-compatible ES module build; no runtime npm installation is needed. Client-module or font delivery can fail on restricted networks; the app uses system-font fallbacks and a visible client-load error. The font provider is Google Fonts, not an analytics integration.

The browser stores Supabase session tokens through the client's standard session persistence; it does not store passwords or custom authorization claims. RLS looks up the current stored profile rather than trusting browser state or editable user metadata. Plain-text content is rendered through `textContent` and DOM construction.

## 3. Register and create the first admin

There is no public admin signup or default admin password. Use this controlled procedure:

1. Register the **intended admin's email** through the website using valid identifying fields. Initially it receives `student` / `pending`, just like every signup. If that person is not a student, use their actual name, department label, and a unique internal registration identifier approved by your society; these are setup identifiers, not an invented university registration. Use a valid semester value for the foundation profile.
2. Confirm the email if required. In **Authentication → Users**, verify that the email is the intended administrator's and copy the exact user UUID.
3. Open `supabase/provision-admin.sql`. Replace the all-zero UUID and `REPLACE_WITH_VERIFIED_ADMIN_EMAIL` with the verified UUID/email. Paste and execute the script in Supabase **SQL Editor**, as the trusted project owner. Both values must match the Auth user, and the profile must exist. This script is not a browser RPC and cannot be run with the public key.
4. Sign in on `login.html` and confirm you reach `admin.html` and see your name. Admin access requires both the stored admin role and approved status.
5. Register a separate student, then confirm opening `admin.html` routes that student to `account.html`. Verify direct profile UPDATE attempts are denied as described below.

Creating an Auth user directly in the dashboard without student metadata is intentionally rejected by the registration trigger. Use the website for the initial account. Do not disable the trigger to get around this. After provisioning, avoid saving files containing personal admin identifiers into a public repository.

## 4. Registration behavior and configuration

- New profiles always have `role = student` and `status = pending`. Supplied metadata cannot override these.
- Full name and department: 2–100 characters; registration number: 1–50, no control characters.
- Registration numbers are unique after trimming ordinary outer spaces and folding case. For example, ` CS-001 ` and `cs-001` identify the same registration.
- Email is normalized for input and mirrored from Auth for authorized views. Auth owns passwords and authoritative email; an Auth email-update trigger maintains the mirror.
- The form initially offers semesters 1–8. Edit `config.semesters` to match your institution. The database permits 1–12; if you need a different range, change both the table constraint and signup trigger alongside the configuration.
- `config.departments = []` uses carefully validated free text. Supply the actual university list to use a dropdown. The database still validates lengths; the configurable list is a usability control, not a claim of authoritative department validation.
- `eventDescription` and optional `contactUrl` are centralized in `js/config.js`. No dates, contact details, sponsors, or prizes are invented. Contact URLs accept HTTPS or mailto.

With confirmation enabled, Supabase may intentionally obscure whether an email already exists. The UI therefore offers a neutral check-email/sign-in response when returned identities indicate an existing account. Duplicate registration numbers are always rejected transactionally by SQL, but Auth may return only a generic trigger failure. The UI explains that a number might already be registered and offers sign-in/stall assistance. There is deliberately no public endpoint to enumerate private student registration numbers.

The signup trigger is intended for a **fresh project**. Existing Auth users need a separately reviewed profile backfill; this repository does not silently fabricate their student information.

## 5. Database security model

| Object | Anonymous | Student | Approved admin | Trusted writes |
| --- | --- | --- | --- | --- |
| profiles | No access | Own row | All rows | Trusted Auth triggers/setup SQL and validated admin status RPC |
| puzzles | No access | Only approved students, published/currently available rows | All rows | Validated admin puzzle RPCs |
| puzzle_answers | No access | No rows | Read | Validated admin puzzle RPCs |
| submissions | No access | Own history | All history | Authenticated approved-student submission RPC only |
| admin_audit | No access | No rows | Read | Trusted setup/admin functions only |

Admins have no direct client table-write privileges. The Part 2 dashboard uses narrowly scoped validated RPCs. Do not grant table writes as a shortcut. Private `SECURITY DEFINER` functions have fixed search paths and check the current approved-admin row. The exposed functions are security-invoker wrappers with parsed SQL-standard bodies and authenticated-only execution; they bind private references at creation without granting clients private-schema usage. Never expose the `private` schema through the Data API.

The dedicated `public_leaderboard` RPC alone is also executable by anonymous clients. Its response contains only **rank, display_name, points, solved_count** and paging metadata. Private ranking views have no client read privileges. Protected answers never appear in student puzzle or public ranking responses.

Foreign keys restrict deletion to preserve history. Admin saves lock answer, case-sensitivity, and points after **any recorded attempt**, preserving historical interpretation. Puzzle content/publication can still change. Row locks and expected timestamps reject stale edits. Scoring locks the participant and puzzle rows, coordinating with termination and admin edits; a partial unique index independently prevents duplicate successful solves. Totals sum trusted successful-submission point snapshots and never depend on mutable puzzle points.

## Scoring and leaderboard rules

- Only the authenticated, currently approved **student** can submit; admins, pending, rejected and terminated users cannot.
- Only published puzzles currently inside their opening/closing window accept attempts. Availability is checked with the actual clock **after** waiting for locks.
- Answers trim outer ASCII spaces, tabs, CR/LF, form feeds and vertical tabs. Internal whitespace, punctuation and accents remain significant. Case-insensitive comparison uses PostgreSQL `lower()` unless the admin enabled case sensitivity.
- Incorrect attempts award zero points. The first correct solve awards the puzzle's committed point value and records a snapshot. Later solved-puzzle retries return `already_solved` with **zero additional points** and no additional attempt row.
- Multiple incorrect attempts are allowed. A trusted per-student limit of **20 recorded attempts in a rolling minute** applies across puzzles. Blocked requests return a wait interval and record no attempt. This limits rapid guessing; it is not a general network DDoS defense. Supabase handles Auth rate limits separately.
- All competition leaderboards include approved students only, including approved students with zero points. Admins and pending/rejected/terminated accounts are excluded. Termination never deletes previously earned records; restoration reinstates eligible rankings with the same history.
- Equal total points receive equal competition ranks: **1, 1, 3**. Case-insensitive display-name order and an internal ID keep pagination stable without providing a competitive tie-break advantage. IDs are never returned publicly.
- Public/student/admin views use the same private aggregate and rank calculation. Private registration details appear only in the guarded admin ranking view.
- Refresh buttons and page/tab return reload data. Successful solves immediately refresh the student's progress and puzzle state. Other viewers refresh their board to see the latest committed results; no additional Realtime integration is required.

## Admin operation rules

- **Approve:** pending or rejected student registrations can become approved. This permits a reviewed rejection to be reconsidered.
- **Reject:** pending registrations only. To remove an approved student's access, use Terminate.
- **Terminate:** saves the student's current pending/approved/rejected status and blocks further competition access. History remains.
- **Restore:** restores exactly that saved status. It cannot accidentally approve a pending/rejected student. A legacy terminated record with no saved status needs trusted operator review.
- **Create/edit puzzle:** title, description, answer, points, optional difficulty and availability dates. Dates are entered/displayed in the administrator's device timezone and sent as absolute timestamps.
- **Publish/close/unpublish:** database-authorized, confirmed actions. Only published puzzles inside their configured time window are readable and accept scored submissions from approved students.
- **Scoring locks:** after an attempt, disabled editor controls reflect the server-enforced answer/points/case lock. An admin cannot override it through a crafted request. No delete or manual score-edit controls exist.
- **Concurrency:** stale status changes and puzzle edits are rejected; refresh/reopen the record before retrying. Updates are reflected only after successful database operations.
- **Access rechecks:** active dialogs close and delayed editor loads are canceled while access is revalidated. Save or cancel changes before leaving the tab or deliberately rechecking access; unfinished edits are not autosaved.
- **Audit:** sensitive status changes and puzzle mutations record actor, target, timestamp and before/after metadata. Correct answers are not copied into audit details.

Public display names default to full names. Registration discloses that these will appear publicly after approval. Review this naming choice against your society's privacy expectations before the event. Emails, registration numbers, internal IDs, and private statuses will not be public leaderboard fields.

## 6. Tests

Optional developer tooling needs Node.js. It is not needed by the deployed website.

```powershell
npm.cmd ci
npm.cmd test
npx.cmd playwright install chromium
npm.cmd run test:browser
npm.cmd run test:concurrency
npm.cmd run check
```

On other shells, use `npm` / `npx`. `.cmd` avoids Windows PowerShell execution-policy restrictions. Pinned development dependencies and `package-lock.json` make test installation reproducible. Native PostgreSQL requires its platform binaries; install normally so required native package setup scripts can run. `test:concurrency` starts a temporary server on an unused loopback port, runs overlapping transactions through separate clients, then stops it. It leaves ignored scratch clusters under `test-results/pg-concurrency-*` for inspection; these can be removed after the test.

Optional **read-only live** probe: `npm.cmd run test:live-smoke`. It loads the actual pinned browser client and checks that anonymous profile/admin access is denied. It never signs up users, signs in, writes records, or validates authenticated production flows.

SQL tests execute the real schema using PGlite's embedded PostgreSQL engine and switch between actual `anon`/`authenticated` roles. The Auth users table and auth.uid() token context are fixtures. These tests verify SQL execution, RLS, constraints and triggers locally; they do not verify the deployed PostgREST API, Supabase's Auth service, email delivery, project privileges, or production configuration.

Browser tests serve the actual pages beneath `/arena/`, check responsive layouts, validation and missing configuration, and test routing with an isolated fake Auth transport. That transport exists only in `tests/browser.mjs`, never in production code. Screenshots are placed in ignored `test-results/`.

The administrative browser test sends actual UI-generated RPC arguments through a test-only HTTP transport into the real SQL functions in a disposable PostgreSQL instance. It verifies UI → SQL → database → UI results, with Auth/session fixtures. The supplied production Supabase project is not modified by these tests.

The competition browser test walks registration → pending status → admin approval → publication → solving → all boards against actual SQL in a disposable database. Auth/password verification and confirmation emails are fixtures; they are not a substitute for real Supabase Auth acceptance testing.

See `docs/part-3-verification.md` for final results and remaining live checks. The earlier part reports are historical checkpoints. Do not call the app event-ready until the live setup, real-account acceptance flow and deployed HTTPS checks pass.

## 7. GitHub Pages preparation

1. Create or select your GitHub repository, then commit and push the project files. Keep `node_modules`, private credentials and personal setup copies out of Git.
2. Recommended: under **Settings → Pages**, choose **GitHub Actions** as the source. `.github/workflows/pages.yml` stages only HTML, CSS, JavaScript, assets and `.nojekyll`, then deploys on a push to `main` or manual workflow dispatch. It does not install npm packages or deploy tests, SQL, documentation or database scratch data. The workflow follows [GitHub's Pages workflow guidance](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
3. Wait for the workflow to succeed and copy the URL GitHub actually reports. This repository's remote is `https://github.com/amaanshakeel/TIS-Challenge-Arena`; its expected default Pages URL is `https://amaanshakeel.github.io/TIS-Challenge-Arena/`. This expected URL is not a claim that deployment has occurred.
4. Set the actual full HTTPS URL, including repository subpath/trailing slash, as the Supabase Site URL. For the expected default domain, allow the exact callback `https://amaanshakeel.github.io/TIS-Challenge-Arena/account.html`. Preserve local redirects if still needed. Custom domains require corresponding exact URLs.
5. Verify over HTTPS that assets load, signup/confirmation/sign-in work, sessions restore, and restricted users cannot access protected data. Paths and filenames are case-sensitive on GitHub Pages.
6. After the actual deployed site is verified, use its **final HTTPS landing-page URL** for the stall QR code. Do not use localhost, a temporary preview, or a dashboard URL. No QR code is generated before the URL is confirmed.

This agent has not committed, pushed or deployed this work. To publish from this folder after reviewing it:

```powershell
git add .
git commit -m "Build TIS Challenge Arena"
git push -u origin main
```

Check the existing remote and branch before pushing. For branch-based Pages instead of the supplied workflow, choose `main` and the repository root, and avoid enabling both deployment approaches simultaneously. All links and Auth callbacks use relative paths and retain repository subpaths.

## 8. Add the official logo

Your supplied society logo is installed at **`assets/puzzles/tis-logo.jpeg`** and is used in the site header and as the browser tab icon on every page. The header retains a TIS text fallback if the image cannot load. `--logo-size` and `.brand-mark` in `css/style.css` control dimensions; `object-fit: contain` preserves aspect ratio.

## Troubleshooting

- **Online sign-in is not configured:** enter the correct public URL/key in `js/config.js`. Never use a service-role or secret key; the loader rejects them.
- **Sign-in service could not load:** check internet access to esm.sh and reload. Offline authentication is not supported.
- **Registration could not complete:** check required fields and uniqueness of registration number. In the project's Auth/database logs, inspect trigger/constraint failures privately. No user profile is left partially created when the trigger fails.
- **No confirmation email:** check spam, email rate limits, delivery settings and recipient restrictions. Approval and email confirmation are separate steps.
- **Confirmation link fails:** verify the exact redirect, use a fresh link, and avoid link-tracking rewrites in email delivery. Already-used links may be invalid.
- **Permission denied:** verify the complete schema was installed and RLS/grants were not changed. Do not disable RLS.
- **Profile unavailable:** this account may predate schema installation. A trusted operator must investigate and backfill accurate data; students cannot insert their own profiles.
- **Approved status not reflected:** refresh the account status, return to the tab, or sign in again. Database access checks use current status on every query.
- **Dashboard database setup incomplete:** apply `part2.sql` after the installed foundation. Check exposed `public` schema and RPC grants; do not add direct table write permissions.
- **Competition database setup incomplete:** apply `part3.sql` after the already installed Part 2 extension. Public leaderboard queries need the explicit anonymous execution grant in that script.
- **Puzzle closed/unavailable:** the admin may have closed/unpublished it or its time window has ended. Refresh the puzzle list; a stale open dialog cannot bypass backend availability checks.
- **Too many attempts:** wait for the interval reported by the server, then retry. Switching devices does not reset the trusted student limit.
- **Record changed since opening:** another operation changed it. Refresh/reopen it; an old save must not overwrite newer data.
- **Auth user deletion fails:** historical records intentionally prevent deletion. Use participant termination/restoration to manage access.
- **Logo request returns 404:** include `assets/puzzles/tis-logo.jpeg` in your GitHub push. The header uses its text fallback if the asset is missing.

Official references: [Auth signup](https://supabase.com/docs/reference/javascript/auth-signup), [managing user data and triggers](https://supabase.com/docs/guides/auth/managing-user-data), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [production and email readiness](https://supabase.com/docs/guides/deployment/going-into-prod).

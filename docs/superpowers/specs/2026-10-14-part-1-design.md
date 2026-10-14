# TIS Challenge Arena — Part 1 design

Status: approved by the user on 14 October 2026; Part 1 implemented and locally verified. Live Supabase setup and verification remain pending.

## Purpose and scope

Build the foundation for a real campus puzzle competition organized by Tech and Innovative Society (TIS). Use the application name TIS Challenge Arena and tagline Think. Solve. Rise. Follow the supplied master specification in three separate deliveries. This design covers Part 1 only; stop after its completion report and await explicit instructions for Part 2.

Use HTML5, CSS3, vanilla ES6+ JavaScript, Supabase Auth/PostgreSQL/RLS, and GitHub Pages. No frontend framework, production Node server, additional hosting service, fabricated event details, generated logo, or sample production rankings.

## Architecture and alternatives

Recommended: static multi-page frontend with shared JavaScript modules and PostgreSQL authorization functions. Relative links and URLs resolved against the document location preserve GitHub Pages repository subpaths. Database roles and current profile status govern access; browser routing supplies the user experience only.

Alternative: Supabase Edge Functions for privileged operations. These can work, but introduce another deployment surface and transaction coordination without a requirement that needs it. Prefer SQL for the current scope.

Alternative: a single-page vanilla application. This reduces page duplication but requires additional routing and history handling on GitHub Pages. The requested multi-page structure is easier to operate and maintain.

## Files and responsibilities

- `index.html`: landing page, navigation, hero, six participation steps, society introduction, leaderboard preview placeholder, footer.
- `register.html`, `login.html`: accessible authentication forms.
- `account.html`: pending, rejected, terminated, email-confirmation, and missing-profile states with sign-out and status refresh where applicable.
- `leaderboard.html`: public page structure explicitly awaiting Part 3 data integration.
- `admin.html`, `student.html`: exactly two protected dashboard shells. Full administrative functionality is Part 2; student competition functionality is Part 3.
- `css/style.css`, `css/auth.css`, `css/dashboard.css`, `css/responsive.css`: shared tokens, page styling, responsive layouts.
- `js/config.js`: public Supabase URL/key, semester choices, optional department choices and event/contact settings.
- `js/supabase-client.js`: one version-pinned official browser client and configuration validation.
- `js/common.js`: branding, mobile navigation, shared rendering and formatting.
- `js/auth.js`: authentication, session lifecycle, trusted profile retrieval, destination selection, page guards.
- `js/registration.js`: form validation and signup workflow.
- `js/login.js`, `js/account.js`, `js/admin.js`, `js/student.js`, `js/leaderboard.js`: focused page controllers; dashboard and leaderboard controllers remain limited to Part 1 scope.
- `assets/README.md`: instructions for the user-supplied `assets/logo.png`; no replacement image is created.
- `supabase/schema.sql`: single foundation schema with constraints, grants, policies, triggers, and authorization helpers.
- `supabase/provision-admin.sql`: restricted SQL-editor procedure; no client-executable admin promotion endpoint.
- `tests/`: local checks and SQL permission regression tests.
- `README.md`, `.gitignore`, `.nojekyll`: setup, operating boundaries, static hosting compatibility.

## Visual design

Use an editable navy, teal, and warm-neutral palette, strong typography, restrained cards, generous spacing, and accessible contrast. These are provisional application colors, not claimed official branding. Use a text TIS fallback when the supplied logo is absent, preserve its aspect ratio, and centralize its dimensions.

Make navigation keyboard accessible and compact on mobile. Use semantic headings, associated form labels, visible focus states, useful inline validation, live status messages, touch-friendly buttons, and reduced-motion support. No invented statistics, prizes, dates, sponsors, or contact information.

## Database foundation

Create `profiles`, `puzzles`, protected `puzzle_answers`, and `submissions`, with a small administrative audit table if necessary for the status-management foundation. UUID foreign keys, timestamps, bounded text, positive points, valid status/difficulty values, coherent availability dates, and lookup indexes enforce data integrity.

Profiles reference Supabase Auth users. A trusted signup trigger validates student metadata and always assigns `role = student` and `status = pending`, disregarding any supplied role or status. Registration numbers are trimmed and compared case-insensitively for uniqueness; document this convention. Department may be validated free text until official choices are supplied. Semester choices are configurable within documented database bounds.

Supabase Auth owns passwords and authentication email. If profile email is mirrored for administration, a trusted Auth update trigger maintains it; it is not an authentication authority. Do not authorize from editable user metadata or cached browser state.

Submissions reserve trusted correctness and awarded-point fields for Part 3. A uniqueness constraint for successful student/puzzle pairs and a points snapshot establish the future scoring invariant without implementing submission or leaderboard operations in Part 1. Preserve historical records using restrictive deletion rules.

## Permissions and access control

Enable RLS on every application table and explicitly grant only required operations. Anonymous users cannot read private profiles, submissions, or answers. Authenticated users may read their own profile; verified admins may read participant records. Students have no direct insert, update, or delete permissions on profiles, answers, puzzles, or submissions.

Use narrowly scoped authorization helpers with fixed search paths and schema-qualified objects. Helpers consult current stored role/status, avoid recursive profile policies, and have explicit execution permissions. Keep internal elevated helpers in a non-exposed schema. Future public RPCs must explicitly validate the caller and revoke default PUBLIC execution.

Puzzle SELECT policy permits verified admins and approved students viewing published, currently available puzzles. Correct answers remain separate and unavailable to students. No submission endpoint is introduced before Part 3. Administrative mutation interfaces are deferred to Part 2; first-admin provisioning is available only through trusted setup SQL.

## Authentication flows

Registration collects full name, normalized email, password and confirmation, registration number, department, and semester. Validate locally for usability and in trusted database logic for integrity. Disable duplicate submissions and display clear errors without returning internal SQL details.

After successful signup, show exactly: “Your registration has been received. Please visit the TIS stall for verification and further information.” Explain email confirmation when enabled and never bypass it. Handle Supabase duplicate-email privacy behavior with a neutral check-email/sign-in message when an existing account cannot be disclosed reliably. A trigger failure may surface as a generic signup failure; provide recovery guidance without exposing raw details or creating a public registration-number lookup.

Login uses email/password only with show/hide password and loading/error states. Restore sessions on refresh, retrieve the current trusted profile, and route admins to the admin shell, approved students to the student shell, and other statuses to the account screen. Missing profiles and invalid sessions fail closed. Recheck access on page return and sensitive actions; database policies remain the definitive enforcement layer.

Use Supabase's standard session persistence, document that browser-readable session tokens require careful XSS prevention, and never store passwords or custom authorization claims. Render user data with textContent. Authentication callbacks must work under repository subpaths.

## Setup and verification

Before implementation, verify applicable Supabase changelog and official documentation, choose and pin a supported browser client version, and inspect available local/database testing tools.

Locally verify JavaScript syntax, links/assets, validation, routing decisions, configuration failure states, and responsive authentication pages as tooling permits. Run permission regression tests against a local PostgreSQL/Supabase environment when available, exercising anonymous, student, and admin database roles rather than just UI visibility.

Tests must cover metadata role/status spoofing, normalized registration-number duplicates, access to other profiles and answers, forbidden direct writes, pending/rejected/terminated puzzle access, approved student access, and admin provisioning restrictions. Auth integration tests require Supabase Auth; SQL-only tests do not prove email confirmation or live signup behavior.

Document exact external steps: create/select Supabase project, apply schema, configure Auth email/password and redirects, supply only public URL/key, create intended admin Auth account and promote its exact UUID through restricted setup SQL. Do not modify an unrelated connected project or request private keys.

Without an available test database or project credentials, explicitly mark live signup, confirmation, deployed RLS, and admin login as unverified. Do not claim deployment or full live security verification. Part 1 delivery must distinguish implemented/prepared work from tests actually executed.

## Delivery boundary

Provide the required Part 1 completion report only after implementing its applicable acceptance criteria and reporting every remaining external dependency. Include features, changed files, actual test results, required setup, and limitations. Explain that Part 2 adds participant review, approval/rejection, termination/restoration, puzzle management, and administrative statistics. Do not begin Part 2 automatically.

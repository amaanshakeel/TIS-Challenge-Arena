# Visual competition verification — 14 October 2026

The five-level competition is implemented locally. Production installation and publication remain organizer actions described in visual-puzzles-setup.md.

## Verified results

- `npm.cmd test`: 74 passing unit and database tests, zero failures.
- Browser suites: 19 foundation, 16 admin, 17 original competition and 19 visual competition checks pass (71 total). The full suite passed, and the affected visual suite was rerun after the final sticky-timer change.
- `npm.cmd run test:concurrency`: nine passing checks on native PostgreSQL using separate connections. These include simultaneous starts, same-revision moves, duplicate final placements and deadline revalidation after waiting for a lock.
- `npm.cmd run check`: seven HTML pages, 44 local references and 30 JavaScript syntax checks pass, with safe text rendering and public-key configuration checks.
- `git diff --check`: no whitespace errors in tracked changes.
- Both copied puzzle assets have SHA-256 hashes identical to their supplied originals.

The browser tests exercise the complete five-level flow, desktop dragging, keyboard placement and retained focus, mobile touch placement, a visible timer while scrolling, refresh/resume with the original deadline, slow request processing, recovering an accepted move after losing its response, maze walls and a legal longer route, expiry without restart, question completion, existing leaderboard totals and admin preview isolation.

Database checks exercise malformed configuration, unavailable questions leaving an unstarted course editable, all-question phase completion, closed required questions remaining required, legacy answer endpoint gates, immutable scoring terms, editable instructions and schedules, revision reconciliation, swapping pieces, eligibility, privacy, termination and course closure.

An independent source review found four issues in the initial implementation. Timer anchoring, keyboard focus, unavailable-question participation and missing instruction/schedule settings were corrected and regression-tested. Follow-up review found no remaining material issues in those fixes.

## Boundaries

Tests use disposable local PostgreSQL databases and isolated Auth fixtures, not authenticated sessions against the production Supabase project. The agent has not applied the new SQL to that project or pushed/deployed these changes. Images and browser-rendered pieces remain accessible to participants; the implementation does not guarantee prevention of automation or AI assistance.

Desktop and mobile logo screenshots are available locally under test-results/arena-logo-desktop.png and test-results/arena-logo-mobile.png. The final completed-course screenshot is test-results/arena-completed.png. Test artifacts are ignored by Git.

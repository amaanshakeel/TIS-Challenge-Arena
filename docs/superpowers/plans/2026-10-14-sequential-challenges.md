# Sequential Challenges Implementation Plan

> Execute inline with superpowers:executing-plans, task by task, followed by one independent review.

**Goal:** Deliver opening questions, logo jigsaw, robot jigsaw, timed maze and final questions with trusted sequential unlocks.

**Architecture:** Add private competition configuration and per-student timed attempts, exposed only through authorized RPC wrappers. Reuse existing puzzles/submissions for question content and point totals. Add focused controllers to the existing dashboards; retain standalone puzzles and GitHub Pages hosting.

**Tech Stack:** Vanilla HTML/CSS/JavaScript, Supabase PostgreSQL, existing PGlite and Playwright development tools.

**Spec:** docs/jigsaw-levels-design.md (approved with instruction to implement).

## Constraints and decisions

- Exactly two dashboards, no production server or new runtime dependency.
- Yellow current level, green completed, red locked, with visible status labels.
- One timed attempt; original server deadline survives refresh. Any legal maze route completed before expiry succeeds.
- Original images are copied unchanged. Robot board preserves its landscape ratio.
- Questions are selected from existing text puzzles, with separate opening/final sets.
- Configuration starts disabled. Admin must select real questions and publish the complete course; no fabricated question content.
- Defaults: logo 4×4/180 seconds, robot 4×6/300 seconds, maze 180 seconds. Admin may edit before participation.
- Implementation is authorized inline; do not pause again for plan approval or publish externally.

## Tasks

- [x] Database: write failing behavioral tests; add supabase/visual-puzzles.sql with arena configuration, ownership/eligibility checks, level gates, persistent attempts, revision-checked moves, atomic scoring and immutable course terms after participation. Validate malformed inputs, expiry, repeated completion and legacy answer bypass.
- [x] Game components: write failing maze topology/state tests; implement js/arena-model.js, js/jigsaw-game.js, js/maze-game.js and js/timed-game.js. Persist each move; reconcile stale responses; support pointer, touch and keyboard interaction.
- [x] Dashboard integration: add arena service/student controller, top progress strip and game dialog. Add admin Competition levels section with question selection, settings, publication control and isolated visual preview. Copy both supplied assets.
- [x] Browser verification: exercise question → both jigsaws → maze → final questions, reload/resume, mobile layout, expiry and admin validation using real local SQL fixtures.
- [x] Review and delivery: run existing checks/regressions, independent code review, address findings, update installation instructions and report exactly what must be run/pushed by the organizer.

## Review focus

- Configuration changes while a move or first question submission is executing must not alter the attempt's terms.
- Repeated/late/out-of-order moves cannot overwrite a newer state or double-score.
- Closing a dialog or revoking access while a request is running cannot reopen protected content.
- Slow connections must preserve the timer and clearly allow recovery after an ambiguous response.
- Empty question sets, malformed maze layouts and unavailable images cannot silently publish an unusable course.

## Execution ledger

- Planning complete. Existing standalone question flows remain separate; new arena APIs gate assigned questions including the legacy submit_answer endpoint.

- Database, game components and both dashboard integrations complete. Source assets copied unchanged.
- Independent review completed; all four material findings corrected and covered by regressions.
- Final checks: 74 unit/database tests, 71 browser checks, nine native concurrency checks, and HTML/JavaScript/path validation pass. Sticky timer verified on a scrolling mobile puzzle after the full regression run.
- Delivery prepared: docs/visual-puzzles-setup.md and docs/visual-puzzles-verification.md. Production SQL installation, question selection and GitHub Pages publication remain organizer steps.

# Two attempts per question

## Activate the change

1. Ensure schema.sql, part2.sql, part3.sql and visual-puzzles.sql are already installed. Do not reinstall them.
2. In a new Supabase SQL Editor query, paste the whole contents of supabase/question-attempt-limit.sql and run it. This update is transactional and safe to rerun.
3. Push the updated frontend files to GitHub and let the existing Pages workflow deploy them. Refresh the student dashboard on each device.

## Rules

- Each student gets two submitted answers per question, including standalone questions and both question phases.
- A correct answer on the first or second attempt earns the configured points once.
- A wrong first answer earns nothing and leaves one attempt.
- A wrong second answer permanently closes that question for that student at zero points. Its answer form cannot reopen, including in another tab or after signing out or refreshing.
- A question phase finishes once every assigned question is either solved or closed after two wrong answers. A closed question contributes no points, but does not prevent advancement.
- The jigsaw and maze rules are unchanged: they each have their original single timed attempt.

Empty/invalid answers, requests for unavailable questions and rate-limited requests do not use an attempt. Only answers recorded by the server count. If a response is lost after the server records an answer, that answer still counts: close and reopen the question to restore the saved number of attempts before sending another answer. The app blocks resubmission while that result is unknown.

Existing incorrect submissions count toward the limit; previously awarded correct scores remain intact. This update does not erase history or reset attempts. The server enforces ownership, eligibility, level order and the limit; changing browser controls cannot grant another scored attempt.

## Verification

Tests cover correct-on-second scoring, two wrong answers, repeated and concurrent requests, invalid/unavailable submissions, reload and stale-tab reopening, lost-response recovery, opening/final phase advancement, historical awards and reinstalling the update. They run against disposable local PostgreSQL and browser fixtures; production installation and authenticated acceptance testing remain organizer steps.

Local verification on 14 October 2026: 84 unit/database tests, 80 browser checks (including nine two-attempt checks), ten native PostgreSQL concurrency checks, and the HTML/JavaScript/path checks passed. An independent review's unknown-response recovery finding was corrected and regression-tested. The SQL has not been applied to the production project by this agent.

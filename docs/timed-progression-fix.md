# Timed-level progression fix

## Activate

1. In Supabase SQL Editor, open a new query and run the entire contents of **supabase/timed-level-progression.sql**. Run this after visual-puzzles.sql and question-attempt-limit.sql; do not reinstall the earlier scripts. This fix is safe to rerun.
2. Push the updated frontend files to GitHub and let Pages redeploy.
3. Refresh the student dashboard and choose **Refresh levels** if needed.

Existing expired attempts immediately satisfy the previous-level requirement. No registrations, scores, attempts or deadlines need to be deleted or reset.

## Corrected behavior

- A successful timed challenge earns its points once and shows a disabled **Completed** button.
- A timed-out challenge remains **Expired**, earns zero points and shows a disabled **Time expired** button. The next level unlocks.
- This applies to both jigsaws and the maze. Each keeps its original single attempt; expiry never restarts a timer or creates a successful submission.
- Earlier unresolved levels still block advancement. Course closure and publication windows still apply.
- A question phase still finishes only when every question is solved or has used both incorrect attempts.
- A participant can finish the whole course with a mixture of completed and expired timed challenges. Only successful solves contribute points.

The previous implementation required successful timed completion to open the next gate and offered a read-only view button for completed challenges. This update changes those two rules to the organizer's latest requested behavior.

## Verification

Regression tests reproduce an already-expired robot attempt under the previous implementation, apply the fix and check that the maze becomes available without extra points. They also cover expiry without reopening the old challenge, final-question access, preserved deadlines, rerunning the update and other students' unresolved gates. Browser tests check disabled completed buttons and the entire logo-timeout → robot-timeout → maze-timeout → final-questions route.

Local checks passed: 89 unit/database tests, 86 browser checks, 11 native PostgreSQL concurrency checks and static HTML/JavaScript/path validation. Independent review found no material issues. The new SQL and frontend changes are prepared locally; production installation and deployment remain organizer steps.

# Install the five-level competition

The course runs inside the existing student and admin dashboards:

1. Opening questions
2. Society logo jigsaw
3. Robot workspace jigsaw
4. Timed maze
5. Final questions

The top progress strip shows the current level in yellow, completed levels in green and locked levels in red. Labels accompany the colors. Completing a level unlocks the next; the database enforces this order.

## Database update

Your existing schema.sql, part2.sql and part3.sql must already be installed. In your project's Supabase SQL Editor, open a **new query**, paste the entire contents of **supabase/visual-puzzles.sql**, and click **Run** once. Do not rerun the foundation or earlier parts. The new script is transactional: if it fails, its changes roll back together.

This script preserves existing accounts, standalone questions, submissions and leaderboard scores. It adds private course settings and timed attempts, plus authorized RPC endpoints. It does not open or populate question phases automatically.

## Publish the application files

Commit and push the updated project files to your existing GitHub repository. The current GitHub Pages workflow deploys the static files as before. Include both files in assets/puzzles/; they are the supplied original images, copied unchanged:

- tis-logo.jpeg
- robot-workspace.png

There is no new production dependency or build step. The Supabase public configuration already in js/config.js stays in place.

## Configure the course as an administrator

1. Sign in with your existing approved admin account.
2. In **Puzzles**, create the questions you want for the opening and final phases. Enter their correct answers and points, then publish them. Use separate questions for each phase. A question with previous standalone attempts cannot be assigned to this new course.
3. Open **Competition levels**, then choose **Refresh settings** if you just created questions. The first visit prepares the visual challenges as drafts.
4. Select the opening and final question sets. Every selected question must be solved to complete its phase. Avoid future opening times or early closing times unless you intend participants to wait for those questions.
5. Review the defaults: logo 4 × 4 pieces / 180 seconds / 100 points; robot 4 × 6 pieces / 300 seconds / 150 points; maze 180 seconds / 150 points. Increasing the jigsaw grid increases difficulty. All timers support 30–1,800 seconds. Add challenge instructions and optional opening/closing times in your local time zone.
6. Preview both pictures and the maze. The maze has dead ends, loops, a shorter route and longer routes. You can generate a different maze or edit its layout. Preview does not create student attempts or award points.
7. Select **Open the five-level competition** and choose **Save competition settings**.

Question sets, challenge grids, maze layout, timers and scoring terms become locked once a participant makes an opening-question attempt. Configure and preview the whole course before opening it. You can still edit titles, instructions and availability dates, or close and reopen the course. Closing it stops play but does not pause or extend existing deadlines. Extending an availability window also does not extend an existing attempt's deadline.

Existing standalone puzzles stay separate. A level question can still be edited for its explanatory content and availability in Puzzles, but its answer and points are protected after course participation begins. Closing a required question does not remove it from the completion requirement.

## Participant controls and timer rules

For jigsaws, drag a piece onto a board cell, or select the piece and then select its destination. Keyboard users can Tab to a piece, select it with Enter or Space, then Tab to the destination and select it. Occupied cells exchange pieces. Partial placements do not reveal whether they are correct.

For the maze, use arrow keys while focused on the maze or its direction controls, or tap the on-screen buttons. Move through open corridors from the top entrance to the bottom exit. Any legal route completed before the deadline succeeds; a shorter route helps save time.

Opening challenge instructions does not start the timer. **Start timed attempt** starts or resumes the student's single attempt. The remaining time and moves are saved by Supabase. Closing the dialog, switching tabs, reloading or changing the device clock does not reset the deadline. An expired timed level awards no completion points and leaves later levels locked; there is no participant restart.

If a move fails or its response is lost, use **Restore saved state**. The server's state and revision decide which move was accepted. Never assume that an error means the server did not receive the move.

Visual completion points use the existing submissions and leaderboard calculation and can be awarded only once. Images and browser-rendered pieces are necessarily visible to participants; this is not a guarantee against AI assistance or browser automation.

## Local verification

Development tools only (on Windows, use npm.cmd if PowerShell blocks npm.ps1):

```powershell
npm.cmd test
npm.cmd run check
npm.cmd run test:browser
npm.cmd run test:concurrency
```

These use disposable local databases and test Auth transports. Production authenticated acceptance testing remains an organizer step: verify the complete course with an approved test participant after running the SQL update and deploying the files. Do that before real participants start, because course settings freeze at the first question attempt.

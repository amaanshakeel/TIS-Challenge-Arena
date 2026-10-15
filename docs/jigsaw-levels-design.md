# Timed visual challenges and sequential levels

## Agreed scope

The competition has five levels, unlocked in this order:

1. Opening question phase.
2. Jigsaw made from the supplied Tech & Innovative Society logo.
3. Jigsaw made from the supplied Friendly Robot in a Bright AI Workspace image.
4. Timed maze.
5. Final question phase, with a separate set of questions.

Participants must complete a level to unlock the next. These challenges belong in the existing student and admin dashboards. The application remains a static HTML/CSS/JavaScript site hosted on GitHub Pages with Supabase handling authorization, attempts, progression and scoring.

## Proposed participant experience

The student dashboard shows a horizontal progress strip at the top with five numbered levels. The current available or in-progress level is yellow, completed levels are green, and locked levels are red. Each item also has a text label and status icon so color is not the only status signal. On smaller screens, the strip can scroll horizontally without shrinking its labels beyond readability. An expired attempt retains an explicit Expired label and unlocks the next level at zero points. Locked levels explain which preceding level must be finished. The first level is available only to approved participants and within its publication schedule.

Before starting a timed challenge, participants see its instructions, number of pieces or maze description, time limit and points. A deliberate Start button begins the attempt; merely opening the instructions does not start the clock.

The proposed first jigsaw, at level 2, uses the supplied logo without altering its artwork, divided into a 4 × 4 grid of 16 pieces, shuffled into a tray. Its default time limit is three minutes. Both the piece count and time limit are configurable by the administrator before attempts begin. Higher difficulty can use a 5 × 5 or 6 × 6 grid.

Participants drag pieces into board cells on a computer. On touch devices, they can select a piece and tap its destination. The same selection interaction is available through keyboard controls. Placed pieces can be moved or exchanged; pieces do not reveal whether a partial placement is correct. The completed board is checked by the server.

The remaining time stays visible. Closing the dialog, changing tabs or refreshing the page does not pause or reset the attempt. Reopening an active challenge resumes the saved board with the original deadline. Completion within the deadline awards points once and unlocks the next level. Expiry ends the attempt, awards zero points and unlocks the next level. Completed and expired challenges have disabled buttons and cannot be reopened through their cards. There is one attempt per timed level and no participant-controlled restart.

The second jigsaw, at level 3, uses the supplied robot image and follows the same rules with independently configured difficulty and duration. Its board preserves the landscape image's aspect ratio rather than cropping it to a square. Grid rows and columns can differ. Both source images are supplied and must be used without redrawing their artwork.

The maze, at level 4, has an entrance on one boundary and an exit on the opposite boundary. Participants navigate corridors with branching choices, dead ends, longer routes and at least one shorter route. The layout must have multiple valid entrance-to-exit routes, rather than only one solution. The player moves through adjacent open cells and cannot cross walls. Keyboard arrows and on-screen direction buttons support computers and touch devices. Participants must reach the exit within the configured time. Choosing a shorter route saves time; the proposed completion rule accepts any legal route that reaches the exit before the deadline, without requiring the mathematically shortest path. Maze generation or validation must check connectivity, reachable dead ends and different-length alternative routes before publication.

The opening and final question phases use the existing trusted answer-checking system. The organizer assigns a separate question set to each phase in the admin dashboard. Each question allows two submitted answers: a correct answer on either attempt earns points once; two incorrect answers permanently close that question at zero points. Participants finish a phase when every assigned question is solved or closed after two wrong answers. This terminal-question rule was explicitly selected by the organizer. The question phases have no additional timer. Standalone questions use the same two-attempt limit.

## Administrator experience

The existing puzzle editor gains a challenge type and level assignment. Jigsaw settings include an image asset, grid size, duration, points, instructions and publication schedule. Maze settings include a validated wall layout, start and finish, duration and points. Question puzzles retain their existing answer and case-sensitivity settings.

The five-level competition is published only after all five levels have usable content. The administrator can save and preview the supplied jigsaws while the maze and question sets remain drafts. Preview attempts do not affect student attempts, scores or progression.

Once a level has any student attempt, its image, grid or maze layout, duration, level assignment and scoring terms become immutable. Publication availability and explanatory text can still be changed through audited operations. Closing a level stops further play. Existing answer-based puzzles retain their present scoring protections.

## Trusted backend behavior

An additive SQL migration follows schema.sql, part2.sql and part3.sql. It preserves existing text puzzles and adds level definitions, challenge settings and student attempt records. Client code cannot write these tables directly. Authenticated RPCs verify the current stored student role and approved status for every action.

Starting a challenge checks its publication window and the preceding level's completion, then creates or returns the student's existing attempt. A unique constraint prevents additional attempts for the same student and challenge. Supabase records the start and deadline using server time; the deadline is the earlier of the configured duration and the challenge's closing time.

Moves validate ownership, current status, board bounds and server time, and persist the authoritative state. Maze moves additionally validate adjacency and walls. The server checks the final jigsaw arrangement or maze endpoint rather than accepting a client-provided completed flag. Each question phase finishes when every assigned question has either a successful submission or two incorrect submissions. Administrative publication closure alone does not satisfy this rule. Question membership becomes immutable when participation begins.

Completion, the existing successful submission record, point award and next-level unlock happen atomically. Repeated completion requests return the recorded result without awarding more points. Profile, puzzle and attempt locks use a consistent order so simultaneous moves, termination and administrative closure cannot bypass the rules. Expired attempts cannot be revived by repeated start requests or changing the device clock.

Source images and puzzle graphics must be available to participants for rendering. These puzzles increase the effort required to solve by hand, but cannot guarantee prevention of AI assistance or browser automation. Authorization, deadlines, progression and duplicate scoring are enforced on the server.

## Files and integration

- Store the supplied original at assets/puzzles/tis-logo.jpeg when implementation begins.
- Store the supplied robot original at assets/puzzles/robot-workspace.png when implementation begins.
- Add focused jigsaw, maze and timed-attempt controllers rather than enlarging the answer form controller.
- Extend student puzzle cards and the existing student dashboard with level status and visual challenge dialogs.
- Extend the existing admin editor with challenge settings and validation.
- Add a Supabase migration and a short installation guide. The user must run the migration in the SQL editor for their project; this agent does not have management access to that project.
- Continue using the current static GitHub Pages workflow. New assets, JavaScript and SQL are prepared locally before publication.

## Verification

Database tests cover locked-level access, one attempt, server expiry, refresh/resume, invalid moves, account termination, administrative closure and atomic scoring. Concurrent completion requests must award points once. Tests must also preserve the existing text-puzzle behavior.

Browser tests cover desktop placement, touch selection, keyboard placement, restoring a partially completed board, expiry, completion feedback and all five sequential unlocks. They check the yellow current, green completed and red locked progress states, including readable text indicators on mobile. Maze checks cover blocked moves, dead ends, legal longer and shorter routes, and expiry before reaching the exit. Admin tests cover validation, preview isolation and immutable settings after attempts begin. Existing authentication, dashboard, answer-checking and leaderboard checks run before declaring the implementation complete.

## Review decisions

The five-level order and progress colors are confirmed by the organizer. Both jigsaw images are supplied. Implemented defaults are 16 pieces and three minutes for the logo, 24 pieces and five minutes for the robot, and three minutes for the maze. Timed challenges have one attempt and any legal maze route completed before the deadline succeeds. The later approved question update allows two answers per question and advances a phase when every question is solved or exhausted. Standalone puzzles remain independent of the level sequence. The organizer selects the real question contents and reviews settings before publication.

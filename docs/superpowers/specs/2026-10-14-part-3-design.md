# Part 3 — student competition and deployment preparation

The user authorized Part 3 and reports the foundation and Part 2 SQL installed separately. Live public-key probes now return permission denied for profiles and admin_overview rather than missing-object errors. Preserve their schema and previous administrative code; install only the new extension.

## Trusted operations

Add `supabase/part3.sql`. Use the same private security-definer endpoint / parsed public security-invoker wrapper convention, fixed search paths and explicit execute grants. No direct client writes or public answer reads.

`submit_answer(p_puzzle_id,p_answer)` accepts no student ID, correctness, or point value. Lock the current authenticated approved-student profile FOR UPDATE, then the puzzle FOR UPDATE, using the same row that admin edits lock. Revalidate publication and availability using current clock time after locking. Normalize outer whitespace without changing internal whitespace/punctuation, fold case unless the puzzle is case sensitive. Read the protected answer internally, record the actual attempt with a point snapshot, and award only one successful solve. Return only an outcome and points awarded, never the answer. Already-solved retries return no additional award or attempt. Allow multiple incorrect attempts, with a trusted limit of 20 attempts per student in a rolling minute; return retry guidance without scoring on blocked requests.

The profile lock coordinates with termination and serializes simultaneous submissions; the successful-solve unique index is independent duplicate-award protection. Preserve history and scoring locks from Part 2. Future native multi-connection tests must cover actual overlapping transactions; do not mistake a single embedded connection's Promise.all queue for separate-connection concurrency.

Internal private ranking views aggregate trusted successful-submission snapshots and apply `rank()` by total points descending. Approved students only appear in competition rankings; equal points produce equal competition ranks (1,1,3), stable display order by name and internal ID only for presentation. Exclude admins and pending/rejected/terminated profiles from all competition boards, without deleting earned history.

`public_leaderboard(p_page,p_page_size)` is available to anonymous/authenticated callers and returns only rank, display_name, points, solved_count and paging metadata. No IDs, private statuses, email, registration or individual submission data. `admin_rankings` uses the same internal ranking calculation and adds private identity/details/last solve only after current-admin authorization.

`student_overview()` and `student_puzzles(p_page,p_page_size)` require the current approved-student role. Overview returns trusted personal points/rank/solved count and available puzzle count. Puzzles return only currently published/available content, own attempt count and solving state. No answer data in responses.

## Interface

Complete the existing Student Dashboard with exactly three main sections: Puzzles, My Profile and Leaderboard, plus persistent database-derived progress cards. Profile is view-only; use the guarded own-profile record. Paginate puzzle cards, show solving/attempt state and availability, and provide a keyboard-accessible solving dialog with answer validation, request loading and clear safe feedback. Successful scoring refreshes overview, puzzles and the displayed leaderboard. Invalidate delayed reads/dialogs on access rechecks, and handle status revocation and expired sessions.

Connect the landing preview and public leaderboard, with loading/empty/error/retry and server paging. Public table never renders private fields or internal IDs. Connect Admin Dashboard rankings to trusted `admin_rankings`; retain administrative private details only inside its protected section. All text uses DOM construction/textContent.

## Verification and deployment boundary

Write tests before backend and service implementation. Execute all three SQL scripts in a disposable PostgreSQL engine, test identity/status restrictions, availability, case/whitespace normalization, zero points for incorrect attempts, first-solve uniqueness/retries, rate limits, leaderboard consistency/ties/privacy, historical preservation and scoring locks. Browser flow must cover real UI-to-SQL transport for registration/approval/publishing/solving/rankings where practical; Supabase Auth remains explicitly a fixture without real-account access.

Prepare GitHub Pages workflow/deployment instructions and exact Supabase callback URLs, logo placement and final-URL QR guidance. Do not push or publish without the required concrete deployment context. Connected Supabase management access was unavailable in Part 2; check current capability but do not ask for private credentials. User may need to run part3.sql and provision the first admin. Disclose every live-account, concurrency or deployment verification boundary. No fake production data.

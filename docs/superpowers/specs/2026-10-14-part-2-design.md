# Part 2 — Admin Dashboard design

Implement the user's already supplied Part 2 requirements, authorized by their instruction to start Part 2. Preserve the Part 1 architecture and work in place. Do not begin Part 3.

## Scope and interface

Extend the existing Admin Dashboard into five sections: overview, registrations, participants, puzzles, and rankings. Use the existing public-key client and trusted auth guard. Render all returned text safely. Include loading/empty/error/success states, native accessible confirmation dialogs for sensitive participant actions, responsive tables, search, status filters, stable sorting, and server pagination.

Overview counts must come from one trusted SQL read, including total/pending/approved/rejected/terminated student registrations, puzzle totals/published totals, actual attempts and successful solves. No invented numbers. Rankings remain an explicit Part 3 placeholder; no manual scores or competing leaderboard calculation.

## SQL extension

`supabase/part2.sql` extends `schema.sql`; no foundation objects are recreated. Internal elevated functions live in `private`, have empty search paths, validate current auth.uid(), and are not exposed to clients. Exposed public RPC wrappers use security-invoker SQL, with explicitly revoked PUBLIC/anon execution and authenticated-only execution. Every internal endpoint authorizes against the current stored approved-admin row. Client table writes remain denied.

RPCs:

- `admin_overview()` returns counts as JSON.
- `admin_participants(p_search,p_status,p_sort,p_page,p_page_size)` returns student rows and total/page metadata. Search is literal case-insensitive substring over name/email/registration/department, capped at 100 characters. Sort options are newest, oldest, name, and registration; use deterministic ID tie order. Max page size 100.
- `admin_change_status(p_student_id,p_action,p_expected_status)` locks and validates a student profile, checks expected current status, changes access atomically, and audits old/new status. Approve pending/rejected; reject pending; terminate any nonterminated student; restore terminated to stored pre-termination status only. Never mutate admins or fabricate an approved restoration state.
- `admin_puzzles(p_search,p_status,p_page,p_page_size)` lists puzzle metadata with accurate attempt/success counts and scoring-lock indication, but no correct answers in list responses.
- `admin_puzzle(p_puzzle_id)` returns one editable puzzle and its protected answer only to an approved admin.
- `admin_save_puzzle(p_puzzle_id,p_title,p_description,p_answer,p_points,p_difficulty,p_status,p_opens_at,p_closes_at,p_case_sensitive,p_expected_updated_at)` validates input, serializes edits with a puzzle row lock, and writes puzzle/answer together with audit. Edits use optimistic timestamp checking. Scoring terms are locked after any submission (stricter than the foundation trigger) to prevent stale-answer attempts changing meaning. Existing answers can be kept by passing null; new puzzles require an answer. Failed saves roll back all changes.
- `admin_set_puzzle_status(p_puzzle_id,p_status,p_expected_updated_at)` safely publishes/closes or returns a puzzle to draft. Cannot publish without a valid protected answer. Shared locking ensures later Part 3 submissions can coordinate on the same puzzle row.

Bound content, positive integer points, optional controlled difficulty, finite dates and opens-before-closes validation apply in JavaScript and SQL. Use PostgreSQL clock timestamps for optimistic version values so two writes in one transaction cannot silently reuse the same timestamp. Do not offer deletion or manual score editing.

## Testing and delivery

Write SQL tests first with the Part 1 PGlite Auth fixtures; test student/anonymous RPC denials, role/status revocation, every status transition, preservation of records, stale requests, invalid fields, atomic puzzle/answer writes, scoring locks and correct-answer privacy. Test pagination/search/sorting and actual overview aggregates.

Browser tests use real application modules and fixture transports, visibly isolated from production. Exercise dashboard sections, approved admin access, status action confirmations and refresh, puzzle creation/edit/publication/closure, validation, server failures and mobile tables. Update Part 1 browser tests to isolate missing configuration now that the production URL/key are present.

Live checks: provided URL/key successfully reach Auth; email confirmation is enabled. REST reports missing profiles in schema cache. Connector SQL permission is denied for this project. Supply exact installation order and first-admin/redirect instructions, and distinguish local verification from pending live tests. Do not ask for private credentials or touch a different project.

Stop after the Part 2 checkpoint and await authorization for Part 3.

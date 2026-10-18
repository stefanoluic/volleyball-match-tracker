# Volleyball Match Tracker

A web application for recording volleyball match events and displaying statistics to coaching staff.

The application supports registration, session-based login/logout, administrator
approval, blocking and permanent deletion of blocked user accounts, and team
management, team rosters, match scheduling, match participant selection and
starting sets with saved initial lineups, point recording and undo, automatic
service/rotation tracking, ordinary player substitutions, libero replacements,
set completion, match completion, optional point classification/player attribution
and team/player statistics by set or whole match, with automatic polling for coaching staff.
Coaching recommendations and reporting
are not implemented yet.

## Stack

- Java 21, Spring Boot 4.1.1, Maven
- PostgreSQL 18, Spring Data JPA, Flyway
- Spring Security for session authentication, CSRF protection and role-based access
- Argon2id password hashing
- React 19, TypeScript, Vite, Mantine UI
- Docker Compose for the development database

## Windows quick start

Double-click Pokreni.cmd in the project folder. It checks prerequisites, starts
Docker Desktop if needed, waits for the database, starts the backend and frontend
in the background, and opens http://localhost:5173 when both servers are ready.
Existing project servers are reused; another application occupying a required
port is not stopped or replaced.

Double-click Zaustavi.cmd to stop this project's servers and database.
It does not delete database volumes or stop Docker Desktop itself. Servers started
manually are stopped only when their command line identifies this exact project.
Restarting the backend clears login sessions, so sign in again after restarting.

The scripts require the tools listed below and an existing local .env file.
They never overwrite .env. If frontend dependencies are missing, startup runs
npm ci using the existing lockfile. Startup can take longer on the first run.
Local process records and timestamped logs are kept in the ignored .local-run
folder. On failure, the launcher shows an error and waits for a key press.
The CMD wrappers use a PowerShell execution-policy override only for the
launcher process; they do not change the computer's saved policy.

Launcher safety tests use fake processes and do not stop real applications:

~~~powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\test-local-app.ps1
~~~

For terminal use, including verification without opening a browser:

~~~powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\local-app.ps1 -Action Start -NoBrowser
~~~

## Run locally

Requirements: Java 21, Maven 3.6.3 or later, Node.js 22.22.2+, 24.15+ or 26+, and Docker Desktop
with the Linux container engine running.

From the project root, create the local configuration:

```powershell
Copy-Item .env.example .env
```

Set a local password in `.env`. This file is ignored by Git. Spring Boot and
Docker Compose both read it; browser code does not receive database credentials.

Start the database from the project root:

```powershell
docker compose up -d --wait
```

In a separate terminal, start the backend:

```powershell
cd backend
mvn spring-boot:run
```

In another terminal, start the frontend:

```powershell
cd frontend
npm ci
npm run dev
```

Open <http://localhost:5173> to sign in or register. Registered accounts must be
approved by an administrator before they can sign in.

The backend runs at <http://localhost:8081>. Its health endpoint is
`GET /api/system/health`. The Vite development server proxies `/api` requests to
the backend, so the browser uses the frontend origin.

The database is exposed only on localhost, at port 5433. It uses its own Docker
volume and does not use the database of the earlier university project.

## Build and check

```powershell
cd backend
mvn verify
```

```powershell
cd frontend
npm run check
npm test
npm run build
```

Backend tests cover bootstrap, hashing, registration, validation, account status,
authorization, CSRF, session ID rotation, blocking, permanent deletion, logout,
and team/player CRUD, validation, foreign-key and jersey constraints, concurrent
roster writes, match scheduling, time-zone conversion, match/team deletion guards,
match participant snapshots, stale-save protection, first-set lineups, atomic match
start, duplicate-start protection, point history, last-point undo, idempotent retries,
concurrent score writes, substitutions/libero replacements and reverse-order corrections,
point classification, pre-rally player eligibility and migration of existing score-only points,
whole-match/set aggregates, cancelled-point exclusion, roster snapshots and statistics access,
server/rotation recovery after undo,
deuce/tie-break rules, complete 3:0/3:2 match flows,
set transitions and role-based access. Integration tests
require Docker and use a separate temporary PostgreSQL container through
Testcontainers. They do not modify the development database or its admin account.
The first run may download the Testcontainers cleanup image.

## Stop

Use `Ctrl+C` in the backend and frontend terminals. Stop the database with:

```powershell
docker compose stop
```

The database volume is retained. Changing the database password in `.env` after
the first container initialization does not change the existing database password.

## Database migrations

Flyway manages versioned SQL files in `backend/src/main/resources/db/migration`.
Its migration history remains in `public`, separate from application tables.
The first migration creates the `volleyball` application schema. Hibernate
validates the schema rather than creating or modifying tables.

The second migration creates `volleyball.users`, with a UUID identifier, names,
unique normalized email, password hash, role, account status and creation time.
Roles are `ADMIN`, `STATISTICIAN` and `COACH`. The third migration adds `BLOCKED`
to the supported statuses: `PENDING`, `ACTIVE`, `BLOCKED` and `REJECTED`.
The interface uses pending, active and blocked states; rejected is retained for
compatibility with the initial schema.

The fourth migration creates volleyball.teams with a UUID, name, city and creation
time. A unique index on lower(name) and lower(city) prevents case-insensitive duplicates.

The fifth migration creates volleyball.players with a UUID, first/last name,
jersey number, primary position, required team foreign key and creation time.
The database enforces unique jersey numbers within a team and restricts deletion
of a referenced team. Positions are stored as names, not numeric enum ordinals.

The sixth migration creates volleyball.matches. The seventh creates
volleyball.match_players and adds roster_version to matches. Each participant
row references one match, player and team and stores the player's name, jersey
number, primary position and match-specific libero designation. Unique constraints
prevent duplicate participants and repeated jersey numbers within a match's team.
Deleting a match cascades only its participant rows; referenced players and teams
cannot be deleted through database foreign keys.

The eighth migration creates volleyball.match_sets and volleyball.set_lineups.
A set belongs to a match and records its number, status, scores, first-serving
team and start time. Each lineup row connects a saved match participant to a set
and a rotational position from 1 to 6. Composite foreign keys require the set and
participant to belong to the same match and preserve the participant's team.
Unique constraints prevent repeated players and occupied slots within a set.

The ninth migration creates volleyball.set_points and adds score_version and
last_point_sequence to match_sets. Point rows store the winning team, sequence,
score after the original entry, creation time and optional cancellation time.
Command identifiers are unique per set; cancellation metadata remains with the
original point instead of deleting its history.

The tenth migration adds finished_at, finish_request_id and finish_expected_version
to match_sets. A partial unique index allows only one LIVE set per match.
Finish metadata is saved together; old FINISHED rows without that metadata remain
compatible with the schema. New completions always store it.

The eleventh migration creates volleyball.set_substitutions. Each row records one
outgoing/incoming pair, its original lineup slot, team and match references,
score at entry, preceding point sequence, command/version and cancellation metadata.
Composite foreign keys keep both participants in the same match/team as the set.

The twelfth migration creates volleyball.libero_replacements with the same command,
version, score and cancellation metadata. It additionally records the covered regular
participant so returns and switches to the second libero preserve the correct player.

The thirteenth migration adds action_type, match_id and optional participant/team
references to set_points. Existing entries remain UNSPECIFIED with no attributed
player; their original score and history are preserved. Composite foreign keys
keep the participant in the same match, and check constraints distinguish points
credited to the scorer's player from errors attributed to the opposing side.

The fourteenth migration adds a partial index on active points by match and set
for the statistics query. Statistics are derived from points, not stored in a
separate totals table.

## Accounts and sessions

- Public registration accepts only `STATISTICIAN` or `COACH`, always as `PENDING`.
- Only active accounts can sign in. Public input cannot assign admin privileges or bypass approval.
- Admins can list, approve, block and reactivate non-admin accounts. Admin accounts
  cannot be modified through these endpoints.
- Admins can permanently delete blocked non-admin accounts after confirming in the
  interface. Active, pending and rejected accounts cannot be deleted. Deletion
  removes the database row, including its password hash, and frees the email for
  a new registration, which must be approved again.
- The backend checks the persisted account status on each authenticated request.
  A blocked account's existing session is invalidated on its next request.
- Login rotates the session identifier. Logout invalidates the server session
  and removes its cookie. Sessions are held in backend memory and expire after
  30 minutes of inactivity; restarting the backend clears them.
- Session cookies are HttpOnly and SameSite=Lax. Local HTTP uses non-Secure cookies;
  for HTTPS deployment set `SERVER_SERVLET_SESSION_COOKIE_SECURE=true`.
- CSRF protection is enabled for registration, login, logout, admin, team, player and match changes.
  The frontend obtains a masked token before each POST, PUT or DELETE and sends its specified
  header. No JWTs, localStorage credentials or permissive CORS are used.
- Password hashes are never included in API responses. Login failures use a
  generic message for invalid credentials and unapproved/blocked accounts.

### Endpoints

| Method | Path | Access |
| --- | --- | --- |
| GET | /api/auth/csrf | Public |
| POST | /api/auth/register | Public, CSRF required |
| POST | /api/auth/login | Public, CSRF required, form-encoded email/password |
| GET | /api/auth/me | Active authenticated account |
| POST | /api/auth/logout | CSRF required |
| GET | /api/admin/users | Admin; optional status, page and size |
| POST | /api/admin/users/{id}/approve | Admin, CSRF required |
| POST | /api/admin/users/{id}/block | Admin, CSRF required |
| DELETE | /api/admin/users/{id} | Admin, CSRF required; blocked non-admin accounts only |

The admin list is paginated, newest first. Approval also reactivates a previously
blocked account. Statisticians and coaching staff see the team list after signing in.

This is a local development version. Public deployment additionally needs HTTPS,
abuse/rate limiting, password recovery and operational configuration.

## Teams

- Statisticians can list, create, edit and permanently delete teams that have no players.
- Coaching staff can list teams and view their data, but cannot change them.
- Administrators currently manage accounts only and have no access to team endpoints.
- Name and city are required, trimmed, Unicode-normalized and limited to 100 characters.
- The same name/city combination cannot be registered twice, ignoring case.
- The interface confirms deletion and preserves entered data on a failed save.
- Adding and editing use dedicated in-app screens with breadcrumbs and a cancel
  action, rather than modal windows. Deletion is confirmed inline on the selected card.
- Lists are paginated (20 per page in the interface), sorted by name and identifier.
- All teams are shared within this application; separate club membership is not implemented.

| Method | Path | Access |
| --- | --- | --- |
| GET | /api/teams | Active statistician or coach; optional page and size |
| GET | /api/teams/{id} | Active statistician or coach |
| POST | /api/teams | Active statistician, CSRF required |
| PUT | /api/teams/{id} | Active statistician, CSRF required |
| DELETE | /api/teams/{id} | Active statistician, CSRF required |

Teams with players cannot be deleted. The service returns a conflict with an
explanation, and the database foreign key provides a second guard without
cascading deletion. Teams referenced by matches also cannot be deleted.

## Players

- Open a team's roster with the Show players button; use Back to teams to return.
- Statisticians can add and edit players. Permanent deletion requires confirmation
  and is allowed only when the player is not referenced by a saved match roster.
- Coaching staff can read rosters but cannot modify them; admins have no roster access.
- Each player belongs to exactly one existing team. Moving players between teams
  is not implemented yet. Saved match participants retain their original team
  reference and player data rather than following subsequent player edits.
- First and last names are required, trimmed, Unicode-normalized and limited to
  100 characters. Letters, including Serbian Latin/Cyrillic, are allowed with
  single internal spaces or hyphens.
- Jersey numbers are integers from 1 to 99, an application limit rather than a
  universal competition rule. Numbers are unique within a team but may repeat
  across different teams.
- Primary positions are SETTER (Tehničar), OUTSIDE_HITTER (Primač servisa),
  OPPOSITE (Korektor), MIDDLE_BLOCKER (Srednji bloker) and LIBERO (Libero).
  A primary position is not a rotation slot. Match lineups and rotational order
  are tracked separately; captain designation is not implemented.
- Rosters are paginated (20 per page in the interface), sorted by jersey number.
- Player changes and team deletion lock the same team row to serialize competing
  changes. Database constraints also enforce jersey uniqueness and team integrity.
- Failed saves preserve entered data. Invalid name fields show error borders
  and messages without changing the entered text color.
- Adding and editing players use full-page forms with team context and breadcrumbs.
  Deletion confirmation stays inside the player's card; no roster modal is used.
- All rosters are shared within the application; club-level ownership is not implemented.

| Method | Path | Access |
| --- | --- | --- |
| GET | /api/teams/{teamId}/players | Active statistician or coach; optional page and size |
| GET | /api/teams/{teamId}/players/{id} | Active statistician or coach |
| POST | /api/teams/{teamId}/players | Active statistician, CSRF required |
| PUT | /api/teams/{teamId}/players/{id} | Active statistician, CSRF required |
| DELETE | /api/teams/{teamId}/players/{id} | Active statistician, CSRF required |

Player IDs are checked against the team in the URL; a player from a different
team cannot be read, edited or deleted through that path. Players are separate
from application user accounts and have no login credentials.

## Matches

- Statisticians can create, edit and delete scheduled matches. Coaching staff can
  read them; administrators have no access to match endpoints.
- Each match references two different existing teams as home and away participants.
  Teams referenced by any match cannot be deleted. Deleting a scheduled match
  does not delete its teams or players.
- The sixth migration creates volleyball.matches with UUID, two required team
  foreign keys, scheduled_at, status and created_at. Foreign keys restrict team
  deletion, and a database check prevents a team from playing itself.
- New matches always have SCHEDULED status. A statistician can start one through
  first-set preparation, changing it to LIVE. Confirming a team's third set win
  changes the match to FINISHED. The backend rejects editing/deleting LIVE and
  FINISHED fixtures.
- The frontend's Utakmice tab shows a paginated list, newest scheduled time first.
  Forms use dedicated screens and deletion uses inline confirmation.
- Team selectors are searchable and load all team pages. At least two teams must
  exist; the same team is disabled in the opposite selector.
- Date/time input and display use the browser's time zone, shown in the interface.
  API timestamps include an offset or UTC Z; PostgreSQL stores TIMESTAMPTZ.
  Local times skipped by daylight-saving changes are rejected by the form.
  An ambiguous local time at the autumn clock change uses the browser's earlier
  occurrence. Past dates are allowed for recording historical fixtures.
- No duplicate-fixture or overlapping-schedule rule is imposed in this version.
  First-set initial lineups and a 0:0 score are recorded at start. Points can then
  be added and undone. Subsequent sets have their own initial lineups and score.
  Points optionally include a finishing action and player. Team/player statistics
  can be read for one set or the whole match.
- Changing either team requires clearing and saving both participant rosters first.
  The date/time may still be edited with saved rosters.
- Deleting a scheduled match also deletes its saved participant rows. The
  interface explains this in its inline confirmation.

| Method | Path | Access |
| --- | --- | --- |
| GET | /api/matches | Active statistician or coach; optional page and size |
| GET | /api/matches/{id} | Active statistician or coach |
| POST | /api/matches | Active statistician, CSRF required |
| PUT | /api/matches/{id} | Active statistician, CSRF required; scheduled only |
| DELETE | /api/matches/{id} | Active statistician, CSRF required; scheduled only |

## Match participants

- Open Prikaži sastave on a match card to see both teams on a dedicated screen.
  Statisticians can select participants and designate liberos for scheduled
  matches; coaches have read-only access to the saved participants.
- Partial and empty drafts are allowed. Participants are not a set lineup;
  starting sixes are selected separately before starting the match.
- Each side may have at most two designated liberos, following rule 19.1.1 in the
  [FIVB rules](https://www.fivb.com/wp-content/uploads/2025/01/FIVB-Volleyball_Rules2025_2028-EN-v05.pdf).
  A player's primary LIBERO position preselects the checkbox, which remains editable
  for this match. Competition-specific roster-size rules are not implemented.
- The service accepts only current members of the specified team when adding
  a participant. Existing entries retain their original team and snapshots.
  Resaving an existing entry preserves its ID and player details; only the
  libero flag is updated. Removing and later adding a player creates a new
  entry with the player's current details.
- Both sides are saved in a single transaction. Match and team locks prevent
  conflicting participant/player writes. The request includes the roster version;
  an outdated version is rejected with HTTP 409 rather than overwriting another save.
- Failed saves preserve the selection. Učitaj sačuvani sastav explicitly reloads
  the saved version; leaving or reloading a changed draft asks before discarding it.
- The database protects foreign keys and uniqueness; the service additionally
  checks team membership, match status and the number of designated liberos.

| Method | Path | Access |
| --- | --- | --- |
| GET | /api/matches/{id}/roster | Active statistician or coach |
| PUT | /api/matches/{id}/roster | Active statistician, CSRF required; scheduled only |

The PUT body contains version, homePlayers and awayPlayers. Each player item
contains playerId and isLibero; names, jersey numbers and positions are taken from
the database, not accepted as editable client snapshots.

## First-set preparation and match start

- Open Početne postave on a scheduled match card. First save each team's match
  participants using Prikaži sastave; adding a player to a team does not register
  that player for an existing match.
- For each team, fill rotational positions 1 to 6 with six different saved
  participants not designated as liberos. Primary positions are descriptive;
  the match-specific libero flag determines eligibility for this lineup.
- Select which team serves first, based on the toss. Position 1 is back-right;
  the slots describe rotational order, not roles such as setter or opposite.
- Počni utakmicu validates the draft and shows an inline confirmation. Potvrdi
  početak saves both sixes and the first-serving team, creates set 1 at 0:0 with
  LIVE status and a start timestamp, and changes the match status to LIVE.
- All changes are committed in one database transaction under the match lock.
  Starting with an outdated roster version, a non-scheduled match or a match
  already containing a set returns HTTP 409. Repeated or simultaneous starts
  cannot create a second first set.
- After start, the match's participants and initial lineups cannot be changed
  through the API. Both statistician and coach can use Pregled utakmice to read
  the score and initial lineups. No reset-to-scheduled action exists.
- Preparation drafts are local to the open screen and saved only when starting.
  Navigation/reload asks before discarding a partial draft. Failed requests keep
  the selection; loading the current state is an explicit action.
- Initial lineups remain unchanged. The score view separately displays the
  rotational order derived from recorded points, ordinary substitutions and
  libero replacements.

| Method | Path | Access |
| --- | --- | --- |
| GET | /api/matches/{id}/preparation | Active statistician or coach |
| POST | /api/matches/{id}/start | Active statistician, CSRF required; scheduled only |

The start body contains rosterVersion, homeLineup, awayLineup and
firstServingTeamId. The lineup arrays contain six match participant IDs
(match_players.id, not players.id), ordered by rotational position 1 through 6.

## Points and score corrections

- In Pregled utakmice, statisticians use Poen za domaćina or Poen za gosta for
  score-only entry, or Detaljan unos poena for a finishing action and optional
  player as described below. Either workflow stores exactly one point and updates
  its set's score in one transaction; do not enter the same rally through both.
- Poništi poslednji poen asks for inline confirmation and cancels only the latest
  non-cancelled point. The score decreases on that side; previous points may then
  be undone in reverse order. Cancelled entries remain visible and never count
  toward the current score. Scores cannot become negative.
  If an ordinary substitution or libero replacement was entered after that point,
  it must be cancelled first.
- The view shows the latest 20 point entries, newest first, including cancelled
  rows. The server separately returns the last active point, even if it is older
  than the visible history. Sequence numbers are never reused after cancellation.
  A row's score-after-entry is historical, not recalculated after later corrections.
- New writes require both match and set to be LIVE. The set ID is checked against
  the match in the URL, and the scoring team must belong to that match. Coaches
  can read the score/history but have no write access; admins have no access.
- Mutations share the match lock and include the current score version. Successful
  point, substitution and libero changes each increment that version. Stale requests return
  HTTP 409 without changing the score or history.
- Each addition/undo also has a requestId. Repeating an already committed command
  returns the current state without applying it again, including after subsequent
  points or cancellations. Reusing an ID with a different payload returns HTTP 409.
- Buttons and navigation are disabled during a write. Network/5xx failures retain
  the original command for Ponovi isti zahtev; the client does not generate a new
  identifier or automatically retry an uncertain write. Other failures require
  explicit score refresh before another entry.
- Score/history reads use a repeatable-read snapshot. Osveži rezultat reloads
  the current state; coaching staff also receive automatic updates through polling
  as described below. WebSocket/SSE push is not implemented.
- Once the set has a winning score, further additions are blocked while undo remains
  available. The statistician explicitly confirms completion; points alone do not
  automatically close the set or match.

| Method | Path | Access |
| --- | --- | --- |
| GET | /api/matches/{matchId}/sets/{setId}/score | Active statistician or coach |
| POST | /api/matches/{matchId}/sets/{setId}/points | Active statistician, CSRF required; match and set LIVE |
| POST | /api/matches/{matchId}/sets/{setId}/points/{pointId}/undo | Active statistician, CSRF required; match and set LIVE |

Point input contains requestId, version and scoringTeamId, with optional actionType
and participantId (a match_players ID, not a players ID). Undo input contains
requestId and version; the point ID is in the URL. Completed-command replays are
read-only responses and remain safe even if the match/set was subsequently closed.

### Point details

- Detaljan unos poena opens an inline form to choose the scoring team, finishing
  action and player, followed by a review and confirmation. It is an alternative
  to quick score-only entry, not an additional action on an existing point.
- ATTACK attributes a scoring attack to a current on-court player of the winning
  team. Back-row players and liberos are not automatically excluded: attack
  legality also depends on contact height and take-off location, which are not
  tracked. The operator records the awarded result, not an automatically refereed rally.
- BLOCK attributes a scoring block to a non-libero in rotational positions 2–4
  BEFORE the rally. SERVICE_ACE requires the current server of the scoring team;
  the form selects that player automatically. A receiving team cannot receive an ace.
  These eligibility guards follow [FIVB rules 14.1 and 19.3](https://www.fivb.com/wp-content/uploads/2025/01/FIVB-Volleyball_Rules2025_2028-EN-v05.pdf).
- OPPONENT_ERROR awards the point to the selected team, but attributes the error
  only to an on-court player of the opposing team. The individual may be omitted
  for team faults or unknown attribution. Such points are not individual scoring points.
- UNSPECIFIED is the default when actionType is omitted or null. It has no player.
  Old history and quick-entry points retain this classification rather than
  inventing statistics. Classified entry is disabled if the court is unavailable;
  score-only entry remains available subject to normal scoring rules.
- Eligibility uses the six actually on court after ordinary/libero changes and
  before the point's rotation. Bench players and players covered by a libero are
  excluded. A required libero exit still blocks every new point.
- Details are saved with the original point, using the match participant's saved
  name/jersey snapshot. Undo retains those details on the cancelled row. Corrections
  use the existing reverse-order undo then re-entry; editing old details is not supported.
- Idempotency compares action and participant as well as team/version. A retry of
  a committed command returns current state without checking that old player
  against a later rotation or resurrecting a cancelled point. Uncertain writes
  retain the exact original command and details for explicit retry.
- While a detail draft is open, quick points, player changes, refresh and parent
  navigation are disabled. Cancel the draft before leaving or refreshing after a
  conflict. Coaching staff can read details/history but cannot enter them.
- This is a simplified finishing-action record, not full rally statistics: no
  attack attempts, reception quality, assists, digs or collective block credit
  are captured yet. Counting these records alone cannot yield success percentages.

## Team and player statistics

- Open Prikaži statistiku in Pregled utakmice. The section expands inline and
  initially shows Cela utakmica, with a selector for any saved set. The summary
  cards show each team's total points; tables compare teams and list player totals.
  It is available to statisticians and coaches, including after match completion.
- Team points are split into attack points, scoring blocks, service aces, points
  awarded for opponent errors and UNSPECIFIED points. These categories sum to
  totalPoints. Old/quick-entry points stay unspecified and are not attributed to players.
- Player scoringPoints is attackPoints + blockPoints + serviceAces. An attributed
  opponent error increments the error count of the opposing player/team, never
  that player's scoring points. Team errors also show unattributedErrors for
  team faults or unknown individuals. These are only recorded rally-ending
  errors, not every error that might occur during play.
- All registered match participants appear, sorted by saved jersey number and ID,
  including substitutes/liberos and zero-stat players. Zero counts do not prove
  that a player did not participate. Names, numbers and IDs come from the saved
  match roster, not the current editable player record.
- Aggregation runs in the database over ALL non-cancelled points in the selected
  scope, not only the latest 20 history entries. Whole-match totals include both
  completed and live sets. Undo removes the point/error from the totals while
  preserving history; a retry of a committed command never double-counts it.
- GET reads use one repeatable-read transaction for match, set metadata, roster
  and aggregates. The response includes the scope and each set's scoreVersion
  so consumers can identify the source snapshot. There is no statistics write endpoint.
- No rates, attack attempts, reception quality, assists, playing time, efficiency
  percentages or team rankings are inferred from incomplete finishing-action data.
- The frontend fetches only when expanded. Local score additions/undo and other
  score-version changes refresh the open statistics section. For changes on
  another device, coaching staff receive periodic updates; statisticians can use
  Osveži statistiku. See automatic following below.
- Loading, failed or superseded requests never leave old totals labelled as the
  new scope. Scope changes/unmount abort obsolete reads; refresh can recover from
  errors. Statistics are hidden/disabled during an open score/player-change draft,
  an in-flight command or an uncertain score until it is resolved.

| Method | Path | Access |
| --- | --- | --- |
| GET | /api/matches/{matchId}/statistics | Active statistician or coach; optional setId |

Omit setId for the whole match. A supplied set ID must belong to the match;
missing/foreign sets return 404 and malformed UUIDs return 400. Scheduled matches
are readable as zero totals, even without participants or sets.

## Automatic following for coaching staff

- Coaching staff automatically read the open match overview and active set every
  three seconds after the preceding request completes. An expanded statistics
  section also polls while its selected scope can still change. This is polling
  using existing authenticated GET endpoints, not WebSocket/SSE or instantaneous push.
- New points/undo, rotation/service, ordinary/libero changes, set completion,
  subsequent sets and match completion are picked up without a page reload.
  A scheduled match's open preparation screen also detects match start.
- Prati aktuelni set follows the active or latest set by default. Selecting a
  historical set turns following off so background updates do not move the
  selection. Enable the checkbox to return to the active set. Finished set scores
  stop polling; whole-match statistics can continue while other sets are live.
- Polling ends at confirmed match completion. Statisticians retain manual reads
  and refresh-after-write behavior; no background request overwrites their drafts
  or resolves uncertain mutation retries. Automatic requests are GET only.
- Each resource has at most one active fetch. Hanging reads are aborted after
  12 seconds. Network/5xx/429 failures use delays of 6, 12, 24 and at most 30 seconds;
  a success restores the normal interval. Other 4xx responses stop automatic reads
  until an explicit manual refresh. Session expiry still uses the shared 401 handler.
- Hidden tabs and offline browsers pause polling and abort pending automatic
  reads. Visibility/connection restoration performs an immediate read. Changing
  the selected resource, manual refresh, closing statistics or leaving the screen
  also cancels obsolete automatic reads, whose late results are ignored.
- A status message identifies polling, pause, failed/retrying or stopped state,
  with the last successful automatic check time. Failed background reads retain
  the last snapshot but explicitly mark it as potentially stale. Initial failures
  can recover automatically. Existing manual refresh buttons remain available.
- Match overview, score and statistics are independent read snapshots and can
  differ briefly during their refresh cycles; there is no claim of one atomic
  snapshot across all panels. A future push design could reduce latency and traffic.

## Set completion and subsequent sets

- Sets 1–4 require at least 25 points and a two-point lead. The fifth set requires
  at least 15 with the same two-point lead. Deuce continues without a score cap.
  The match ends when a team wins three sets.
  These conditions follow [FIVB rules 6.2–6.3](https://www.fivb.com/wp-content/uploads/2025/01/FIVB-Volleyball_Rules2025_2028-EN-v05.pdf).
- At a winning score, Završi set shows a confirmation and Potvrdi kraj seta closes
  the current set. Before confirmation, an incorrectly recorded winning point can
  still be undone. After confirmation, new point/undo writes are forbidden for
  that set; reopening completed sets is not implemented.
- Completion saves a timestamp and increments the score version. It uses the
  shared match lock and requires the expected score version. Repeating the same
  completion command returns current match state without counting another win,
  including after the next set has started.
- Pregled utakmice displays the confirmed set score, completed-set results and a
  Set za pregled selector for each set's points and initial lineups. It defaults
  to the active set, or the latest completed set when none is active.
- Between sets, a statistician chooses Pripremi set N and enters six players per
  team again. Each set has independent initial lineups using the same registered
  match participants; the participant list remains locked after match start.
- Sets 2–4 start with the team that did not serve first in the preceding set.
  This is preselected in the form and checked by the backend. At 2:2, set 5
  requires a fresh serving-team choice based on the new toss (FIVB 7.1 and 12.1).
- Starting the next set checks its number, the latest completed set ID/version,
  roster version, first-serving team and both lineups. Skipped sets, another
  active set, outdated requests, a sixth set or a completed match are rejected.
  Repeated/concurrent starts cannot create duplicate sets.
- Confirmation of a third set win sets the match to FINISHED. All sets remain
  available for read-only review by statisticians and coaching staff.
- Only the normal best-of-five match flow is modeled. Forfeits, exceptional match
  termination, score correction after confirmed completion and exceptional replacements
  are outside this version.

| Method | Path | Access |
| --- | --- | --- |
| POST | /api/matches/{matchId}/sets | Active statistician, CSRF required; between sets |
| POST | /api/matches/{matchId}/sets/{setId}/finish | Active statistician, CSRF required; current LIVE set at winning score |

Next-set input extends first-set input with number, previousSetId and
previousSetVersion. Completion input contains requestId and version.
Preparation responses retain firstSet for compatibility and also include all
sets, currentSet, nextSetNumber, homeSetsWon and awaySetsWon. Set responses include
scoreVersion, finishedAt and the winnerTeamId of a confirmed completed set.

## Rotation and service

- The score response includes court: servingTeamId, server and both teams' six
  players ordered by rotationPosition. The UI lays out positions 4–3–2 by the net
  and 5–6–1 behind them, viewed separately from each team's side.
- The first server is the player in position 1 of the selected first-serving team.
  Winning another rally while serving leaves that team's order unchanged. When
  the receiving team wins a rally, only that team rotates: 2→1→6→5→4→3→2.
  Its new position-1 player serves next (FIVB rules 7.6 and 12.2).
- Both orders and the server are derived on the backend from the saved initial
  lineups, active ordinary/libero changes and ALL non-cancelled points in sequence,
  not only the 20 visible entries.
  Undo, idempotent retries and page reloads therefore produce the same state.
  Starting another set uses that set's own lineups and first-serving team.
- At a winning score or after completion, no next server is shown. A set-winning
  rally does not trigger a further service rotation. Undoing that rally before
  confirmation restores the server and positions from the remaining point history.
- The display is rotational order, not physical player locations during a rally.
  Ordinary replacements take over the outgoing player's original lineup slot and
  follow its rotation. Libero replacements cover that occupant without changing
  the ordinary substitution pair. Exceptional service-order corrections and
  sanction-specific rotation rules are not modeled.
- Reads share the score's transaction/snapshot. Rotation itself needs no extra stored state.
  Sets with missing lineups or scores inconsistent with their point history return
  court=null rather than inventing a server. The UI explains unavailable state and
  hides potentially stale court data after a failed write until retry/refresh.
  Coaches have the same read-only view, refreshed automatically for an active set,
  with manual refresh still available for historical review.

## Ordinary substitutions

- In Pregled utakmice, Unesi izmenu opens an inline form: choose a team, an
  outgoing player and an eligible incoming player, then review and confirm.
  Only server-provided legal options are shown. The backend independently checks
  eligibility, session role, set status and current version.
- A team may use at most six ordinary substitutions in a set. A starter may leave
  once and return once, only for the same reserve; that reserve cannot be reused
  for another starter. Returns count as substitutions too. Only registered,
  non-libero participants may enter. An on-court player cannot enter again.
- This version supports ONE pair per request and one request per team between
  recorded rallies, including before the first point. Both teams may request a
  substitution in the same interruption. Grouped substitutions, forced/exceptional
  substitutions are not implemented. Libero replacements have a separate workflow. This is a subset
  of the ordinary substitution procedure in FIVB rules 15.1–15.6, not a full referee system.
- A substitution does not change the score, initial lineups or rotational order.
  It changes the slot's occupant; replacing the server immediately changes the
  displayed server. New sets reset substitution limits and use their own starting sixes.
- The view shows each team's used count and the latest 20 substitution entries,
  including cancelled ones. Counts and eligibility use all active entries.
- Poništi poslednju izmenu corrects the latest active substitution only when no
  later active point or substitution exists. It restores the previous occupant
  and eligibility without consuming another substitution. Cancelled rows remain
  in history. A real player return must instead be entered as a new substitution.
- Point, substitution and libero corrections run in reverse event order across BOTH teams:
  cancel later points/changes before earlier ones. The score response exposes
  canUndo and substitutions.undoableId so the UI does not offer unsafe corrections.
- Writes use the shared match lock, version check and idempotent command IDs.
  Repeating the same successful command never duplicates or resurrects a change.
  Network/5xx failures retain the exact command for Ponovi isti zahtev. Conflicts
  require cancelling the draft and refreshing. While a draft is open, point input,
  set completion and parent navigation are blocked until it is saved or cancelled.
- Finished sets are read-only. At a winning score no new substitution is accepted;
  prior changes remain reviewable. Coaches can read history and counts but cannot write.

| Method | Path | Access |
| --- | --- | --- |
| POST | /api/matches/{matchId}/sets/{setId}/substitutions | Active statistician, CSRF; current LIVE set before winning score |
| POST | /api/matches/{matchId}/sets/{setId}/substitutions/{substitutionId}/undo | Active statistician, CSRF; reverse-order correction in LIVE set |

Substitution input contains requestId, version, outgoingParticipantId and
incomingParticipantId (match_players IDs, not players IDs). Undo contains requestId
and version. Both return the authoritative score, court and substitution state.

## Libero replacements

- Libero has a separate inline form and history in Pregled utakmice. Select the
  outgoing player and one of the server-provided incoming players, review and confirm.
  Changes update the six without altering points or the six-substitution allowance.
- Only match-designated liberos may enter. One libero per team can be present at
  a time. A libero may cover a back-row player who is not about to serve; returns
  restore exactly that covered player. After a recorded rally, the other designated
  libero may take over the same slot. These normal cases follow FIVB rule 19.3.
- A completed recorded rally must separate replacements by the same team, including
  exits and switches. Ordinary substitutions have an independent interruption limit.
  Before the first rally, entry is possible after the initial sixes have been saved
  at set start; the application does not model a referee's authorization or whistle.
- When a point rotates a libero into the front row or a serving position, the view
  marks a required exit. The point remains recorded, but another point and ordinary
  substitutions are blocked until the covered player returns. No libero is announced
  as a server. This is a pending action before the next rally, not permission for
  a libero to play in the front row. No replacement is silently generated.
- The ordinary substitution form excludes a player currently covered by a libero.
  After the libero exits, a legal ordinary change may be entered. The court merges
  both histories by version, so an older libero return cannot overwrite a newer change.
- Poništi zamenu libera corrects only the latest active action, keeping a cancelled
  history entry. It is not the real on-court exit. Undo points and all player changes
  in reverse order; undoing a rotating point restores the previous back-row position.
  Undoing a required exit can restore the pending-exit warning until corrected.
- New sets have no active libero until an entry is recorded. Finished sets retain
  their historical sixes and replacement history for read-only review. New replacements
  are rejected after a winning score. Command retries remain idempotent after completion.
- The response includes libero.active (including the covered player), options,
  history, undoableId and mustExit. History displays the latest 20 entries, while
  eligibility and presence use every active entry. Coaches have read-only access.
- Injury/illness exceptions, re-designation of a new libero, penalties and exceptional
  replacement procedures are outside this version. Attack/block legality is not
  tracked beyond the basic scoring-block eligibility guard; ball height, take-off
  location and other rally contacts are not recorded.

| Method | Path | Access |
| --- | --- | --- |
| POST | /api/matches/{matchId}/sets/{setId}/libero-replacements | Active statistician, CSRF; eligible pair in current LIVE set |
| POST | /api/matches/{matchId}/sets/{setId}/libero-replacements/{replacementId}/undo | Active statistician, CSRF; reverse-order correction |

Inputs use the same command/version and participant IDs as ordinary substitutions.
Both endpoints return the authoritative score, court, ordinary substitution and libero state.

## Initial administrator

Initial administrator creation is disabled by default. For a new local database,
temporarily set these values in your ignored `.env` file:

```dotenv
BOOTSTRAP_ADMIN_ENABLED=true
BOOTSTRAP_ADMIN_EMAIL=your_admin_email
BOOTSTRAP_ADMIN_PASSWORD=your_local_admin_password
```

Start the backend from its directory with `mvn spring-boot:run`. It creates an
active administrator named System Administrator, storing only an Argon2id hash
in the database. The password must contain 8 to 128 characters. Use a strong,
unique password for any deployment; do not use local demonstration credentials.

After creation, set `BOOTSTRAP_ADMIN_ENABLED=false`, remove the temporary
credentials and restart the backend. You can also supply these settings through
environment variables instead of `.env`.

Repeat runs never reset an existing administrator's password. If another admin
already exists, no additional one is created. If the requested email belongs to
an account other than an active admin, startup fails without changing the
account. This mechanism is not an account promotion or password reset tool.

## Frontend styling

Mantine provides the shared UI components. Its styles and `MantineProvider` are
loaded in `frontend/src/main.tsx`. Shared colors and component defaults are configured
in `frontend/src/theme.ts`. The authentication and admin screens use Mantine components; application-specific
styles belong in `frontend/src/styles.css` or component CSS modules.

`frontend/postcss.config.cjs` configures Mantine's CSS preset and breakpoint
variables. Tabler Icons provides consistent SVG icons, and Mantine Notifications
displays successful account actions.
The admin screen uses a table on larger screens and cards on mobile. Component
tests use Vitest and Testing Library in jsdom to check interactions, not visual layout.
Form and chart packages are not installed yet.

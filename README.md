# Volleyball Match Tracker

A web application for recording volleyball match events and displaying statistics to coaching staff.

The application supports registration, session-based login/logout, administrator
approval, blocking and permanent deletion of blocked user accounts, and team
management and team rosters. Match tracking, statistics and reporting are not implemented yet.

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
roster writes and role-based access. Integration tests
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
- CSRF protection is enabled for registration, login, logout, admin, team and player changes.
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
cascading deletion. Match relationships will need their own deletion rules.

## Players

- Open a team's roster with the Show players button; use Back to teams to return.
- Statisticians can add, edit and permanently delete players after confirmation.
- Coaching staff can read rosters but cannot modify them; admins have no roster access.
- Each player belongs to exactly one existing team. Moving players between teams
  and tracking historical rosters are not implemented yet.
- First and last names are required, trimmed, Unicode-normalized and limited to
  100 characters. Letters, including Serbian Latin/Cyrillic, are allowed with
  single internal spaces or hyphens.
- Jersey numbers are integers from 1 to 99, an application limit rather than a
  universal competition rule. Numbers are unique within a team but may repeat
  across different teams.
- Primary positions are SETTER (Tehničar), OUTSIDE_HITTER (Primač servisa),
  OPPOSITE (Korektor), MIDDLE_BLOCKER (Srednji bloker) and LIBERO (Libero).
  A primary position is not a rotation slot; rotation, match lineups and captain
  designation are outside this version.
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

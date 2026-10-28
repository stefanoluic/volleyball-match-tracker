# Local setup and verification

[Project overview](../README.md) · [Separate demo environment](DEMO.md)

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
recommendation thresholds, data-coverage guards and removal after point corrections,
server/rotation recovery after undo,
deuce/tie-break rules, complete 3:0/3:2 match flows,
set transitions and role-based access. Integration tests
require Docker and use a separate temporary PostgreSQL container through
Testcontainers. They do not modify the development database or its admin account.
The first run may download the Testcontainers cleanup image.

### Continuous integration

`.github/workflows/ci.yml` defines three independent checks on pushes, pull
requests and manual dispatch: backend `mvn verify` on Linux with temporary
Testcontainers databases; frontend clean install, type checks, tests and build;
and isolated launcher safety tests on Windows. No development `.env`, database
volume or account credentials are used. The workflow does not deploy the app.
It takes effect after the repository is pushed to GitHub and Actions is enabled;
adding the file locally does not confirm a successful hosted run.

Official [checkout](https://github.com/actions/checkout/releases/tag/v7.0.1),
[setup-java](https://github.com/actions/setup-java/releases/tag/v6.1.0) and
[setup-node](https://github.com/actions/setup-node/releases/tag/v7.1.0) actions are
pinned to full commit identifiers. The workflow grants read-only repository
permissions and checkout does not persist its authentication credentials.

A [manual demonstration checklist in Serbian](PROVERA_APLIKACIJE.md)
covers accounts, match flow, two-browser following and final statistics. It is a
checklist to execute, not a record of completed browser testing. The integration
suite also exercises a complete 3:2 match with a 16:14 fifth set, substitutions,
libero entry/return, a point correction, an idempotent retry and final aggregates.

## Stop

Use `Ctrl+C` in the backend and frontend terminals. Stop the database with:

```powershell
docker compose stop
```

The database volume is retained. Changing the database password in `.env` after
the first container initialization does not change the existing database password.

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

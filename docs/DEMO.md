# Local demo

[Project overview](../README.md) · [Normal development setup](SETUP.md)

The demo is optional. It uses `compose.demo.yaml`, a separate PostgreSQL volume,
database port **5434**, backend port **8082** and frontend port **5174**.
The regular environment uses 5433 / 8081 / 5173 and is not stopped or reset.
Both can run at the same time if your computer has enough resources.

Do not enable this profile on a public server. These are demonstration accounts,
not a production account-provisioning mechanism. Use a new local-only password.

## What is created

- Three active accounts:

  | Email | Role |
  | --- | --- |
  | `admin.demo@example.com` | Administrator |
  | `statistician.demo@example.com` | Statistician |
  | `coach.demo@example.com` | Coaching staff |

- Two fictional teams: **Demo Dunav** and **Demo Sava**.
- Nine fictional players per team: six possible starters, two ordinary reserves
  and one libero. Jersey numbers are 1–9; number 9 is the libero.
- One scheduled match at 18:00 UTC on the day after initialization, displayed in
  the browser's time zone. All eighteen players are already registered for it.
  Starting sixes and the first-serving team are deliberately left for you to select.

The accounts share the password you supply through `DEMO_PASSWORD`, but each has
its own salted Argon2id hash. No default password is stored in source control or
written to application logs. The `example.com` addresses do not send mail.

## Start in PowerShell

Use a **new terminal** in the project root so these process-local settings do not
change an existing development terminal. Docker Desktop must be running with the
Linux container engine. The demo does not require editing `.env`.

### 1. Database and backend

Choose 8–128 characters, not just spaces. The prompt does not echo the password.
For this isolated local demo only, the same supplied value is also used as the
demo database password. Do not use a real account/database password.

```powershell
$demoSecret = Read-Host 'Choose a local-only demo password (8-128 characters)' -AsSecureString
$env:DEMO_PASSWORD = [System.Net.NetworkCredential]::new('', $demoSecret).Password
$env:DEMO_DB_PASSWORD = $env:DEMO_PASSWORD
$env:POSTGRES_DB = 'volleyball_demo'
$env:POSTGRES_USER = 'volleyball_demo'
$env:POSTGRES_PASSWORD = $env:DEMO_DB_PASSWORD
$env:DB_HOST = 'localhost'
$env:DB_PORT = '5434'
$env:BACKEND_PORT = '8082'
$env:BOOTSTRAP_ADMIN_ENABLED = 'false'
$env:SPRING_PROFILES_ACTIVE = 'demo'

docker compose -f compose.demo.yaml up -d --wait
if ($LASTEXITCODE -ne 0) { throw 'The demo database did not start.' }
Set-Location backend
mvn spring-boot:run
```

On first startup, look for `Local demo created` in the backend log. Flyway creates
the schema first; the demo initializer then creates accounts, players and rosters
in one transaction. It uses the normal roster service and its validations.

### 2. Frontend

Open a second new terminal in the project root:

```powershell
$env:BACKEND_PORT = '8082'
Set-Location frontend
npm ci
if ($LASTEXITCODE -ne 0) { throw 'Frontend dependency installation failed.' }
npm run dev -- --port 5174
```

Open [localhost:5174](http://localhost:5174), not the regular development URL.
The frontend proxy sends this demo's API requests to port 8082.

On macOS/Linux, use the equivalent environment exports with the same values,
then the same Docker/Maven/npm commands. Do not put the password in a committed
file or a shell-history command containing its literal value.

## Short walkthrough

1. Sign in as `statistician.demo@example.com`. Inspect both teams and the saved
   match participants. No manual creation of eighteen players is needed.
2. In **Utakmice**, find **Demo Dunav — Demo Sava** and open **Početne postave**.
   Select players #1–#6 for each team, choose the first-serving team and confirm
   the start. Player #9 must remain outside the initial six as the designated libero.
3. Record points, including action/player details. Undo a point and inspect the
   restored score, service and rotation. Try an ordinary substitution using #7 or
   #8 and a legal libero entry using #9; follow the options offered by the app.
4. In another browser or a private window, sign in as `coach.demo@example.com`
   with the same supplied password. Open the match and statistics. New points
   should become visible automatically; this account has no write controls.
5. Compare whole-match and per-set statistics. Review suggestions require at
   least ten valid points and details on at least 80% of them, plus an applicable
   heuristic. A missing suggestion is not necessarily an error.
6. To exercise account approval, register another fictional account and sign in
   as `admin.demo@example.com` to approve it. The three seeded accounts are active
   already and do not need approval.

For a complete match, deuce and correction checks, use the
[manual checklist](PROVERA_APLIKACIJE.md). Separate browser windows in the same
normal browser profile share a session; use separate profiles/browsers or a private
window when demonstrating two roles at once.

## Restart and safety

- Seeding requires the explicit `demo` Spring profile and a supplied password.
  Normal startup does not create demo users or require this password.
- The initializer checks users, teams, players and matches. If **any application
  data already exists**, it logs `Demo data skipped` and changes nothing. It does
  not fill in partial fixtures, reset passwords, reactivate users or duplicate matches.
- The check and inserts run in one transaction with table locks. A failed insert
  or roster validation rolls the whole seed back. Flyway schema migrations are
  separate from that transaction and follow the usual startup rules.
- Do not combine this profile with administrator bootstrap. Startup rejects that
  combination before either startup initializer runs.
- Keep using the same chosen password on restarts: changing environment values
  does not change existing user hashes or the password of an initialized PostgreSQL
  volume. The demo never resets the database to a clean state automatically.
- Existing development data is protected by the separate Compose project/volume
  and connection settings above. The empty-database check is an additional safeguard,
  not a reason to point demo configuration at a real database.

## Stop without deleting data

Press `Ctrl+C` in both server terminals. In the **first terminal**, whose demo
environment settings are still present, return from `backend/` to the project root:

```powershell
Set-Location ..
docker compose -f compose.demo.yaml stop
```

The separate demo volume is retained. Close both demo terminals afterward to clear
their process-local environment settings. `Pokreni.cmd` / `Zaustavi.cmd` manage
the regular environment, not these separate demo servers.

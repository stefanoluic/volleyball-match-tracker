# Volleyball Match Tracker

A web application for recording volleyball match events and displaying statistics to coaching staff.

The application supports registration, session-based login/logout, administrator
approval, blocking and permanent deletion of blocked user accounts. Match tracking, statistics and reporting
are not implemented yet.

## Stack

- Java 21, Spring Boot 4.1.1, Maven
- PostgreSQL 18, Spring Data JPA, Flyway
- Spring Security for session authentication, CSRF protection and role-based access
- Argon2id password hashing
- React 19, TypeScript, Vite, Mantine UI
- Docker Compose for the development database

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
authorization, CSRF, session ID rotation, blocking, permanent deletion and logout. Integration tests
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
- CSRF protection is enabled for registration, login, logout and admin changes.
  The frontend obtains a masked token before each POST or DELETE and sends its specified
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
blocked account. Ordinary users currently see only their authenticated account
screen, until match features are implemented.

This is a local development version. Public deployment additionally needs HTTPS,
abuse/rate limiting, password recovery and operational configuration.

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

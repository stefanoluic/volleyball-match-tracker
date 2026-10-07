# Volleyball Match Tracker

A web application for recording volleyball match events and displaying statistics to coaching staff.

The project currently contains the initial development setup. Match tracking,
authentication, statistics and reporting will be implemented next.

## Stack

- Java 21, Spring Boot 4.1.1, Maven
- PostgreSQL 18, Spring Data JPA, Flyway
- React 19, TypeScript, Vite, Mantine UI
- Docker Compose for the development database

## Run locally

Requirements: Java 21, Maven 3.6.3 or later, Node.js 22.12 or later, and Docker Desktop
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

Open <http://localhost:5173>. The setup screen checks the backend and database.

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
npm run build
```

No automated business tests exist at this setup stage. They will be added with
the first application features.

## Stop

Use `Ctrl+C` in the backend and frontend terminals. Stop the database with:

```powershell
docker compose stop
```

The database volume is retained. Changing the database password in `.env` after
the first container initialization does not change the existing database password.

## Database migrations

Flyway manages versioned SQL files in `backend/src/main/resources/db/migration`.
The first migration creates the `volleyball` application schema. Hibernate
validates the schema rather than creating or modifying tables.

## Frontend styling

Mantine provides the shared UI components. Its styles and `MantineProvider` are
loaded in `frontend/src/main.tsx`, which also sets the primary color and default
border radius. The setup screen uses Mantine components; application-specific
styles belong in `frontend/src/styles.css` or component CSS modules.

`frontend/postcss.config.cjs` configures Mantine's CSS preset and breakpoint
variables. Form, notification and chart packages are not installed yet.

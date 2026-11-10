# Run the complete application with Docker Compose

[Project overview](../README.md) · [Development outside containers](SETUP.md)

This mode requires Docker Desktop with Linux containers and Docker Compose v2.
Java, Maven, Node.js and PostgreSQL do not need to be installed on the host:
the Dockerfiles build the application and the runtime images run it.

## Start

From the project root, create `.env` from `.env.example` if you do not already
have one. Keep an existing `.env` and its database credentials.

```powershell
Copy-Item .env.example .env
```

Set your local database password in `.env`. For a fresh database, also follow
the [initial administrator instructions](SETUP.md#initial-administrator).
Public registration creates pending users; it cannot create an administrator.

Build and start the three services:

```shell
docker compose up --build -d --wait --wait-timeout 180
```

Open [http://localhost:5173](http://localhost:5173). The first build downloads base
images and application dependencies, so it takes longer. No separately built JAR
or frontend `dist` folder is required. Later builds reuse cached layers and packages.

Once the initial administrator exists, set `BOOTSTRAP_ADMIN_ENABLED=false`, remove
the temporary administrator credentials from `.env` and apply the configuration:

```shell
docker compose up -d --wait --wait-timeout 180
```

Changing environment values requires recreating the affected container with `up`;
`docker compose restart` alone keeps its previous environment.

## Services and configuration

| Service | Runs | Connection |
| --- | --- | --- |
| `frontend` | Built React files served by Nginx | `http://localhost:5173` |
| `backend` | Spring Boot executable JAR on Java 21 | Internal `backend:8081` |
| `database` | PostgreSQL 18 | Internal `database:5432`; host `localhost:5433` |

Nginx forwards `/api/` to the backend without removing the path or query string.
The browser uses the frontend origin for both pages and API calls, including session
cookies and CSRF protection. No browser-side backend URL or CORS change is required.
Nginx resolves the backend service name again when its container is replaced.

The backend waits for a healthy database; the frontend waits for a healthy backend.
Both application runtime containers use non-root users. Maven and Node.js are used
only in build stages; the final images contain the JAR/Java runtime and static files/Nginx.

Compose explicitly supplies the database host/port and Spring listen address.
These override the local-development defaults in `application.properties`:

- `WEB_PORT` changes the browser's host port; it defaults to `5173`.
- `DB_PORT` changes the host port for pgAdmin; it defaults to `5433`.
- The container backend always connects to `database:5432` and listens internally
  on `0.0.0.0:8081`. `BACKEND_PORT` continues to configure the backend started outside Docker.
- `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` and the optional initial
  administrator settings come from the shell or the ignored `.env` file.

The existing `volleyball-match-tracker_database-data` volume is retained, so this
mode uses the same development database as the original database-only setup.
Changing `.env` credentials does not change an already initialized PostgreSQL account.
The separate demo in `compose.demo.yaml` keeps its own volume and original workflow.

## Logs and health

```shell
docker compose ps
docker compose logs -f backend
docker compose logs -f frontend
```

The backend health check is available through Nginx at
[http://localhost:5173/api/system/health](http://localhost:5173/api/system/health).
Backend port 8081 is not published to the host in this mode.

## Stop and restart

```shell
docker compose stop
docker compose up -d --wait --wait-timeout 180
```

To remove the containers and network while preserving the database:

```shell
docker compose down
```

Avoid `down --volumes` for your development stack: that additionally removes its
database volume. Rebuild after changing application code with the original
`docker compose up --build -d --wait --wait-timeout 180` command.

## Switch between containers and local development

For Java/React development on the host, the original launchers still work.
Stop the container stack with `docker compose stop`, then use `Pokreni.cmd`
or the terminal commands in [SETUP.md](SETUP.md).

Before switching back to the complete container stack, use `Zaustavi.cmd` to stop
the host servers, or stop their terminal processes manually. The modes share a
database and default frontend port, so run one mode at a time.

For a database-only start, explicitly select its service:

```shell
docker compose up -d --wait database
```

## Verify the container setup

Image builds compile the application but do not run the backend integration suite.
Keep using `mvn verify` and `npm test` for the existing automated tests.

For a container smoke test, with Python 3.10+ installed:

```shell
python scripts/test-compose.py
```

The script builds both images and uses a generated project name, random localhost
ports, generated credentials and a disposable database volume. It checks served
assets, the API proxy, sessions/CSRF, account approval, roles, CRUD, Unicode search,
backend replacement and persistence after recreating the entire stack. It removes
only its own test containers, volume, network and generated image tags on exit.
It does not start, reset or stop the regular development or demo stack.

GitHub Actions also runs this smoke test on Linux.

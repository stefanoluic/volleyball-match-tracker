"""Build and exercise the stack using a unique project, random ports and a disposable volume.

Requires Python 3.10+ and Docker Compose. Never starts or resets the regular development stack.
"""

import http.cookiejar
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from datetime import datetime, timedelta, timezone


ROOT = Path(__file__).resolve().parents[1]


def require(condition, message):
    if not condition:
        raise AssertionError(message)


class Client:
    def __init__(self, base):
        self.base = base
        self.cookies = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}),
                                                 urllib.request.HTTPCookieProcessor(self.cookies))

    def request(self, method, path, data=None, expected=200, form=False, csrf=True):
        headers = {"Origin": self.base} if method in ("POST", "PUT", "DELETE") else {}
        if method in ("POST", "PUT", "DELETE") and csrf:
            token = self.api("GET", "/api/auth/csrf")
            headers[token["headerName"]] = token["token"]
        body = None
        if data is not None:
            body = (urllib.parse.urlencode(data) if form else json.dumps(data, ensure_ascii=False)).encode("utf-8")
            headers["Content-Type"] = "application/x-www-form-urlencoded" if form else "application/json"
        request = urllib.request.Request(self.base + path, data=body, headers=headers, method=method)
        try:
            response = self.opener.open(request, timeout=20)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            raw = response.read()
            require(response.status == expected, f"{method} {path}: expected {expected}, received {response.status}")
            return raw, response.headers

    def api(self, method, path, data=None, expected=200, **options):
        raw, _ = self.request(method, path, data, expected, **options)
        return json.loads(raw) if raw else None

    def login(self, email, password, expected=200):
        return self.api("POST", "/api/auth/login", {"email": email, "password": password}, expected, form=True)


def check_frontend(client):
    html, headers = client.request("GET", "/")
    require(b'id="root"' in html, "Frontend HTML is missing the React root")
    require("no-cache" in headers.get("Cache-Control", ""), "HTML must not be cached as an immutable asset")
    asset = re.search(r'<script[^>]+src="([^"]+)"', html.decode("utf-8"))
    require(asset is not None, "Built JavaScript entry point is missing")
    bundle, headers = client.request("GET", asset.group(1))
    require(len(bundle) > 100 and "javascript" in headers.get("Content-Type", ""), "JavaScript bundle is not served correctly")
    client.request("GET", "/assets/missing-file.js", expected=404)
    fallback, _ = client.request("GET", "/a-client-side-route")
    require(b'id="root"' in fallback, "SPA fallback is missing")
    require(client.request("GET", "/healthz")[0].strip() == b"ok", "Frontend health check failed")
    require(client.api("GET", "/api/system/health")["status"] == "UP", "API proxy or database is unhealthy")
    print("PASS: built frontend assets, cache policy, SPA fallback and API proxy", flush=True)


def wait_for_proxy(base):
    deadline = time.monotonic() + 45
    while time.monotonic() < deadline:
        try:
            if Client(base).api("GET", "/api/system/health")["status"] == "UP":
                return
        except (OSError, AssertionError, ValueError):
            time.sleep(1)
    raise AssertionError("API proxy did not recover after backend replacement")


def main():
    project = "vmt-check-" + uuid.uuid4().hex[:16]
    password = secrets.token_hex(24)
    env = os.environ.copy()
    env.update({
        "POSTGRES_DB": "volleyball_check", "POSTGRES_USER": "volleyball_check", "POSTGRES_PASSWORD": password,
        "DB_PORT": "0", "WEB_PORT": "0", "BOOTSTRAP_ADMIN_ENABLED": "true",
        "BOOTSTRAP_ADMIN_EMAIL": "admin.check@example.com", "BOOTSTRAP_ADMIN_PASSWORD": password,
    })
    command = ["docker", "compose", "--project-name", project, "-f", str(ROOT / "compose.yaml")]

    def compose(*args, capture=False, check=True):
        return subprocess.run(command + list(args), cwd=ROOT, env=env, check=check,
                              text=True, encoding="utf-8", errors="replace", capture_output=capture, timeout=1200)

    def base_url():
        address = compose("port", "frontend", "8080", capture=True).stdout.strip()
        require(re.fullmatch(r"127\.0\.0\.1:\d+", address) is not None, "Unexpected frontend port binding")
        return "http://" + address

    try:
        compose("config", "--quiet")
        compose("up", "--build", "--detach", "--wait", "--wait-timeout", "180")
        base = base_url()
        wait_for_proxy(base)
        anonymous = Client(base)
        check_frontend(anonymous)
        anonymous.api("GET", "/api/auth/me", expected=401)
        anonymous.api("POST", "/api/auth/login", {"email": env["BOOTSTRAP_ADMIN_EMAIL"], "password": password},
                      expected=403, form=True, csrf=False)

        admin = Client(base)
        admin.login(env["BOOTSTRAP_ADMIN_EMAIL"], "incorrect-password", expected=401)
        require(admin.login(env["BOOTSTRAP_ADMIN_EMAIL"], password)["role"] == "ADMIN", "Administrator login failed")
        require(admin.api("GET", "/api/auth/me")["role"] == "ADMIN", "Session cookie was not retained through Nginx")
        admin.api("GET", "/api/teams", expected=403)

        clients = {}
        for role in ("STATISTICIAN", "COACH"):
            email = role.lower() + ".check@example.com"
            client = Client(base)
            account = client.api("POST", "/api/auth/register", {
                "firstName": "Probni", "lastName": "Korisnik", "email": email, "password": password,
                "confirmPassword": password, "role": role,
            }, expected=201)
            require(account["status"] == "PENDING", "Registration bypassed administrator approval")
            client.login(email, password, expected=401)
            admin.api("POST", "/api/admin/users/" + account["id"] + "/approve")
            require(client.login(email, password)["role"] == role, "Approved account could not log in")
            clients[role] = client
        stat, coach = clients["STATISTICIAN"], clients["COACH"]
        print("PASS: sessions, CSRF, pending registrations and administrator approval through Nginx", flush=True)

        home = stat.api("POST", "/api/teams", {"name": "Docker Dunav Čć", "city": "Novi Sad"}, expected=201)
        away = stat.api("POST", "/api/teams", {"name": "Docker Sava", "city": "Beograd"}, expected=201)
        stat.api("POST", "/api/teams", {"name": home["name"], "city": home["city"]}, expected=409)
        coach.api("POST", "/api/teams", {"name": "Forbidden", "city": "Test"}, expected=403)
        require(coach.api("GET", "/api/teams")["totalElements"] == 2, "Read-only account cannot read teams")
        player = stat.api("POST", "/api/teams/" + home["id"] + "/players", {
            "firstName": "Marko", "lastName": "Marković", "jerseyNumber": 1, "position": "SETTER",
        }, expected=201)
        fixture = stat.api("POST", "/api/matches", {
            "homeTeamId": home["id"], "awayTeamId": away["id"],
            "scheduledAt": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(),
        }, expected=201)
        search = "/api/matches?" + urllib.parse.urlencode({"q": "Čć", "status": "SCHEDULED"})
        require(coach.api("GET", search)["content"][0]["id"] == fixture["id"], "Unicode search or query forwarding failed")
        admin.api("POST", "/api/auth/logout", expected=204)
        admin.api("GET", "/api/auth/me", expected=401)
        print("PASS: role restrictions, team/player/match writes, Unicode filtering and logout", flush=True)

        for service in ("backend", "frontend"):
            user = compose("exec", "-T", service, "id", "-u", capture=True).stdout.strip()
            require(user.isdigit() and user != "0", service + " must run without root privileges")

        compose("up", "--detach", "--no-build", "--no-deps", "--force-recreate", "--wait", "--wait-timeout", "180", "backend")
        wait_for_proxy(base)
        stat.api("GET", "/api/auth/me", expected=401)
        stat.login("statistician.check@example.com", password)
        require(stat.api("GET", "/api/matches/" + fixture["id"])["id"] == fixture["id"], "Data disappeared after backend replacement")
        print("PASS: non-root runtime containers, backend replacement and proxy recovery", flush=True)

        # Keep this test project's volume, then recreate the entire stack from the built images.
        compose("down", "--timeout", "20")
        compose("up", "--detach", "--no-build", "--wait", "--wait-timeout", "180")
        restored_base = base_url()
        wait_for_proxy(restored_base)
        restored = Client(restored_base)
        restored.login("statistician.check@example.com", password)
        require(restored.api("GET", "/api/teams/" + home["id"])["name"] == home["name"], "Team was not persisted")
        saved_players = restored.api("GET", "/api/teams/" + home["id"] + "/players")["content"]
        require(saved_players[0]["id"] == player["id"], "Player was not persisted")
        require(restored.api("GET", "/api/matches/" + fixture["id"])["id"] == fixture["id"], "Match was not persisted")
        print("PASS: accounts, teams, players and matches survive full stack recreation", flush=True)
    except BaseException:
        compose("ps", check=False)
        compose("logs", "--no-color", "--tail", "80", check=False)
        raise
    finally:
        # A generated, explicitly selected project owns every resource deleted here.
        require(re.fullmatch(r"vmt-check-[0-9a-f]{16}", project) is not None, "Refusing cleanup of an unexpected project")
        compose("down", "--volumes", "--remove-orphans", "--rmi", "local", "--timeout", "20")


if __name__ == "__main__":
    main()

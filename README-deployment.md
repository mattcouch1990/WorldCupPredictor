# Deployment Guide — WC2026 Prediction Game

## Prerequisites
- Hetzner CX22 (or equivalent) running Ubuntu 24.04
- Domain A record pointing at the server IP (optional but required for HTTPS)
- SSH access as `root`

## Architecture

```
Internet ──► host nginx :443 (TLS, Certbot) ──► host :8080 ──► frontend container :80
                                                                       │
                                                                       │  /api/* proxied
                                                                       ▼
                                                            backend container :8000
                                                                       │
                                                                       ▼
                                                            named volume db_data (SQLite)
```

The frontend container also speaks to the backend on the internal Docker
network, so the backend never needs a published port.

---

## First-time setup

1. SSH into the server:
   ```bash
   ssh root@YOUR_SERVER_IP
   ```

2. Clone the repo to a working location and run the setup script. The
   script installs Docker, nginx, certbot, ufw, and creates an unprivileged
   `wc2026` user that owns the deployment:
   ```bash
   git clone https://github.com/YOUR_USERNAME/worldcup2026.git /tmp/wc-bootstrap
   bash /tmp/wc-bootstrap/scripts/server-setup.sh
   ```

3. Switch to the app user:
   ```bash
   su - wc2026
   ```

4. Clone the repo into the app user's home:
   ```bash
   git clone https://github.com/YOUR_USERNAME/worldcup2026.git
   cd worldcup2026
   ```

5. Create the backend env file from the example and edit it:
   ```bash
   cp backend/.env.example backend/.env
   nano backend/.env
   ```
   Set:
   - `SECRET_KEY` — generate with `openssl rand -hex 32`
   - `ADMIN_PASSWORD` — your choice; never check this in
   - `CORS_ORIGINS=https://YOUR_DOMAIN` — no trailing slash
   - `DATABASE_URL` — leave the default (`sqlite+aiosqlite:////app/data/worldcup.db`)
   - `PREDICTION_LOCK_UTC` — leave the default unless the tournament schedule changes

6. As root (or with sudo), install the host nginx site config:
   ```bash
   sudo cp nginx-host.conf /etc/nginx/sites-available/wc2026
   sudo sed -i 's/YOUR_DOMAIN_HERE/YOUR_REAL_DOMAIN/' /etc/nginx/sites-available/wc2026
   sudo ln -s /etc/nginx/sites-available/wc2026 /etc/nginx/sites-enabled/
   sudo rm -f /etc/nginx/sites-enabled/default
   sudo nginx -t
   sudo systemctl reload nginx
   ```

7. Obtain an HTTPS certificate:
   ```bash
   sudo certbot --nginx -d YOUR_DOMAIN
   ```
   Choose redirect HTTP → HTTPS when prompted. Certbot will rewrite the
   nginx config to add the :443 server block and the certificate paths.

8. Start the app as the `wc2026` user:
   ```bash
   bash scripts/deploy.sh
   ```

9. Create your first users:
   - Visit `https://YOUR_DOMAIN/admin`
   - Log in with `ADMIN_PASSWORD`
   - Create users via the Users tab; each user gets a 6-character passcode
     displayed once on creation — copy it and send it to them

---

## Subsequent deployments (after code changes)

```bash
ssh wc2026@YOUR_SERVER_IP
cd worldcup2026
bash scripts/deploy.sh
```

`deploy.sh` pulls from `main`, rebuilds images with `--no-cache`, restarts
the stack, and prints `docker compose ps`.

---

## Database backup

Always back up before deploying anything risky. The SQLite database lives
inside the `db_data` named volume.

```bash
docker compose exec backend sqlite3 /app/data/worldcup.db .dump > backup_$(date +%Y%m%d).sql
```

To restore, copy a dump into the volume and replay it:
```bash
docker compose exec -T backend sqlite3 /app/data/worldcup.db < backup_YYYYMMDD.sql
```

> **Never delete the `db_data` volume.** That is the entire database. A
> `docker compose down -v` (note the `-v`) will wipe it.

---

## Viewing logs

```bash
docker compose logs -f backend
docker compose logs -f frontend
```

The host nginx access/error logs are at `/var/log/nginx/`.

---

## Local Docker smoke test (before touching the server)

From the repo root on your dev machine:

```bash
cp backend/.env.example backend/.env
# Edit CORS_ORIGINS=http://localhost:8080 for the local test
docker compose build
docker compose up -d
```

Then verify:
- `http://localhost:8080` — frontend loads
- `http://localhost:8080/api/healthz` — returns `{"status":"ok"}`
- `http://localhost:8080/api/tournament/lock-status` — returns lock data
- `http://localhost:8080/admin` — admin login works; create a user; that
  user can log in and save a group prediction

Tear down with `docker compose down`. Use `docker compose down -v` only if
you genuinely want to wipe the local DB volume — it is destructive.

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| 502 from host nginx | The frontend container is down or not on :8080 — check `docker compose ps` |
| CORS errors in browser console | `CORS_ORIGINS` in `backend/.env` does not match the actual origin (incl. scheme and no trailing slash) |
| API 404s | `/api/` prefix missing on the request — verify `import.meta.env.PROD` was true during the build |
| Login succeeds but every API call returns 401 | `SECRET_KEY` changed between deployments without rotating JWTs — clear localStorage and log in again |
| SQLite "database is locked" | A long-running query held the writer lock; check `docker compose logs backend` for the offending request |

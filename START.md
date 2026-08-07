# 🏭 FAMS — Factory Attendance Management System
## Deployment Guide (Factory PC)

---

## ✅ Requirements
- **Docker Desktop** installed → https://www.docker.com/products/docker-desktop/
- **Windows 10/11** or **Linux** (Ubuntu recommended)
- Minimum **2 GB RAM** free, **2 GB disk space**

---

## 🚀 First Time Setup

1. **Extract** this ZIP file anywhere (e.g., `C:\FAMS\`)
2. Open a **terminal / Command Prompt** in that folder
3. Run:
   ```
   docker compose up --build -d
   ```
   > This will build and start everything. Takes ~5 minutes on first run.

4. Open your browser and go to:
   ```
   http://localhost:8080
   ```
5. You will be redirected to the **Setup Page** — create your Admin account there.

---

## 🔄 Starting / Stopping

| Action | Command |
|--------|---------|
| Start the system | `docker compose up -d` |
| Stop the system | `docker compose down` |
| View logs | `docker compose logs -f` |
| Restart | `docker compose restart` |

---

## 🔐 Required Secrets

Create a `.env` file in the same folder as `docker-compose.yml` (or export these in your shell) before starting:

```env
POSTGRES_PASSWORD=replace-with-a-long-random-password
JWT_SECRET=replace-with-at-least-32-random-characters
BIOMETRIC_ENCRYPTION_KEY=replace-with-a-long-random-key
GOOGLE_CLIENT_ID=your-google-oauth-web-client-id
ADMIN_GOOGLE_EMAIL=admin1@gmail.com,admin2@gmail.com
```

`ADMIN_GOOGLE_EMAIL` is a comma-separated allowlist of Google accounts that may sign in as admin. These emails are **not** shown on the login page.

After changing `.env`, restart:

```
docker compose up -d
```

(or `docker compose up --build -d` if you also changed app code)

---

## 🌐 Accessing from other PCs on the factory network

Other computers on the same WiFi/LAN can access the system at:
```
http://<THIS-PC-IP>:8080
```
Find your IP with: `ipconfig` (Windows) or `ip addr` (Linux)

---

## 📱 Kiosk tablet

1. Open `http://<SERVER-IP>:8080/kiosk` on the tablet (use **HTTPS** in production — browsers require a secure context for the camera except on localhost).
2. **On factory LAN:** the kiosk auto-pairs via bootstrap and starts scanning.
3. **Off-site / public internet:** an admin unlocks once with Google (accounts listed in `ADMIN_GOOGLE_EMAIL`). The device stores a kiosk token until an admin regenerates it under Settings → Security.
4. Enable **Cached Offline Scan Capability** in Settings → AI & Kiosk if tablets should queue punches when the network drops (they sync via bulk-sync when back online).
5. After regenerating the kiosk token, every tablet must unlock again.

PWA: the web app manifest uses `start_url: "/kiosk"` so “Add to Home Screen” opens the kiosk directly.

---

## 📁 Your Data
Attendance data is stored in the PostgreSQL volume `fams-postgres-data`.
Use a PostgreSQL-aware backup process such as `pg_dump` and test restores regularly.
The application applies only versioned Prisma migrations during startup.

---

## ❓ Troubleshooting

| Problem | Solution |
|---------|----------|
| Port 8080 already in use | Change `8080:80` to `8090:80` in `docker-compose.yml` |
| Container won't start | Run `docker compose logs backend` to see errors |
| Forgot admin password | Use the "Forgot Password" link on the login page |
| Google button missing on kiosk | Ensure `GOOGLE_CLIENT_ID` is set and the backend is reachable |
| Kiosk stuck after token change | Unlock again with Google, or reconnect on factory LAN |

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

Set `JWT_SECRET` and `POSTGRES_PASSWORD` in the environment before starting.
Also set `BIOMETRIC_ENCRYPTION_KEY` when face recognition is enabled.
All must be long, random values; the application refuses production startup without the required secrets.

---

## 🌐 Accessing from other PCs on the factory network

Other computers on the same WiFi/LAN can access the system at:
```
http://<THIS-PC-IP>:8080
```
Find your IP with: `ipconfig` (Windows) or `ip addr` (Linux)

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

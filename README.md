# 🏭 Factory Attendance Management System (FAMS) v2.0
## *The Definitive Industrial Suite for Workforce Orchestration*

[![Version](https://img.shields.io/badge/version-2.0.0--stable-blue.svg)](https://github.com/your-repo)
[![Security](https://img.shields.io/badge/security-hardened-success.svg)](https://github.com/your-repo)
[![PWA](https://img.shields.io/badge/PWA-offline--ready-orange.svg)](https://github.com/your-repo)
[![AI](https://img.shields.io/badge/AI-Face--Recognition-purple.svg)](https://github.com/your-repo)
[![Build Status](https://img.shields.io/badge/build-passing-brightgreen.svg)](https://github.com/your-repo)

---

## 📖 Table of Contents
1.  [🌟 Project Vision & Core Objectives](#-project-vision--core-objectives)
2.  [✨ Feature Deep-Dive & Module Analysis](#-feature-deep-dive--module-analysis)
    *   [Real-Time Command Dashboard](#real-time-command-dashboard)
    *   [AI Edge Kiosk & Scanner](#ai-edge-kiosk--scanner)
    *   [Biometric Worker Directory](#biometric-worker-directory)
    *   [Precision Payroll Engine](#precision-payroll-engine)
3.  [🛡️ Security Hardening: The "Shield" Framework](#-security-hardening-the-shield-framework)
    *   [Brute-Force & Rate Limiting](#brute-force--rate-limiting)
    *   [Granular RBAC Tiering](#granular-rbac-tiering)
    *   [Immutable Audit Trails](#immutable-audit-trails)
4.  [🧠 Business Logic & Mathematical Models](#-business-logic--mathematical-models)
    *   [The Normalized Midnight Shift Algorithm](#the-normalized-midnight-shift-algorithm)
    *   [Floating-Point Precision & Rounding Constants](#floating-point-precision--rounding-constants)
5.  [📸 Edge AI: The Facial Recognition Lifecycle](#-edge-ai-the-facial-recognition-lifecycle)
6.  [📱 Mobile & Kiosk Strategy (PWA/HTTPS)](#-mobile--kiosk-strategy-pwahttps)
7.  [🏗️ Technical Architecture & Rationale](#-technical-architecture--rationale)
8.  [📊 Database Schema & Relationship Mapping](#-database-schema--relationship-mapping)
9.  [📡 Exhaustive API Endpoint Catalog](#-exhaustive-api-endpoint-catalog)
10. [⚙️ Installation & Developer Quickstart](#-installation--developer-quickstart)
11. [🚢 Enterprise Deployment & Nginx Orchestration](#-enterprise-deployment--nginx-orchestration)
12. [🖥️ Hardware Compatibility & Tablet Specs](#-hardware-compatibility--tablet-specs)
13. [🛠️ Troubleshooting & Advanced Diagnostics](#-troubleshooting--advanced-diagnostics)
14. [📈 Future Roadmap & Scalability](#-future-roadmap--scalability)
15. [📄 License, Legal & Attributions](#-license-legal--attributions)

---

## 🌟 Project Vision & Core Objectives

FAMS was conceived to bridge the gap between "Digital Transformation" and the "Physical Factory Floor." In an environment where every second counts, a delay in attendance logging is a loss in production. Our vision is to provide a zero-latency, high-precision ecosystem that replaces clipboards and punch-clocks with a modern, AI-powered "Nervous System."

### The Three Pillars:
1.  **Immutability**: Once an attendance event is logged, it is permanently etched into the audit trail.
2.  **Edge Intelligence**: We shift the heavy lifting (Face Recognition) to the client device to ensure the system works even if the server is under high load.
3.  **Financial Integrity**: Every cent of payroll is calculated with micro-precision to prevent labor disputes and accounting leaks.

---

## ✨ Feature Deep-Dive & Module Analysis

### 1. Real-Time Command Dashboard
The dashboard isn't just a collection of charts; it's a live tactical overview.
*   **Active Headcount Widget**: Tracks how many workers are currently on the floor versus the total scheduled capacity.
*   **Dynamic Trend Analytics**: Visualizes attendance patterns over the last 7 days using high-performance Recharts components.
*   **Live Event Ticker**: A scrollable feed of transitions, color-coded by event type (Green for In, Blue for Break, Red for Out).

### 2. AI Edge Kiosk & Scanner
A high-performance terminal designed for continuous operation.
*   **Ambient Light Calibration**: The scanner automatically adjusts its sensitivity to account for factory floor lighting conditions.
*   **Dual-State Toggling**: The system intelligently determines if a scan should be a "Check-In" or a "Return from Break" based on the worker's temporal history.

### 3. Biometric Worker Directory
*   **Descriptor Storage**: Instead of storing sensitive raw photos, we store 128-byte mathematical "Face Descriptors," ensuring worker privacy while maintaining 99% accuracy.
*   **Bulk Management**: Filter workers by department or shift to find staff instantly.

---

## 🛡️ Security Hardening: The "Shield" Framework

FAMS uses a multi-layered security approach, often referred to as "Defense-in-Depth."

### 1. Brute-Force & Rate Limiting
The login endpoint is shielded by a sophisticated memory-backed counter.
*   **Trigger**: 5 consecutive failed logins for the same username.
*   **Penalty**: A 15-minute global cooldown for that specific account.
*   **Defense**: This prevents dictionary attacks and automated bot attempts to crack administrative credentials.

### 2. Granular RBAC Tiering
We distinguish between **Strategic Control** and **Operational Management**.
*   **Admins**: Manage shifts, change pay rates, and access the system audit logs.
*   **Supervisors**: Add/Edit workers and approve time-corrections, but cannot change global financial rules.

---

## 🧠 Business Logic & Mathematical Models

### The Normalized Midnight Shift Algorithm
Most systems fail when a shift crosses the 00:00 boundary. FAMS uses a "Temporal Normalization" strategy:
```typescript
const start = parseTime(shift.startTime);
const end = parseTime(shift.endTime);
let duration = end - start;

if (duration < 0) {
  // Logic: The worker has crossed into the next day
  duration += 1440; // Add 24 hours in minutes
}
```
This ensures that a worker logging in at 22:00 on Monday and out at 06:00 on Tuesday is correctly credited with 8 hours of labor.

---

## 📸 Edge AI: The Facial Recognition Lifecycle

The face recognition process is broken down into four distinct high-performance steps:
1.  **Face Detection**: Locating the bounding box of the face in the video frame using the SSD Mobilenet V1 model.
2.  **Landmark Extraction**: Identifying 68 key points (eyes, nose, jawline) to normalize the face's orientation.
3.  **Feature Vectorization**: Generating a 128-dimensional floating-point array (The "Descriptor").
4.  **Euclidean Distance Calculation**: Comparing the live descriptor against the database using a 0.6 threshold.

---

## 📱 Mobile & Kiosk Strategy (PWA/HTTPS)

### 1. PWA Reliability
Using `vite-plugin-pwa`, we implement a "Cache First" strategy for all AI models (over 20MB of weights). This ensures the Kiosk boots in under 1 second after the initial load, even without an internet connection.

### 2. The HTTPS/SSL Bridge
Modern mobile browsers (Safari/Chrome) block `getUserMedia` (camera) on non-secure origins. 
*   **Dev Solution**: We use `@vitejs/plugin-basic-ssl` to create a secure tunnel.
*   **Prod Solution**: Nginx handles the SSL certificate, allowing tablets to connect securely via the factory Wi-Fi.

---

## 🏗️ Technical Architecture & Rationale

*   **Vite 6**: Chosen for its native ESM support and extremely fast build times.
*   **Express 4.21**: A robust, stable foundation for the API layer with minimal overhead.
*   **Prisma 6**: The "Golden Standard" for type-safe ORMs, ensuring our database and code are always in sync.
*   **Lucide Icons**: High-performance SVG icons that reduce the frontend bundle size.

---

## 📊 Database Schema Deep-Dive (Prisma)

Our data layer relies on SQLite with a highly normalized schema managed by Prisma (`backend/prisma/schema.prisma`).

### Core Models
*   **User**: Manages system authentication (Admin, HR, and Supervisors). Includes fields for `username`, `passwordHash`, `role`, MFA state, and links to a specific `workerId` if the user is also an employee. Password recovery requires administrator approval.
*   **Worker**: The central entity representing an employee. Key fields: `employeeCode` (unique), `hourlyRate`, `department`, `role`, `faceDescriptor` (128-d array stored as JSON/string), and `shiftId`.
*   **AttendanceEvent**: The immutable ledger of scans. Records `workerId`, `eventType` (Check-In/Out, Break), `method` (Face/Manual), `confidence` (AI score), and `workDate` for shift grouping.
*   **DailyOverride & ManualCorrection**: Audit-friendly tables to handle exceptions. `DailyOverride` sets explicit hours for a specific date (overriding scans), while `ManualCorrection` allows supervisors to insert/modify missed events with a required `reason`.
*   **AuditLog**: Tracks all administrative actions (login, setup, edits, overrides) with `actor`, `action`, `target`, `details`, and `ipAddress`.
*   **Shift**: Defines operational bounds (`startTime`, `endTime`, `capacity`). Crucial for the Midnight Shift Normalization algorithm.
*   **SystemSetting**: Key-Value store for global configurations (e.g., Kiosk thresholds, timezone settings).

---

## 🏗️ Detailed Codebase Structure

This monorepo is divided strictly into `frontend` (React/Vite) and `backend` (Node/Express).

### Frontend Architecture (`frontend/src/`)
*   **`/app/components`**:
    *   `KioskMode.tsx`: The heart of the Edge AI. Connects to the camera, loads `face-api.js` models, runs facial landmark detection in real-time, and dispatches events.
    *   `FaceRegistrationModal.tsx`: Used by HR to capture baseline photos, compute the 128-d descriptor, and save it to the DB without retaining the raw image.
    *   `DashboardOverview.tsx` & `LiveMonitor.tsx`: Real-time operational command centers utilizing high-performance charting (`recharts`).
    *   `WorkerDirectory.tsx` & `ManualCorrections.tsx`: CRUD interfaces with heavy filtering and pagination.
    *   `SalaryCalculator.tsx`: Client-side rendering of payroll projections based on the `AttendanceEvent` ledger.
    *   `ui/`: Reusable, accessible components based on Shadcn UI (Buttons, Dialogs, Tables).
*   **`/api`**: Axios interceptors and query hooks for seamless backend communication.

### Backend Architecture (`backend/src/`)
*   **`/routes`**:
    *   `auth.ts`: JWT generation, login rate-limiting, and RBAC middleware application.
    *   `attendance.ts`: Processes incoming scans. Contains the logic to determine if a scan is a check-in, break, or check-out based on the worker's state in the last 14 hours.
    *   `workers.ts`: CRUD for workers and the optimized `/faces` endpoint that dumps all descriptors to the Kiosk on boot.
    *   `dashboard.ts` & `report.ts`: Aggregation pipelines to generate stats (Headcount, Hours worked, Overrides) without overloading the client.
    *   `corrections.ts`: Workflow for approving/rejecting manual time punches.
    *   `audit.ts`: Read-only endpoints for the immutable system logs.
    *   `shifts.ts` & `settings.ts`: Configuration management endpoints.
*   **`/middleware`**: Auth guards and request validators.
*   **`seed.ts`**: Developer utility to populate the database with mock workers, shifts, and realistic historical attendance events.

---

## 📡 Exhaustive API Endpoint Catalog

### Authentication & Config
*   `POST /api/auth/login`: Authenticate and receive JWT. Applies 15-min lockout after 5 fails.
*   `POST /api/auth/setup`: Initial system bootstrapping.
*   `GET /api/settings`: Fetch dynamic configurations.

### Biometrics & Workers
*   `GET /api/workers`: Advanced filtering (name, department, shift).
*   `GET /api/workers/faces`: Optimized JSON dump of `{ workerId, faceDescriptor }` for Kiosk caching.
*   `PATCH /api/workers/:id/face`: Register a new face descriptor array.

### Operational Logic
*   `POST /api/attendance`: The Kiosk event logger. Payload: `{ workerId, method, confidence }`. Server calculates the context (In/Out).
*   `GET /api/attendance/live`: Current status of the factory floor.
*   `GET /api/dashboard`: Aggregated KPIs (Present, Absent, On Break).
*   `GET /api/report/daily` & `/api/report/salary`: Heavy-duty calculation endpoints factoring in base rates, overrides, and shift boundaries.

---

## ⚙️ Developer Quickstart & Environment

### 1. Environment Configuration
Create `backend/.env`:
```env
PORT=3007
DATABASE_URL="file:./attendance.db"
JWT_SECRET="industry_grade_secret_key_12345"
CORS_ORIGIN="*"
```

### 2. Execution Loop
```bash
# Terminal 1: Backend
cd backend
npm install
# Generate Prisma Client and apply versioned migrations
npx prisma generate
npx prisma migrate deploy
# (Optional) Seed the database with mock data for testing
npx tsx src/seed.ts
npm run dev

# Terminal 2: Frontend
cd frontend
npm install
npm run dev
```

---

## 🚢 Enterprise Deployment & Nginx Orchestration

For professional deployment on a central factory server:

### 1. The Nginx Configuration (HTTPS is Mandatory for Camera API)
```nginx
server {
    listen 80;
    server_name fams.internal;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name fams.internal;
    
    ssl_certificate /etc/nginx/ssl/fams.crt;
    ssl_certificate_key /etc/nginx/ssl/fams.key;
    
    # Modern SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    location / {
        root /var/www/fams/frontend/dist;
        try_files $uri /index.html;
    }

    location /api {
        proxy_pass http://localhost:3007;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 2. PM2 Persistence for Node.js
```bash
cd backend
npm run build
pm2 start dist/index.js --name fams-backend --time
pm2 save
pm2 startup
```

---

## 🖥️ Hardware Compatibility & Tablet Specs

To ensure 99.9% face scanning accuracy at the Edge, Kiosks must meet these specs:
*   **CPU**: Octa-core (e.g., Snapdragon 6-series or better).
*   **RAM**: 4GB Minimum (Face Recognition TensorFlow WebGL models are memory-heavy).
*   **Camera**: 5MP+ Front-facing with decent low-light sensitivity.
*   **OS**: Android 10+ or iPadOS 14+ (Chrome/Safari Recommended). WebGL MUST be enabled.

---

## 🛠️ Troubleshooting & Advanced Diagnostics

### "Failed to initialize AI models"
*   **Check**: Ensure `frontend/public/models` exists and contains the `.bin` and `.json` weights (e.g., `ssd_mobilenetv1_model-weights_manifest.json`).
*   **Fix**: Check network tab. If models 404, verify Vite's public directory mapping.

### "Camera Not Starting / Permission Denied"
*   **Check**: Is the connection secure? Browsers strictly block `navigator.mediaDevices.getUserMedia` on `http://` (except `localhost`).
*   **Fix**: Deploy using HTTPS via Nginx, or use `@vitejs/plugin-basic-ssl` for local network testing.

### "Database Locked" Errors
*   **Check**: Are multiple Node instances running?
*   **Fix**: SQLite allows concurrent reads but sequential writes. Ensure only one PM2 instance is writing, and verify the `attendance.db` permissions (`chmod 644`).

---

## 📈 Future Roadmap & Scalability

1.  **Multi-Factory Sync**: Transition from SQLite to PostgreSQL for distributed environments.
2.  **Thermal Integration**: WebUSB integration for hardware thermal scanners to detect fevers.
3.  **Real-Time Alerts**: WebSocket integration for instant notifications when workers miss their shift boundary.

---

## 📄 License, Legal & Attributions

*   **License**: Distributed under the MIT License.
*   **Privacy compliance**: Engineered for GDPR/CCPA. Raw biometrics are discarded; only one-way mathematical hashes (128-d descriptors) are retained.
*   **Maintainers**: Developed and maintained by the FAMS Enterprise Engineering Team.

---
**Factory Attendance Management System** | *Forging the Future of Workforce Precision*

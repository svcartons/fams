# 🏗️ FAMS Engineering & Architectural Blueprint

This document defines the technical standards, architectural patterns, and engineering logic governing the **Factory Attendance Management System (FAMS)**. It is intended for senior engineers and system architects.

---

## 1. 🏗️ Code Principles
*   **DRY (Don't Repeat Yourself)**: Abstract shared logic into hooks (frontend) or utilities (backend).
*   **KISS (Keep It Simple, Stupid)**: Favor readability over "clever" one-liners.
*   **SoC (Separation of Concerns)**: Keep UI logic out of API fetchers and business logic out of UI components.

## 2. 🎨 Frontend Standards

### 2.1 Component Architecture
*   **Atomic Design**: Small, stateless components in `components/ui`. Complex, stateful orchestrators in `pages`.
*   **Prop Types**: Use TypeScript interfaces for all component props. Use `Readonly` for immutable objects.
*   **Naming**: PascalCase for components (`WorkerDirectory.tsx`), camelCase for hooks (`useAttendance.ts`).

### 2.2 Styling with Tailwind CSS 4
*   **Utility First**: Use standard Tailwind utilities. Custom CSS should be defined in `index.css` using `@theme` tokens.
*   **Consistency**: Use the `default_shadcn_theme.css` tokens for spacing, colors, and shadows to maintain visual harmony.
*   **Responsiveness**: Always use mobile-first breakpoints (`sm:`, `md:`, `lg:`).

### 2.3 Data Fetching
*   **Client**: Use the singleton `apiClient` in `src/api/client.ts`.
*   **State**: Favor `useEffect` with local `useState` for simple fetches. For complex caching, use a robust library like TanStack Query (future roadmap).

## 3. ⚙️ Backend Standards

### 3.1 API Architecture & Design
*   **Resource-Oriented Design**: Adhere strictly to RESTful principles. Use `GET` for idempotent retrieval, `POST` for state-changing creation, and `PATCH` for granular updates.
*   **Authorization Tiering**: 
    *   **Kiosk Access (Public)**: Selected high-traffic endpoints (`GET /workers/faces`, `POST /attendance`) are exposed to the local network to ensure zero-friction operations.
    *   **Management Access (Private)**: All administrative and financial routes are shielded by the `authenticateToken` middleware, requiring a valid `Bearer` token in the `Authorization` header.
*   **Unified Proxy Bridge**: To resolve `Mixed Content` security blocks on mobile/HTTPS environments, the frontend utilizes a relative `/api` base. Vite’s `server.proxy` dynamically tunnels these requests to the backend's internal `3007` port.

### 3.2 Security Posture & Error Handling
*   **Brute-Force & Rate Limiting**: Critical endpoints (Login) are protected by rate-limiting logic. Excessive failures result in a `429 Too Many Requests` status and a temporary account lockout.
*   **Exception Lifecycle**: All route handlers must use `try-catch` blocks that log a unique trace to the server logs while returning a sanitized, user-friendly error response to the client.
*   **CORS Hardening**: In production, CORS must be restricted to the specific deployment domain. In development, `origin: true` is utilized to dynamically validate requests from authorized network IPs (e.g., mobile devices).

### 3.3 Business Logic
*   **Date Handling**: Use `date-fns` for complex date math. Always consider the local factory timezone when calculating shifts.
*   **Precision**: Store money values as integers (cents) or use fixed-point arithmetic to avoid floating-point errors in payroll.

## 4. 💾 Database Management

### 4.1 Prisma Best Practices
*   **Schema First**: Define the data model in `schema.prisma` before writing service code.
*   **Migrations**: Use `prisma migrate dev` for local development. Never manual-edit the database schema.
*   **Indexing**: Add `@@index` to frequently queried fields (e.g., `workerId`, `timestamp`).

## 5. 🧪 Quality Assurance
*   **Type Safety**: Ensure `npm run build` passes with zero TypeScript errors before pushing code.
*   **Manual Testing**: Every feature must be validated against the "Midnight Shift" edge case (shifts starting at 10 PM and ending at 6 AM).
*   **Linting**: Follow the standard ESLint and Prettier configurations.

## 6. 📝 Documentation & Git
*   **Git Flow**: Use feature branches. Merge via Pull Request after peer review.
*   **Commits**: Use conventional commits (e.g., `feat: add worker export`, `fix: payroll calculation offset`).
*   **Comments**: Use JSDoc for complex utility functions to provide IDE-level documentation.

---
*Developed & Maintained by the FAMS Core Engineering Team.*

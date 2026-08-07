Design a complete, production-ready UI/UX system for an **offline-first workforce attendance and work-hours logging system** used in factories, workshops, warehouses, and industrial workplaces. The product must be designed as a real operational tool used daily under time pressure — not a concept UI.

**Product Name:** Attendance System V1
**Product Type:** Face-powered workforce attendance and work-hours logging system
**Primary Use Case:** Supervisors use an Android phone to identify workers via face recognition and log attendance events. Admins and HR use a desktop dashboard for monitoring, corrections, and reporting. Workers do not use any app.  

---

# Product Context

This system is used to:

* identify workers using face recognition
* log attendance events
* log tea breaks
* log lunch breaks
* log check-out
* compute daily work hours
* show live worker states
* allow manual corrections with audit trail
* operate fully offline on local Wi-Fi / LAN

This system is used in industrial environments and must feel:

* fast
* minimal
* operational
* industrial
* highly readable
* low-friction
* reliable under pressure

This is **not** a consumer app.
This is an **operational workforce tool**.

The visual style should feel like:

* industrial operations software
* workforce terminal
* factory control system
* enterprise utility dashboard
* medical device interface

Avoid:

* social/mobile consumer design patterns
* decorative UI
* gamification
* playful animations
* cluttered dashboards

Design for speed, clarity, and operational reliability.

---

# Core Product Rules

* Workers do not use the app
* Supervisors use an Android phone as the attendance terminal
* Admins / HR use a desktop web dashboard
* The system runs fully offline on local Wi-Fi / LAN
* Face recognition is the worker identification method
* Attendance is recorded as worker events
* Manual override is allowed, but must always create an audit trail

---

# Design Principles

The UI must be:

### Fast

Built for repetitive high-speed usage during shift changes.

### Minimal

Only essential information visible at any time.

### Operational

Optimized for repeated daily use in industrial environments.

### Highly Readable

High contrast, large labels, obvious hierarchy.

### Low Friction

Minimal taps, fast feedback, large touch targets.

### Reliable

Clear states, obvious errors, confident confirmation.

### Industrial

Enterprise utility aesthetic, not consumer mobile.

---

# Scale Assumptions

Design for real operational load:

* 50–200 workers per site
* 20–80 workers per shift
* 30–50 workers checking in within 10 minutes
* multiple shifts per day
* 1–3 supervisors per shift

Design must support high-throughput operational usage.

---

# PART 1 — Supervisor Android App

Design a complete Android supervisor app used as the primary attendance terminal.

## Device Constraints

* Android 9.0+
* optimized for 6–6.5 inch Android phones
* portrait-first
* minimum touch target 48dp (56dp preferred)
* rear camera
* Wi-Fi only
* local LAN usage

## Screen Flow

Login → Session Start → Face Scan (Primary Screen) ↔ Manual Select
↓
Live Status / Event Log / Daily Summary
↓
Manual Override / Sync Status / Settings

---

## Required Android Screens

### 1. Login Screen

* Supervisor login
* Supervisor ID / username
* Password
* Offline login support
* Local server connection status
* Error states:

  * invalid credentials
  * server unreachable
  * offline login available

### 2. Session Start Screen

* Current date and time
* Shift selector
* Department / team selector
* Session status
* Start Session CTA
* Resume previous session (if active)

### 3. Face Scan Screen (Primary Operational Screen)

This is the most important screen in the entire system.

Design the main face scanning workflow for rapid worker recognition and event capture.

Must include:

* full camera preview
* face detection overlay frame
* recognition states:

  * no face
  * detecting
  * recognized
  * low confidence
  * no match
  * multiple faces
  * poor lighting
  * face obscured
* worker recognition result card
* worker photo
* worker name
* worker ID
* confidence score
* current worker state
* last event
* event action buttons:

  * Check In
  * Tea Break
  * Lunch Break
  * Check Out
* dynamic button states based on worker status
* retry action
* manual select fallback
* session info
* sync indicator
* success confirmation state
* auto-reset for next worker

Also design:

* Rapid Scan Mode (bulk check-in mode)
* no match recovery flow
* repeated low-confidence recovery flow
* camera failure fallback

This is the core operational screen and must be optimized for speed, throughput, and low supervisor error.

### 4. Manual Worker Selection Screen

* searchable worker list
* worker cards
* worker photo
* worker ID
* worker name
* department
* current state
* manual event selection
* confirmation flow
* manual event reason

### 5. Live Worker Status Screen

* checked in
* on tea break
* on lunch break
* checked out
* absent
* grouped worker sections
* worker cards
* live state counters
* break duration alerts
* auto-refresh

### 6. Event Log Screen

* chronological event log
* grouped by time
* worker name
* event type
* timestamp
* source (face/manual)
* sync state
* event filters
* retry failed sync

### 7. Daily Summary Screen

* total workers
* present
* absent
* active
* checked out
* average check-in
* average check-out
* manual entries
* issue alerts
* export summary
* close session

### 8. Manual Override Screen

* warning banner
* select worker
* edit event
* timestamp edit
* reason required
* quick reason chips
* re-auth confirmation
* audit warning
* submit override

### 9. Sync Status Screen

* server connection state
* synced events
* pending events
* failed sync
* retry failed
* sync queue
* auto retry state

### 10. Settings Screen

* local server IP
* port
* sync settings
* camera settings
* session settings
* app version
* local cache info
* logout

---

# PART 2 — Admin Web Dashboard

Design a responsive desktop-first admin dashboard for supervisors, HR, and admins.

## Platform Constraints

* desktop-first
* minimum 1366x768
* optimized for 1920x1080
* responsive
* tablet-compatible
* browser-based enterprise dashboard

## Dashboard Navigation

Dashboard Overview
Live Attendance Monitor
Worker Directory
Worker Profile Detail
Daily Attendance Report
Manual Corrections
Audit Logs
Settings

---

## Required Dashboard Pages

### 1. Dashboard Overview

* total workers
* present
* absent
* on break
* checked out
* late workers
* live shift overview
* KPI cards
* attendance trend chart
* recent activity feed
* alerts panel
* quick actions

### 2. Live Attendance Monitor

* real-time worker state table
* worker photo
* worker ID
* worker name
* department
* current state
* last event
* live duration
* filters
* auto-refresh
* row alerts for excessive breaks

### 3. Worker Directory

* searchable worker list
* grid / table toggle
* worker cards
* worker photo
* department
* role
* status
* add worker
* import / export

### 4. Worker Profile Detail

* worker profile
* worker photo
* metadata
* attendance history
* today activity
* statistics
* audit trail
* re-enroll face action

### 5. Daily Attendance Report

* full attendance table
* check-in
* tea break
* lunch break
* check-out
* total presence
* net work
* payable hours
* status
* export
* filters
* quick issue filters

### 6. Manual Corrections

* pending approvals
* correction history
* create manual correction
* before / after comparison
* approval flow
* impact on payable hours

### 7. Audit Logs

* actor
* action
* target
* timestamp
* metadata
* filters
* expandable audit details
* export logs

### 8. Settings

* departments
* shifts
* break rules
* work-hour rules
* user roles
* permissions
* system config
* backup & maintenance

---

# PART 3 — Design System

Create a complete reusable design system and component library.

## Typography

Use industrial enterprise UI typography.

Font: Inter or Roboto

Include:

* mobile typography scale
* desktop typography scale
* strong hierarchy
* large KPI numerics
* readable worker labels
* compact metadata text

## Color System

Use a clean industrial palette with high contrast.

Include:

* primary blue
* success green
* warning amber
* error red
* accent purple
* full neutral gray scale
* status color mapping
* contrast-compliant usage

## Spacing System

Use 4px base spacing system.

Include:

* spacing scale
* layout spacing
* card spacing
* table spacing
* form spacing

## Components

Create reusable components for:

* buttons
* icon buttons
* status badges
* worker cards
* summary cards
* event rows
* table rows
* inputs
* dropdowns
* search bars
* modals
* alert banners
* toasts
* sync indicators
* audit badges
* camera overlay
* face frame states
* recognition result card
* empty states
* loading states
* confirmation states

## States

Design all major system states:

* success
* warning
* error
* loading
* offline
* syncing
* no match
* low confidence
* multiple faces
* face obscured
* poor lighting
* failed recognition
* manual override warning

## Accessibility

Include:

* high contrast
* touch target compliance
* screen reader support
* keyboard navigation
* focus states
* clear labels
* reduced motion support

## Motion

Use functional, minimal motion only.

Include:

* recognition card transitions
* success confirmation
* toast motion
* modal transitions
* loading behavior
* reduced motion fallback

---

# UX Requirements

Design for:

* high-speed operational use
* low-friction scanning
* minimal taps
* large touch targets
* rapid recognition feedback
* clear worker state visibility
* low supervisor training
* reliable error recovery
* high throughput at shift change

This system is used under time pressure in real industrial environments.

Optimize for:

* speed
* clarity
* operational reliability
* error recovery
* production usability

---

# Deliverables

Generate:

1. complete Supervisor Android App screens
2. complete Admin Web Dashboard screens
3. reusable design system
4. component library
5. mobile prototype
6. desktop prototype
7. all states and edge cases
8. production-ready UI patterns

Design this as a real enterprise workforce operations product ready for implementation, not a concept design.

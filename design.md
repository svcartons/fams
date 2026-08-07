# FAMS v2.0 Premium Design Specification
## Core Design System & UI/UX Guidelines

This document specifies the exact visual language, theme tokens, styling utilities, and UI guidelines for the **Factory Attendance Management System (FAMS) v2.0**. Use this specification to implement new features, pages, or components to ensure strict visual parity and premium design aesthetics across all modules.

---

## 🎨 1. Core Color System

The system uses a sleek **Industrial-Premium** color palette. It blends deep high-reliability blues with vibrant modern gradients and precise functional status indicators.

### A. Theme Variables (Light Mode)
```css
:root {
  --background: #FAFAFA;       /* Slate-white canvas */
  --foreground: #111827;       /* Deep obsidian text */
  --card: #FFFFFF;             /* Crisp paper cards */
  --card-foreground: #111827;
  --popover: #FFFFFF;
  --popover-foreground: #111827;

  /* Brand Primary (Reliable Industrial Blue) */
  --primary: #1E40AF;
  --primary-500: #3B82F6;
  --primary-400: #60A5FA;
  --primary-foreground: #FFFFFF;

  /* Accent (High-tech Violet) */
  --accent: #7C3AED;
  --accent-500: #8B5CF6;
  --accent-400: #A78BFA;
  --accent-foreground: #FFFFFF;

  /* Functional Indicators */
  --success: #059669;          /* Deep emerald (Check-in/Valid) */
  --success-500: #10B981;
  --success-400: #34D399;

  --warning: #D97706;          /* Amber (Break/Action needed) */
  --warning-500: #F59E0B;
  --warning-400: #FBBF24;

  --error: #DC2626;            /* Industrial red (Check-out/Error) */
  --error-500: #EF4444;
  --error-400: #F87171;

  /* Neutral Gray Scales */
  --gray-50: #F9FAFB;
  --gray-100: #F3F4F6;
  --gray-200: #E5E7EB;
  --gray-300: #D1D5DB;
  --gray-400: #9CA3AF;
  --gray-500: #6B7280;
  --gray-600: #4B5563;
  --gray-700: #374151;
  --gray-800: #1F2937;
  --gray-900: #111827;

  /* Borders & Components */
  --secondary: #F3F4F6;
  --secondary-foreground: #111827;
  --muted: #E5E7EB;
  --muted-foreground: #6B7280;
  --destructive: #DC2626;
  --destructive-foreground: #FFFFFF;
  --border: #D1D5DB;
  --input: transparent;
  --input-background: #FFFFFF;
  --switch-background: #9CA3AF;
  --ring: #1E40AF;
}
```

### B. High-Contrast Dark Mode (OKLCH Precision)
Dark Mode uses precise perceptual OKLCH coordinates to ensure perfect visual contrast, avoiding muddy greys in favor of a futuristic jet-black/glass canvas.
```css
.dark {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
  --card: oklch(0.145 0 0);
  --card-foreground: oklch(0.985 0 0);
  --popover: oklch(0.145 0 0);
  --popover-foreground: oklch(0.985 0 0);
  --primary: oklch(0.985 0 0);
  --primary-foreground: oklch(0.205 0 0);
  --secondary: oklch(0.269 0 0);
  --secondary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.269 0 0);
  --muted-foreground: oklch(0.708 0 0);
  --accent: oklch(0.269 0 0);
  --accent-foreground: oklch(0.985 0 0);
  --destructive: oklch(0.396 0.141 25.723);
  --destructive-foreground: oklch(0.637 0.237 25.331);
  --border: oklch(0.269 0 0);
  --input: oklch(0.269 0 0);
  --ring: oklch(0.439 0 0);
}
```

---

## 📐 2. Typography & Hierarchy

We use **Inter** (paired optionally with **Outfit** for headers) to communicate clarity, high-precision technical telemetry, and premium editorial polish.

| Variable Name | Value | Recommended Context |
| :--- | :--- | :--- |
| `--text-hero` | `48px` | Mega kiosk counters, primary clock metrics |
| `--text-display` | `36px` | Page-level metrics, scan status banners |
| `--text-title` | `28px` | Major section headers, card group titles |
| `--text-heading` | `20px` | Individual widget headers, modal titles |
| `--text-body-lg` | `18px` | Detailed descriptions, interactive list items |
| `--text-body` | `16px` | Standard body copy, forms, datagrid text |
| `--text-body-dashboard`| `14px` | Telemetry tables, sidebar items, meta information |
| `--text-caption` | `12px` | Audit log timestamps, helper hints, subtext |
| `--text-small` | `10px` | Badge counters, uppercase labels, micro-states |

### Font Weights
- Regular: `400`
- Medium: `500`
- Semibold: `600`
- Bold: `700`

---

## 📦 3. Spacing & Borders

The layout is strict, relying on a **4px modular grid** to prevent optical friction and keep data densified but highly scannable.

### Spacing System
- `--space-xs`: `4px`
- `--space-sm`: `8px`
- `--space-md`: `12px`
- `--space-base`: `16px`
- `--space-lg`: `20px`
- `--space-xl`: `24px`
- `--space-2xl`: `32px`
- `--space-3xl`: `40px`
- `--space-4xl`: `48px`
- `--space-5xl`: `64px`

### Border Radii
- Badges: `12px` (`--radius-badge`)
- Cards (Desktop): `8px` (`--radius-card`)
- Cards (Mobile/Tablet): `12px` (`--radius-card-mobile`)
- Interactive (Buttons/Inputs): `8px` (`--radius-button`, `--radius-input`)

---

## ✨ 4. Premium Effects & Micro-Interactions

To achieve a **Premium/WOW Factor** UI, use these standard global effects. Do not use plain flat containers.

### A. Ambient Dot Pattern Background (`.bg-dot-pattern`)
Use on page layouts to break visual monotony.
```css
.bg-dot-pattern {
  background-color: #FAFAFA;
  background-image: radial-gradient(circle, #E5E7EB 1px, transparent 1px);
  background-size: 20px 20px;
}
```

### B. Glassmorphism Card Container (`.glass-card`)
Ideal for side-panels, quick overlay dialogs, and high-tech widget highlights.
```css
.glass-card {
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.6);
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.06), 0 1px 3px rgba(0, 0, 0, 0.04);
}
```

### C. The Primary "WOW" Action Button (`.btn-primary`)
Applies a brilliant double-gradient with scale translation and glowing shadows.
```css
.btn-primary {
  background: linear-gradient(135deg, #1E40AF, #3B82F6);
  color: white;
  border: none;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.35);
  transition: transform 0.15s ease, box-shadow 0.15s ease, filter 0.15s ease;
}
.btn-primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(59, 130, 246, 0.45);
  filter: brightness(1.05);
}
.btn-primary:active {
  transform: translateY(0);
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3);
}
```

### D. Hoverable Cards (`.hoverable-card`)
Use on all grid items, dashboard widgets, and worker cards.
```css
.hoverable-card {
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.hoverable-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.1);
}
```

---

## ⚡ 5. Suggesions & Next-Gen Additions (FAMS v2.1 Ready)

To further elevate the design, here are **highly recommended features and styling additions** that can be easily built on top of this foundation:

### 🚀 Recommendation 1: Biometric Face-Ring Scanner Glow
Add an active neon circular outline around the camera view that pulses when a face is detected.
```css
.scanner-ring-active {
  box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.2), 
              0 0 20px rgba(59, 130, 246, 0.6);
  animation: pulse-ring-glow 2s infinite ease-in-out;
}

@keyframes pulse-ring-glow {
  0%, 100% { filter: drop-shadow(0 0 2px rgba(59, 130, 246, 0.5)); }
  50% { filter: drop-shadow(0 0 12px rgba(59, 130, 246, 0.9)); }
}
```

### 🚀 Recommendation 2: Interactive Live Status Pulse Dots (`.pulse-dot`)
Make the real-time live feed dashboard feel "alive" by prepending telemetry event rows with a physical glowing node.
```css
.pulse-dot {
  position: relative;
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.pulse-dot::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: currentColor;
  animation: pulse-ring 1.5s ease-out infinite;
}
@keyframes pulse-ring {
  0% { transform: scale(0.8); opacity: 1; }
  100% { transform: scale(2.5); opacity: 0; }
}
```

### 🚀 Recommendation 3: Sidebar Brand Identity Gradient (`.sidebar-brand-gradient`)
The main menu panel should use a distinctive high-tech brand background or a gradient badge at the top:
```css
.sidebar-brand-gradient {
  background: linear-gradient(135deg, #1E40AF 0%, #3B82F6 50%, #7C3AED 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}
```

### 🚀 Recommendation 4: Smooth Navigation indicator (`.nav-active-pill`)
Add a dynamic colored border/pill behind the active sidebar page element to reinforce spatial orientation:
```css
.nav-active-pill {
  position: relative;
}
.nav-active-pill::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 60%;
  background: linear-gradient(180deg, #3B82F6, #7C3AED);
  border-radius: 0 4px 4px 0;
}
```

---

## 🛠️ 6. Guidelines for the AI Builder

When building any interface for FAMS, abide strictly by these layout guidelines:
1. **Never use native scrollbars** on sub-menus or side sheets. Apply the `.no-scrollbar` styling class.
2. **Always group related stats** into modern grid containers. Light backgrounds should use the `.kpi-gradient-X` styling where:
   - Green (Check-in/Active): `linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%)`
   - Amber (Break): `linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)`
   - Red (Absent/Error): `linear-gradient(135deg, #FEF2F2 0%, #FEE2E2 100%)`
   - Blue (Shift/Metrics): `linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)`
3. **Keep Interactive Elements Responsive**. Interactive cards must have the `.hoverable-card` class, which transitions on transform/shadow smoothly.
4. **Use Skeleton Shimmer Loading States** (`.skeleton`) during API fetches to prevent content layouts from snapping abruptly.

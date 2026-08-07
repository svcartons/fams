Design System
Typography
Font Family
Primary: Inter or Roboto (high readability, industrial aesthetic)
Type Scale
Mobile App:

Display: 32px, Bold (Session headers)
Title: 24px, Semibold (Screen titles)
Heading: 20px, Semibold (Section headers)
Body Large: 18px, Regular (Primary content, worker names)
Body: 16px, Regular (Standard text)
Caption: 14px, Regular (Metadata, timestamps)
Small: 12px, Regular (Labels, helper text)

Dashboard:

Hero: 48px, Bold (KPI numbers)
Display: 36px, Semibold (Page titles)
Title: 28px, Semibold (Card headers)
Heading: 20px, Semibold (Section titles)
Body Large: 16px, Regular (Table content)
Body: 14px, Regular (Standard text)
Caption: 12px, Regular (Metadata)

Font Weights

Regular: 400 (body text)
Medium: 500 (emphasis)
Semibold: 600 (headings)
Bold: 700 (display, numbers)


Color System
Industrial Palette
Primary (Action):

Primary 600: #1E40AF (Blue - main actions)
Primary 500: #3B82F6 (hover state)
Primary 400: #60A5FA (light variant)

Success:

Success 600: #059669 (Green - confirmed, checked in)
Success 500: #10B981
Success 400: #34D399

Warning:

Warning 600: #D97706 (Amber - breaks, alerts)
Warning 500: #F59E0B
Warning 400: #FBBF24

Error:

Error 600: #DC2626 (Red - errors, critical)
Error 500: #EF4444
Error 400: #F87171

Neutral (Gray Scale):

Gray 900: #111827 (Primary text)
Gray 800: #1F2937 (Secondary text)
Gray 700: #374151 (Muted text)
Gray 600: #4B5563 (Disabled text)
Gray 500: #6B7280 (Borders)
Gray 400: #9CA3AF (Dividers)
Gray 300: #D1D5DB (Light borders)
Gray 200: #E5E7EB (Backgrounds)
Gray 100: #F3F4F6 (Light backgrounds)
Gray 50: #F9FAFB (Subtle backgrounds)

Accent (Secondary Actions):

Accent 600: #7C3AED (Purple - lunch breaks)
Accent 500: #8B5CF6
Accent 400: #A78BFA

Background:

White: #FFFFFF
Off-white: #FAFAFA
Dark: #0F172A (optional dark mode)

Color Usage
State Colors:

Checked In: Success 600
On Tea Break: Primary 600
On Lunch Break: Accent 600
Checked Out: Gray 600
Absent: Error 600
Offline: Warning 600

Contrast Requirements:

Text on white: AA minimum (4.5:1)
Interactive elements: AAA preferred (7:1)
Status badges: AA large text (3:1)


Spacing System
Base Unit: 4px
Scale:

xs: 4px
sm: 8px
md: 12px
base: 16px
lg: 20px
xl: 24px
2xl: 32px
3xl: 40px
4xl: 48px
5xl: 64px

Component Spacing:

Card padding: 20px (mobile), 24px (desktop)
Section gap: 24px (mobile), 32px (desktop)
List item gap: 12px
Button padding: 12px 24px (desktop), 16px 32px (mobile)


Component Library
Buttons
Primary Button:

Background: Primary 600
Text: White, 16px, Semibold
Padding: 16px 32px (mobile), 12px 24px (desktop)
Border radius: 8px
Min height: 48px (mobile), 40px (desktop)
States:

Hover: Primary 500
Active: Primary 700
Disabled: Gray 300, text Gray 500
Loading: Spinner + disabled state



Secondary Button:

Background: Transparent
Border: 2px solid Primary 600
Text: Primary 600
Same sizing as primary
States:

Hover: Background Primary 50
Active: Background Primary 100



Destructive Button:

Background: Error 600
Text: White
Same sizing
Use for delete/critical actions

Icon Button:

48x48px touch target
Icon 24x24px
Background on hover: Gray 100

Status Badges
Pill Shape:

Border radius: 12px
Padding: 6px 12px
Font: 14px, Medium
Variations:

Checked In: Success background, white text
On Tea Break: Primary background, white text
On Lunch Break: Accent background, white text
Checked Out: Gray 200 background, Gray 800 text
Absent: Error 100 background, Error 700 text



Dot Indicator:

8px circle
Solid color matching state
Used in compact lists

Cards
Worker Card (Mobile):

Background: White
Border: 1px solid Gray 300
Border radius: 12px
Padding: 16px
Shadow: 0 1px 3px rgba(0,0,0,0.1)
Layout:

Photo: 48px circle (left)
Name: 18px bold
ID: 14px gray
State badge (right)



Summary Card (Dashboard):

Background: White
Border: None
Border radius: 8px
Padding: 24px
Shadow: 0 1px 3px rgba(0,0,0,0.08)
Layout:

Icon: 40px (top left, colored background circle)
Value: 48px bold (primary metric)
Label: 14px gray
Trend: 14px with arrow icon (optional)



Event Card:

Compact: Single row
Timestamp (left, 12px mono)
Icon (event type)
Worker name (16px)
Event badge
Sync indicator (right)

Forms
Text Input:

Height: 48px (mobile), 40px (desktop)
Padding: 12px 16px
Border: 1px solid Gray 400
Border radius: 8px
Font: 16px
States:

Focus: Border Primary 600, 2px
Error: Border Error 600, error message below
Disabled: Background Gray 100



Dropdown:

Same styling as text input
Chevron icon (right)
Dropdown menu:

White background
Shadow: 0 4px 12px rgba(0,0,0,0.15)
Max height: 300px (scrollable)
Item padding: 12px 16px
Hover: Gray 100 background



Search Bar:

Icon prefix (magnifying glass)
Placeholder: "Search workers..."
Clear button appears when typing
Auto-focus on screen load

Tables
Header:

Background: Gray 50
Text: 12px, Semibold, Gray 700, uppercase
Padding: 12px 16px
Border bottom: 2px solid Gray 300
Sortable columns: Arrow icon

Row:

Background: White
Padding: 16px
Border bottom: 1px solid Gray 200
Hover: Gray 50 background
Selected: Primary 50 background

Cell:

Text: 14px, Gray 900
Vertical align: middle
Max width with ellipsis for long text

Mobile Table:

Convert to card layout
Stack columns vertically
Key info prominent (name, ID, state)

Modals/Dialogs
Structure:

Overlay: rgba(0,0,0,0.5)
Modal: White background, centered
Max width: 500px (small), 800px (large)
Border radius: 12px
Padding: 32px
Shadow: 0 20px 40px rgba(0,0,0,0.3)

Header:

Title: 24px, Semibold
Close button (top right)

Body:

Scrollable if content exceeds viewport
Max height: 60vh

Footer:

Buttons right-aligned
Primary action (right), Secondary (left)
Gap: 12px

Camera Overlay (Face Scan)
Face Frame:

Rounded rectangle outline
Default: Dashed, Gray 400, 3px
Detecting: Solid, Primary 600, 3px, pulsing animation
Matched: Solid, Success 600, 3px
Error: Solid, Error 600, 3px

Positioning Guide:

Semi-transparent overlay
Centered frame with guide text
"Align face here" with arrow indicators

Result Card (Bottom Sheet):

Background: White
Border radius: 20px 20px 0 0
Shadow: 0 -4px 12px rgba(0,0,0,0.1)
Slide up animation (300ms ease-out)
Swipe down to dismiss (optional)

Loading States
Spinner:

Size: 24px (inline), 48px (full screen)
Color: Primary 600
Animation: Smooth rotation

Skeleton:

Background: Gray 200
Shimmer animation
Matches content layout

Progress Bar:

Height: 4px
Background: Gray 200
Fill: Primary 600
Indeterminate animation for unknown duration

Empty States
Structure:

Icon: 64px, Gray 400
Heading: 20px, Semibold, Gray 700
Description: 14px, Gray 600
Action button (optional)

Examples:

"No workers checked in yet"
"No events found"
"All synced ✓"

Notifications/Toasts
Toast:

Position: Top center (mobile), Bottom right (desktop)
Width: 90% (mobile), 400px (desktop)
Background: Gray 900 (default), Success 600 (success), Error 600 (error)
Text: White, 14px
Padding: 16px
Border radius: 8px
Shadow: 0 4px 12px rgba(0,0,0,0.2)
Auto-dismiss: 3 seconds
Close button (optional)

Alert Banner:

Full width
Background: Warning 100 (warning), Error 100 (error), Primary 100 (info)
Text: Matching color (Warning 900, etc.)
Icon (left)
Message (center)
Action button (right, optional)
Dismiss button (right)

Icons
Style: Outlined (stroke-based), 2px stroke
Library: Heroicons, Lucide, or Material Icons Outlined
Sizes:

16px (inline with text)
24px (buttons, navigation)
32px (section headers)
48px (empty states)

Common Icons:

Check In: Login arrow
Check Out: Logout arrow
Tea Break: Coffee cup
Lunch Break: Utensils
Face Scan: Camera/face outline
Manual: Edit/pencil
Sync: Refresh arrows
Alert: Exclamation triangle
Success: Checkmark circle
Error: X circle


Responsive Breakpoints
Mobile: < 640px
Tablet: 640px - 1024px
Desktop: > 1024px
Mobile-First Approach:

Design for mobile first
Progressive enhancement for larger screens
Touch targets never smaller than 48x48px
Swipe gestures supported (bottom sheets, sidebars)


Animation Principles
Philosophy: Functional, not decorative
Durations:

Micro (instant feedback): 100ms
Small (transitions): 200-300ms
Medium (modals, sheets): 300-400ms
Large (page transitions): 400-500ms

Easing:

Ease-out: Elements entering (slide-up, fade-in)
Ease-in: Elements exiting (slide-down, fade-out)
Ease-in-out: State changes (button press)

Examples:

Face detected → recognition card slide-up: 300ms ease-out
Action button press: 100ms scale (0.95) ease-in-out
Success checkmark: 400ms fade-in + scale
Toast notification: 200ms slide-down from top

Reduce Motion:

Respect prefers-reduced-motion
Fallback to instant state changes or simple fades


Accessibility
Contrast:

Text AA: 4.5:1 minimum
Large text AA: 3:1 minimum
Interactive elements AAA: 7:1 preferred

Touch Targets:

Minimum: 48x48dp
Preferred: 56x56dp for primary actions
Spacing between targets: 8px minimum

Screen Readers:

All images have alt text
Form inputs have labels
Buttons have descriptive text (not "Click here")
Status messages announced (ARIA live regions)

Keyboard Navigation:

All interactive elements tabbable
Focus indicators (2px outline, Primary 600)
Logical tab order
Escape closes modals

Labels & Instructions:

Clear, concise language
Avoid jargon
Error messages: explain problem + solution
Success messages: confirm action taken


State Patterns
Success States

Visual: Green checkmark icon, Success background
Message: "Worker checked in successfully"
Duration: 2 seconds, then auto-clear
Sound: Optional success chime (if device volume on)

Warning States

Visual: Amber exclamation icon, Warning background
Message: "Low confidence (87%) • Verify worker identity"
Action: Require confirmation before proceeding
Persist: Until user acknowledges

Error States

Visual: Red X icon, Error background
Message: "Face not recognized • Try again or select manually"
Action: Retry button, Manual select button
Persist: Until user takes action

Loading States

Visual: Spinner or progress bar
Message: "Recognizing..." / "Saving..." / "Syncing..."
Blocking: Disable other actions during process

Offline States

Visual: Amber badge, cloud-off icon
Message: "Offline • Events will sync when connected"
Behavior: Queue events locally
Indicator: Persistent banner or status icon

Syncing States

Visual: Rotating sync icon, Primary color
Message: "Syncing 3 events..."
Progress: Show count of pending/synced

Empty States

Visual: Large gray icon, centered
Message: "No workers checked in"
Subtext: "Scan a worker to begin"
Action: Optional CTA button


# VidyaAI — UI Redesign & End-to-End Connectivity Plan

Constraint: local changes only. Do not commit or push to GitHub.
Frontend: `apps/frontend` (Next.js 16, Tailwind 4, framer-motion). Backend: `apps/backend`.
Baseline: `docs/roadmap-90d.md` (Epic 2 grader→grading cutover, Epic 4 teacher IA cleanup, Epic 1 OBE server persistence).

## Step 1. Switch the typeface to Geist (DONE)
Replace Inter, Cabinet Grotesk, Playfair, Priestacy and hardcoded font stacks with Geist Sans and Geist Mono via next/font, across all pages.
Acceptance: no remaining non-Geist font stacks in `src/`; `tsc --noEmit` clean.

## Step 2. Change the design tokens and typography foundation
Change `globals.css` tokens so every page inherits one consistent scale: type scale with tight tracking on headings, `text-wrap: balance` on headings, `tabular-nums` on numeric UI, concentric radii, layered shadows instead of borders, and shared motion tokens (ease-out curves, 150–250ms durations).
Acceptance: tokens live in one place; headings and numbers render consistently; reduced-motion respected.

## Step 3. Refactor and consolidate the component library
Refactor the duplicated `src/components/ui` and `src/design-system` primitives (Button, Card, Input, Badge, Dialog, Select, Table, Tabs, EmptyState, LoadingState) into one canonical set with press feedback (scale 0.96), visible focus rings, 40px minimum hit areas, and skeleton loading states.
Acceptance: pages import from one primitive set; no behavior change; lint and tests pass.

## Step 4. Change the app shell and layout per Apple HIG
Change `AppShell`, sidebar and topbar to follow Apple HIG: clear hierarchy, consistent 8pt spacing, safe-area support, responsive collapse on mobile, breadcrumbs, consistent page headers, and one canonical teacher route tree (Plan → Assess → Grade → Insights) with redirects from legacy paths.
Acceptance: every dashboard uses the same shell and PageHeader; mobile width works without horizontal scroll.

## Step 5. Add animation and micro-interactions
Implement enter/exit transitions, staggered list reveals, interruptible spring transitions, animated route changes and toasts with framer-motion; animate only transform and opacity; skip animation on keyboard-driven and high-frequency actions.
Acceptance: no layout-shifting animations; `prefers-reduced-motion` disables motion; 60fps on dashboard and assessment pages.

## Step 6. Change page layouts for the key flows
Change layouts and use better components on login/register, student/faculty/admin dashboards, assessments, grading and OBE pages: cards with consistent density, data tables with sticky headers, real empty/error/loading states.
Acceptance: each listed flow has loading, empty and error states; no inline-style page shells remain on these pages.

## Step 7. Change frontend–backend connectivity end to end
Change pages that use mock data or localStorage drafts (`teacher/obe`, `student/attendance`, `dashboard/parent`, `research`, `student/discussions`, `assignments/[id]`) to call real backend APIs through `src/services` with typed responses, and migrate remaining `/grader` calls to `/grading` per roadmap Epic 2.
Acceptance: no mock data on those pages; grading calls only hit `/grading`; auth refresh and errors surfaced via toasts.

## Step 8. Add end-to-end tests for the redesigned flows
Add Playwright tests for login, dashboard load, assessment create and grading.
Acceptance: tests pass locally.

## Step 9. Update docs
Update README and design-system docs to describe Geist, tokens and components.

## Step 10. Review the changes
Review the full diff for correctness, accessibility and security before any commit.

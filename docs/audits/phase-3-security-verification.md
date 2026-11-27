<!--
Supersedes: nothing (new Phase 3 audit deliverable; no prior file in docs/audits/).
Linked from: Phase 3 plan Stage F; docs/security.md Redis note cross-ref.
User instruction (verbatim): "Implement the plan as specified... Don't stop until you have completed all the to-dos." Plan: write docs/audits/phase-3-security-verification.md with all 14 required sections.
-->

# VidyaAI Phase 3 — Security Verification Report

**Date:** 2026-11-27  
**HEAD (unchanged):** `72392bee3e9d05aa25a8da2d69221217ae7a351a`  
**Branch:** `feat/geist-ui-redesign-and-connectivity`  
**Stash:** `stash@{0}` present — not touched  
**Commits/pushes this phase:** none  

### Stage A — Confirmed issue list (frozen)

| ID | Severity | Issue | Status |
|----|----------|-------|--------|
| P1 | High | Org ADMIN peer ADMIN invite/create/suspend/reset/delete | Fixed |
| P2 | High | Org-less community join/chat/invite cross-tenant | Fixed |
| P3 | High | Teacher papers org-wide list/delete/archive | Fixed |
| P4 | High | Student `/research` palette → ACL deny | Fixed |
| P5 | Medium | College/dept collected then discarded | Fixed |
| P6 | Medium | Passwordless OTP tab, no backend | Fixed |
| P7 | Medium | Signup duplicate HTTP 409 enumeration | Fixed |
| P8 | Medium | Rate-limit/lockout Redis fail modes | Fixed |
| P9 | Medium | Missing `/accept-invite` page | Fixed |
| P10 | Medium | CSV shared `Welcome@123` | Fixed |
| P11 | Medium | Student paper GET without enrollment | Fixed |
| P12 | Low | Webhook CSRF skip / trust proxy | Documented |
| P13 | Low | Stale CommandPalette `/dashboard/*` refs | Fixed |

---

## 1. Executive summary

Phase 3 completed an independent audit of HEAD `72392be` plus Phase 1/2 working-tree security work, then implemented the locked product decisions: SUPER_ADMIN-only ADMIN management, org-less community fail-closed, teacher paper owner-scope, student research hidden, OTP UI removed, onboarding prefs-only (no org join-by-name), signup anti-enumeration, CSV temporary passwords, rate-limit hardening, and accept-invite page. Automated security suite: **190/190 passed**. Backend lint clean; Prisma validate + generate OK; backend/frontend `tsc --noEmit` OK. No git commit/push/reset/stash ops. No known Critical/High authorization issues remain on the audited paths.

---

## 2. Architecture and authentication flow

- Auth is mounted via `apps/backend/src/api/auth` (legacy `routes/auth.routes.ts` deleted in WT). Controllers: signup, login, Google OAuth, refresh, accept-invite, password reset.
- Access JWT + refresh cookie sessions; `auth.middleware.ts` loads DB user and gates `forcePasswordReset`.
- Tenant helpers: `security/tenant-scope.ts`, `account-status.ts`, `assignment-access.ts`, `services/admin/admin-scope.ts`.
- Frontend: `auth.store.ts`, `ForcePasswordResetGate`, public routes include `/accept-invite`.
- Evidence: `api/auth/controller.ts`, `middlewares/auth.middleware.ts`, `sockets/socket-auth.ts`.

---

## 3. Role and permission matrix

| Capability | SUPER_ADMIN | ADMIN | TEACHER/FACULTY | STUDENT |
|------------|:-----------:|:-----:|:---------------:|:-------:|
| Manage ADMIN peers | Yes | No | No | No |
| Invite TEACHER/STUDENT | Yes | Yes | No | No |
| Org-wide paper admin ops | Yes | Yes | No | No |
| Own papers list/mutate | Yes | Yes | Owner only | Enrolled published |
| Library/research staff routes | Yes | Yes | Teacher library | No |
| Create org-less community group | Yes | No | No | No |
| Join group without org match | Existing member only | Same | Same | Same |

Evidence: `user.service.ts` `resolveAssignableRole({ allowOrgAdmin: false })`, `findManageableUser`; `library.routes.ts` unchanged (STUDENT still denied).

---

## 4. Organization and tenant isolation

- **Fixed (P2):** `community.service.ts` — `joinGroup` / `checkGroupAccess` / `inviteToGroup` require matching `organizationId` or existing membership; null org never means “same tenant.” Org-less create blocked for non–SUPER_ADMIN.
- **Fixed (P3/P11):** `question-paper/controller.ts` — teachers filtered by `createdById`; admins org-scoped; students need enrollment helper before content.
- Admin analytics/papers/users remain org-scoped; org-less ADMIN fails closed (existing tests).
- Remaining risk: any route not covered by security tests should be reviewed before new features.

---

## 5. Login, signup, OAuth, and account linking

| Finding | Sev | Status | Evidence | Tests |
|---------|-----|--------|----------|-------|
| Signup duplicate enumeration (P7) | Med | Fixed | `signup` returns 201 + `{accessToken:null,user:null}` for duplicate/P2002; logs conflict | `auth-signup-hardening.test.ts` |
| CSV predictable password (P10) | Med | Fixed | `csv-import.service.ts` `generateTemporaryPassword` + `forcePasswordReset` | `csv-import-roles.test.ts` |
| OTP UI without backend (P6) | Med | Fixed | `login/page.tsx` password + Google only; stubs remain | `auth-otp.test.ts` |
| Google linking / CSRF / suspended | — | Verified | Existing Phase 2 coverage | `auth.test.ts`, `auth-hardening.test.ts`, `csrf-length.test.ts` |
| Accept invite page (P9) | Med | Fixed | `app/accept-invite/page.tsx` → `POST /auth/accept-invite` | Manual path only (no browser E2E this run) |

---

## 6. Onboarding and organization membership

- **Decision locked:** persist `college`, `department`, `academicYear` under `preferences.onboarding` only; never assign `organizationId` from college name; invite/CSV are the only join paths.
- Evidence: `onboarding/page.tsx`, `auth.store.ts` profile extras; `PUT /me/organization` remains admin-only.
- Status: Fixed (P5). Remaining risk: preferences are advisory UX, not membership proofs.

---

## 7. Student, teacher, admin, and super-admin feature access

- Student research palette entry removed (P4); staff keep `/teacher/library`, `/admin/research`.
- Teacher papers owner-scoped (P3); peer-teacher deny covered in tests.
- Org ADMIN cannot manage peer ADMINs (P1); SUPER_ADMIN can.
- Force-password gate still runs before dashboard API storms.
- Evidence: `CommandPalette.tsx`, `question-paper/controller.ts`, `user.service.ts`, `ForcePasswordResetGate.tsx`.

---

## 8. Backend authorization and API audit

| Area | Status | Evidence |
|------|--------|----------|
| Admin peer least privilege | Fixed | `user.service.ts`, `admin.controller.ts`, `api/users/controller.ts` |
| Community org-less | Fixed | `community.service.ts` |
| Paper list/get/delete scope | Fixed | `api/question-paper/controller.ts` |
| Rate limiters fail-closed | Fixed | `rate-limit.middleware.ts` → 503 |
| Lockout atomic Lua | Fixed | `api/auth/lockout.ts` |
| App ERL store | Fixed | `app.ts` + `ResilientRedisStore` |
| CSRF webhook skip | Documented | `app.ts` — no unsigned handlers |

Regression: `admin-scope.test.ts`, `tenant-community-voice-chat.test.ts`, `tenant-owner-scoping.test.ts`, `lockout-bounds.test.ts`.

---

## 9. Frontend navigation and route audit

- CommandPalette: removed student `/research`; legacy `/dashboard/*` → canonical `ROUTES` (P13).
- Login: OTP/Passwordless tab removed.
- Accept-invite public page added; AppShell public lists updated.
- Deleted dashboard trees left deleted; `next.config.ts` redirects remain — no restore of ~67 files.
- Status: Fixed. Not browser-E2E verified this run.

---

## 10. Database schema and migration assessment

- `npx prisma validate` — valid.
- `npx prisma generate` — client generated (v7.8.0).
- **No** `migrate deploy` against production (explicit non-goal).
- Phase 3 changes are application-layer; no new Prisma migration required for prefs JSON / forcePasswordReset (existing fields).
- Remaining risk: production must already have Phase 1/2 schema; operators run migrate via documented workspace script when ready.

---

## 11. Rate limiting, Redis, trust proxy, and webhook security

| Item | Sev | Status | Evidence |
|------|-----|--------|----------|
| Global/AI limiter Redis errors → 503 | Med | Fixed | `rate-limit.middleware.ts` |
| App ERL `ResilientRedisStore` | Med | Fixed | `app.ts` |
| Lock engage Lua INCR+SET; clear lock keys | Med | Fixed | `lockout.ts` |
| `isLoginLocked` availability-first on Redis error | Med | Documented | `lockout.ts` + `docs/security.md` §4 |
| `trust proxy = 1` | Low | Documented | `app.ts` — Render one hop |
| Webhook CSRF skip | Low | Documented | No handlers; do not add unsigned webhooks |

**Not verified:** live multi-instance Redis outage behavior (infra). Automated unit tests cover Lua mock + memory bounds.

---

## 12. Tests executed and their actual results

| Suite / check | Result |
|---------------|--------|
| `vitest run src/__tests__/security` | **14 files, 190 passed** |
| `npm run lint --workspace=apps/backend` | Pass (after removing unused signup const) |
| `npm run lint --workspace=apps/frontend` | Pass |
| `npx prisma validate` + `generate` (backend) | Pass |
| `npx tsc --noEmit -p apps/backend` | Pass |
| `npx tsc --noEmit -p apps/frontend` | Pass |
| Root `npm run build` | **Pass** (backend `prisma generate` + `tsc`; frontend `next build`) |
| Frontend `auth-otp` + config/route unit tests | **9 passed** (3 files) |
| Browser / Playwright E2E | **Not run** (env not claimed) |
| Live Redis multi-instance | **Not run** |

### Verification-method table

| Method | Items |
|--------|-------|
| Verified by automated tests | P1–P3, P7–P8, P10–P11; Phase 2 auth/CSRF/tenant matrices; lockout Lua mock; frontend OTP stubs |
| Verified through real infrastructure | None claimed |
| Verified through browser/E2E | None claimed |
| Not verified | Accept-invite UX click-path; multi-instance Redis degraded budget; production migrate deploy |

---

## 13. Remaining limitations, product decisions, and production deployment requirements

**Product decisions (locked):**
1. Preferences-only college/dept — no MembershipRequest / join-by-name.
2. OTP backend not implemented — UI hidden.
3. Teacher papers owner-only; no share model.
4. Student research unsupported — hidden, library RBAC unchanged.
5. Only SUPER_ADMIN manages ADMIN accounts.
6. Redis lock-read availability-first; global/AI fail-closed 503.
7. Dashboard deletions stay deleted.

**Production requirements:**
- Deploy with Redis available for shared lockout/rate limits; expect per-instance degraded lockout if Redis down.
- Keep single reverse-proxy hop or revisit `trust proxy`.
- Do not add unsigned `/api/webhook` handlers.
- Join campus only via invite/CSV after deploy.
- Run CI gates (`lint`, prisma validate/generate, build, test) before merge; migrate via `npm run migrate:deploy --workspace=apps/backend` when operators approve.

---

## 14. Final Git status and change summary

- **HEAD:** `72392bee3e9d05aa25a8da2d69221217ae7a351a` (unchanged).
- **No commits, pushes, resets, cleans, or stash pops** in Phase 3.
- Working tree retains Phase 1/2 + Phase 3 additive edits (security modules, tests, FE pages, report).
- Notable Phase 3 files: `user.service.ts`, `community.service.ts`, `question-paper/controller.ts`, `lockout.ts`, `resilient-store.ts`, `rate-limit.middleware.ts`, `app.ts`, `csv-import.service.ts`, `api/auth/controller.ts`, `login/page.tsx`, `onboarding/page.tsx`, `CommandPalette.tsx`, `accept-invite/page.tsx`, security tests under `apps/backend/src/__tests__/security/`, this report, `docs/security.md` Redis note.

---

*End of Phase 3 verification report.*

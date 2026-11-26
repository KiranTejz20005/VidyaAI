# VidyaAI — 90-Day Post–Phase 8–9 Roadmap

**Scope:** Work immediately following completion of Phase 8 (assessment pipeline hardening) and Phase 9 (grading API modularization).  
**Architecture constraint:** Remain a **modular monolith** — bounded contexts under `apps/backend/src/api/*` and shared services; no new deployable services unless a hard scale boundary is proven.

## Starting assumptions (Phase 8–9 exit)

| Area | Expected end state |
|------|-------------------|
| Grading | `apps/backend/src/api/grading` exposes RBAC-aligned REST; legacy `grader.controller` still mounted for compatibility |
| Jobs | BullMQ `assessment` queue orchestrates single and bulk evaluation |
| OBE schema | `Course`, `Program`, `CourseOutcome`, `ProgramOutcome`, `Blueprint`, CO–PO mappings exist in Prisma |
| QP analysis | Handwritten/question-paper analysis pipeline and API routes are present; production UX may be partial |

---

## Epic 1 — OBE product-data completion

**Goal:** Make OBE entities authoritative end-to-end so accreditation, blueprint generation, and assignment linkage use one consistent graph per organization.

| Window | Milestones |
|--------|------------|
| **Day 0–30** | CRUD + list APIs for Program, Course, outcomes, CO–PO mappings; org-scoped serializers and OpenAPI stubs; seed/import path for pilot orgs |
| **Day 31–60** | Blueprint builder reads live OBE graph; assignment ↔ course/outcome linkage enforced at create/update; admin validation (orphan COs, duplicate codes) |
| **Day 61–90** | Accreditation-style exports (CO coverage, attainment snapshots); dashboard widgets for HOD/admin; deprecate client-only OBE drafts |

**Risks:** Partial migrations from local state; conflicting codes across departments. **Mitigation:** unique constraints per org, migration scripts, feature flag `obe.serverPersistence`.

**Success metrics:** 100% of new assignments tied to a `courseId`; ≥95% of pilot org OBE rows served from API (not localStorage); zero cross-tenant leakage in OBE integration tests.

---

## Epic 2 — Single grading surface (deprecate `/grader` HTTP)

**Goal:** One teacher-facing grading experience backed solely by `/api/grading`; remove duplicate HTTP paths after client cutover.

| Window | Milestones |
|--------|------------|
| **Day 0–30** | Audit all `/grader` and `/v1/grader` callers (frontend services, mobile, scripts); parity matrix vs `/grading` routes |
| **Day 31–60** | Migrate `grading.service`, bulk review UI, and submission flows to `/grading`; internal redirects or thin proxies on legacy paths with `Deprecation` header |
| **Day 61–90** | Remove legacy route registration from `routes/index.ts`; delete or archive `grader.routes`; ADR 001 enforced in CI grep gate |

**Risks:** Subtle DTO differences break bulk review; external integrators on old paths. **Mitigation:** shadow logging on legacy routes during 31–60; documented migration guide in `docs/api-reference.md`.

**Success metrics:** 0 production frontend calls to `/grader/*` for 14 consecutive days; grading e2e suite green on `/grading` only; p95 bulk-evaluate enqueue latency unchanged (±10%).

---

## Epic 3 — Assessment job platform (`BulkAssessmentJob`, cancel/retry, DLQ)

**Goal:** Replace interim bulk metadata hacks with first-class job records, operator controls, and dead-letter handling.

| Window | Milestones |
|--------|------------|
| **Day 0–30** | Worker + queue write/read `BulkAssessmentJob` for all bulk runs; stop new `BULK_META:` writes in `GenerationJob.error` |
| **Day 31–60** | APIs: job status, cancel (`cancelRequested`), per-submission retry; admin DLQ view aligned with system health dashboard |
| **Day 61–90** | Backfill/migrate in-flight jobs; Redis + DB reconciliation job; alerting on stuck `PENDING` / high `failed` ratio |

**Risks:** Double evaluation on retry; race on cancel. **Mitigation:** idempotent `evaluateSubmission` keys, optimistic locking on job row, coordinator fan-out respects `cancelRequested`.

**Success metrics:** 100% bulk runs persisted in `BulkAssessmentJob`; cancel honored within 60s p95; DLQ items reprocessed or triaged within 24h SLA for pilot.

---

## Epic 4 — Teacher IA cleanup

**Goal:** Consolidate navigation, routes, and naming so teachers have one mental model: **Plan → Assess → Grade → Insights** (OBE and copilot as peers, not duplicates).

| Window | Milestones |
|--------|------------|
| **Day 0–30** | IA inventory: duplicate trees under `/dashboard/teacher` vs `/teacher`; shared layout and breadcrumbs |
| **Day 31–60** | Canonical routes under `/teacher/*`; redirects from legacy paths; unified assessments hub (list, submissions, grading config) |
| **Day 61–90** | Remove dead components; align permissions copy with `PERMISSIONS.GRADE_ASSESSMENT`; mobile-width pass on bulk review |

**Risks:** Bookmark breakage; role-specific edge cases (FACULTY vs TEACHER). **Mitigation:** 301/redirect map for 90 days; telemetry on hit counts for legacy URLs.

**Success metrics:** ≤1 primary path to grade a submission; support tickets mentioning “can’t find grading” reduced vs baseline; Lighthouse accessibility score ≥90 on teacher assessment flows.

---

## Epic 5 — QP handwritten analysis UX + CI E2E gate

**Goal:** Ship a complete upload → analyze → review loop for scanned/handwritten question papers, guarded by CI.

| Window | Milestones |
|--------|------------|
| **Day 0–30** | Teacher UI: upload, job progress, structured question list + confidence; wire to `question-paper` analysis APIs |
| **Day 31–60** | Edit/confirm flow before rubric or grading config; storage keys under `question-paper-analysis/*` with RBAC |
| **Day 61–90** | Playwright E2E in CI (fixture PDF/image, mock or staging AI); required check on PRs to `staging`/`main` |

**Risks:** Flaky OCR/LLM in CI; cost of real inference in pipeline. **Mitigation:** recorded fixtures + stub provider in `NODE_ENV=test`; nightly full inference job optional.

**Success metrics:** E2E job mandatory and &lt;12 min in CI; teacher task completion (upload → confirmed structure) &lt;5 min median in usability pilot; analysis job failure rate &lt;5% excl. user-cancelled.

---

## Cross-cutting concerns

- **Security:** All new endpoints use `authenticate`, `requireOrganizationScope`, and permission middleware consistent with grading.
- **Observability:** Correlate HTTP job IDs with BullMQ job ID and `BulkAssessmentJob.id` in structured logs.
- **Docs:** Keep `docs/api-reference.md`, ADRs, and OpenAPI under `api/grading` and OBE modules in sync each epic.

## Program-level success (Day 90)

| Metric | Target |
|--------|--------|
| Modular monolith deploy units | Still 2 (frontend + backend/workers) |
| Legacy `/grader` HTTP | Removed |
| Bulk grading | `BulkAssessmentJob` only |
| OBE | Server source of truth (see ADR 002) |
| CI | Grading + QP analysis E2E required checks |

## Out of scope (this window)

- Splitting grading or OBE into separate microservices  
- Full WebSocket grading stream (retained for a follow-on window)  
- Multi-region active-active
# ADR 001: Canonical Grading API (`/grading`); Deprecate Legacy `/grader`

| Field | Value |
|-------|--------|
| **Status** | Accepted |
| **Context** | Post Phase 8–9 assessment pipeline |

## Context

VidyaAI evolved two HTTP surfaces for the same domain:

- **Canonical:** `apps/backend/src/api/grading` — mounted at `/api/grading`, with validators, DTOs, OpenAPI, RBAC (`PERMISSIONS.GRADE_ASSESSMENT`), and org scope.
- **Legacy:** `grader.controller` + `grader.routes` — mounted at `/api/v1/grader`, historically used by the frontend (`api.get('/grader/...')`) and bulk flows.

Both paths delegate to `grader.service` and the same BullMQ `assessment` queue for async evaluation. This duplication increases drift risk (response shapes, auth, bulk job IDs) and complicates observability.

## Decision

1. **`/api/grading` is the sole supported grading HTTP API** for new clients and all first-party UI.
2. **Legacy `/api/v1/grader` (and any `/grader` proxy paths)** are deprecated after client cutover per the 90-day roadmap (Epic 2).
3. **Shared implementation stays in services**, not routes: `grader.service` (or a renamed `grading.domain.service`) remains the single evaluation engine; only the HTTP adapters consolidate under `api/grading`.
4. **Removal criteria:** No production traffic to legacy routes for 14 days; parity tests pass; `docs/api-reference.md` documents only `/grading`.

## Consequences

### Positive

- One OpenAPI surface for integrators and internal tools.
- Consistent permission and organization middleware on every grading operation.
- Simpler CI contract tests and E2E (single base path).

### Negative / trade-offs

- Short-term proxy or dual-mount period for backward compatibility.
- External scripts using `/v1/grader` require a migration notice.

### Compliance

- **Modular monolith preserved:** No new service; boundary is the `api/grading` module.
- **Students:** Read-only evaluation endpoints remain role-gated on `/grading` as today.

## Alternatives considered

| Alternative | Why rejected |
|-------------|--------------|
| Keep both APIs indefinitely | Permanent DTO and auth drift |
| Extract grading microservice | Premature; queue and DB coupling remain |
| Rename only paths, keep two controllers | Does not reduce maintenance cost |

## Implementation notes

- Frontend: prefer `apps/frontend/src/services/grading.service.ts` calling `/grading/*`.
- Bulk evaluate: `POST /grading/bulk-evaluate/:assignmentId` and job status on `/grading/bulk-jobs/:jobId` (align naming in OpenAPI during cutover).
- Deprecation headers: `Deprecation: true` and `Link: </api/grading/...>; rel="successor-version"` on legacy responses during the transition window.

## References

- `apps/backend/src/api/grading/routes.ts`
- `apps/backend/src/routes/index.ts` (legacy mount)
- `docs/roadmap-90d.md` — Epic 2
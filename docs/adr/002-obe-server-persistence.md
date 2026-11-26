# ADR 002: OBE Server-Side Source of Truth

| Field | Value |
|-------|--------|
| **Status** | Accepted |
| **Context** | Post Phase 8–9; OBE schema (Phase 20 models) in production |

## Context

Outcome-Based Education (OBE) data in VidyaAI includes programs, courses, course outcomes (COs), program outcomes (POs), CO–PO mappings, and blueprints (`Course`, `Program`, `CourseOutcome`, `ProgramOutcome`, `Blueprint`, etc. in Prisma).

Product flows (paper generation, copilot analysis, assignment linkage, accreditation views) need a **single authoritative graph per organization**. Client-side drafts, duplicated state in UI stores, or mock responses (e.g. copilot OBE analyze stubs) create:

- Stale CO coverage when teachers edit locally.
- Assignments detached from accredited outcomes.
- Inconsistent reports for HOD and accreditation audits.

## Decision

1. **PostgreSQL (via Prisma) is the system of record** for all OBE entities and relationships, scoped by `organizationId`.
2. **All create/update/delete operations** go through authenticated backend APIs; the frontend may cache optimistically (TanStack Query) but must not treat local persistence as authoritative.
3. **Blueprints and assignments** reference server IDs (`courseId`, outcome IDs, blueprint items); client-generated temporary IDs are not accepted on final save.
4. **Copilot and AI features** read OBE context from the server (or an RAG snapshot derived from server state), not from unsubmitted form state.
5. **Imports** (CSV/seed) are idempotent server-side jobs with validation, not bulk client writes.

## Consequences

### Positive

- Accurate CO–PO matrices and attainment reporting.
- Multi-device and multi-user consistency for departmental planning.
- Clear audit trail (`createdAt` / `updatedAt`, future actor logging).

### Negative / trade-offs

- Offline editing not supported without explicit sync protocol (out of scope).
- Migration effort for orgs that started with local-only pilots.
- Stricter validation may block incomplete graphs until admin fixes data.

### Data rules

| Rule | Enforcement |
|------|-------------|
| Unique course/program codes per org | DB `@@unique([code, organizationId])` |
| CO belongs to one course | FK + API validation |
| Assignment ↔ course | Required on new assignments (rollout via feature flag) |
| Tenant isolation | `requireOrganizationScope` on all OBE routes |

## Alternatives considered

| Alternative | Why rejected |
|-------------|--------------|
| Browser localStorage as primary store | No sharing, no audit, breaks multi-tenant RBAC |
| Eventual sync from client “master” | Conflict resolution complexity for accreditation data |
| Separate OBE micro-database | Violates modular monolith; joins with assignments suffer |

## Implementation notes

- Expose REST modules under `apps/backend/src/api/` (or existing OBE controllers) with serializers matching Prisma models.
- Frontend: single query layer for OBE lists; invalidate on mutation.
- Phase rollout: `obe.serverPersistence` flag — read-only server first, then required writes, then disable local fallback.
- Copilot `analyzeOBE` should load entities from DB before LLM prompt construction.

## References

- `apps/backend/prisma/schema.prisma` — OBE & Accreditation models
- `docs/roadmap-90d.md` — Epic 1
- `apps/backend/src/controllers/copilot.controller.ts` — migrate off mock OBE reports
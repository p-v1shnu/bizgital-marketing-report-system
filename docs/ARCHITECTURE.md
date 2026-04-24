# BIZGITAL Marketing Report Architecture

## 1. Architecture Goals

- keep business logic out of the frontend whenever possible
- make debugging and testing straightforward
- support growth without recreating legacy ambiguity
- preserve strong boundaries between mutable write flows and dashboard read flows

Locked stack:

- Backend: NestJS
- Frontend: Next.js
- Database: MySQL
- Deployment: Docker-first

## 2. Proposed System Shape

### Frontend

Next.js application responsible for:

- authenticated shell and navigation
- desktop-first report workspace UX
- data grid and chart presentation
- local interaction state
- file upload initiation and progress

Frontend should not own:

- formula execution
- source-of-truth validation
- approval transitions
- canonical aggregation logic

### Backend

NestJS application responsible for:

- domain logic and state transitions
- import parsing orchestration
- mapping validation
- metric calculation
- approval rules
- audit logging
- dashboard read-model generation

### Storage

- MySQL for relational data and read models
- object storage for uploaded files and images
- optional queue for async import processing and read-model rebuilds

### Deployment baseline

- Docker Compose for local development and reproducible environments
- separate containers for `frontend`, `backend`, `mysql`, and optional `worker`
- environment-based configuration for storage, queue, and app secrets
- production deployment should remain container-friendly from the start
- Caddy is the intended reverse proxy in the target server environment
- application containers should be designed to sit behind Caddy rather than embedding their own public TLS setup

## 3. Backend Module Architecture

### `IdentityAccessModule`

Responsibilities:

- authentication
- user profiles
- roles and permissions
- brand membership authorization

### `BrandModule`

Responsibilities:

- brand CRUD
- brand settings
- brand-level defaults and presets

### `KpiPlanningModule`

Responsibilities:

- KPI master definitions
- stable metric definitions and aliases
- yearly brand KPI plans
- campaign KPI configuration
- plan validation and approval if needed later

### `ReportingPeriodModule`

Responsibilities:

- create or fetch reporting periods
- manage report version lifecycle
- coordinate draft, submit, approve, reject transitions
- prepare for future cadence support across monthly, quarterly, and yearly periods

### `ImportModule`

Responsibilities:

- file upload registration
- workbook profiling
- sheet preview
- staging import metadata

### `MappingModule`

Responsibilities:

- column catalog exposure
- column mapping persistence
- visible column presets
- mapping validation
- source-label to metric-alias resolution during import

### `DatasetModule`

Responsibilities:

- materialize mapped dataset columns and rows
- manage manual rows
- manage editable dataset values
- expose dataset grid APIs

### `CalculationModule`

Responsibilities:

- metric definitions and formulas
- execute calculations on demand or after changes
- persist metric snapshots
- preserve calculation trace and provenance

### `EvidenceModule`

Responsibilities:

- top content highlights and supporting screenshots
- competitor evidence
- question evidence
- media metadata

### `TopContentModule`

Responsibilities:

- compute top-ranked posts by configured ranking groups
- materialize top content card records from dataset rows
- expose why each item was selected

### `ApprovalModule`

Responsibilities:

- submission requests
- approval decisions
- rejection comments
- revision creation from rejected or approved versions
- locking rules for submitted and approved versions

### `DashboardModule`

Responsibilities:

- read-model queries
- goal-vs-actual composition
- approved-report dashboard APIs
- multi-cadence aggregation paths for future quarter and year outputs
- cross-year metric labeling rules based on canonical metric identity plus alias history

### `CadenceCompositionModule` future

Responsibilities:

- compose quarterly reports from approved monthly periods
- compose yearly reports from approved monthly or quarterly periods
- merge cadence-specific manual inputs with aggregated source data

### `AuditModule`

Responsibilities:

- append-only activity logs
- version history
- audit queries

## 4. API Design Principles

- expose task-oriented APIs, not table-shaped APIs
- keep write endpoints centered on report version and brand boundaries
- separate write models from dashboard read models
- return validation structure that points to exact UI targets
- keep cadence-aware logic in backend services so future quarter and year flows do not duplicate frontend logic

## 5. Example API Surface

### Brand and access

- `GET /brands`
- `GET /brands/:brandId`
- `POST /brands`
- `POST /brands/:brandId/memberships`
- `PATCH /brands/:brandId/memberships/:membershipId`

### KPI planning

- `GET /brands/:brandId/kpi-plans/:year`
- `PUT /brands/:brandId/kpi-plans/:year`
- `GET /metric-definitions`
- `POST /metric-definitions`
- `POST /metric-aliases`

### Reporting periods and versions

- `GET /brands/:brandId/reporting-periods`
- `POST /brands/:brandId/reporting-periods`
- `GET /brands/:brandId/reporting-periods?cadence=monthly`
- `POST /reporting-periods/:periodId/drafts`
- `GET /report-versions/:versionId`
- `POST /report-versions/:versionId/submit`
- `POST /report-versions/:versionId/approve`
- `POST /report-versions/:versionId/reject`
- `POST /report-versions/:versionId/revise`

### Import and mapping

- `POST /report-versions/:versionId/import-jobs`
- `GET /import-jobs/:jobId/sheets`
- `GET /import-jobs/:jobId/preview`
- `PUT /report-versions/:versionId/column-mappings`

### Dataset and metrics

- `GET /report-versions/:versionId/dataset`
- `PATCH /report-versions/:versionId/dataset/rows/:rowId`
- `POST /report-versions/:versionId/dataset/manual-rows`
- `POST /report-versions/:versionId/recalculate`
- `GET /report-versions/:versionId/metrics`
- `GET /report-versions/:versionId/history`
- `POST /report-versions/:versionId/top-content/regenerate`

### Evidence

- `GET /report-versions/:versionId/top-content`
- `PUT /report-versions/:versionId/top-content`
- `GET /report-versions/:versionId/competitor-evidence`
- `PUT /report-versions/:versionId/question-evidence`

### Dashboard

- `GET /brands/:brandId/dashboard`
- `GET /brands/:brandId/dashboard/metrics`
- `GET /brands/:brandId/dashboard/summary`
- `GET /brands/:brandId/dashboard?cadence=monthly`

## 6. Frontend Feature Architecture

Suggested route grouping:

- `/app/[brandId]/dashboard`
- `/app/[brandId]/reports`
- `/app/[brandId]/quarterly-reports`
- `/app/[brandId]/yearly-reports`
- `/app/[brandId]/reports/[periodId]/overview`
- `/app/[brandId]/reports/[periodId]/import`
- `/app/[brandId]/reports/[periodId]/mapping`
- `/app/[brandId]/reports/[periodId]/enrichment`
- `/app/[brandId]/reports/[periodId]/metrics`
- `/app/[brandId]/reports/[periodId]/top-content`
- `/app/[brandId]/reports/[periodId]/competitors`
- `/app/[brandId]/reports/[periodId]/questions`
- `/app/[brandId]/reports/[periodId]/review`
- `/app/[brandId]/kpi-goals`
- `/app/[brandId]/competitors`
- `/app/[brandId]/questions`
- `/app/[brandId]/settings`
- `/app/[brandId]/audit`

Frontend boundaries:

- server components or loaders for initial screen data
- client components only where interactivity is necessary
- typed API client generated or hand-maintained from backend contracts
- no duplicated formula logic in the browser
- future cadence-specific pages should reuse shared report workspace primitives wherever possible

## 7. Data Flow

### Draft editing flow

1. User action in Next.js
2. API request to NestJS application layer
3. Domain service validates permissions and workflow state
4. Repository writes MySQL records
5. Calculation or validation services run if required
6. API returns updated domain DTO and validation summary
7. Historical versions remain queryable through revision history APIs

### Top content generation flow

1. Dataset values and metric snapshots are recalculated
2. Top content service ranks eligible rows for each configured ranking group
3. System persists top content card records with metric basis and rank metadata
4. Content attaches screenshots and presentation details
5. Submission validation confirms all required top content evidence exists

### Approval flow

1. Submit endpoint locks the report version
2. Approval service creates approval request and audit entry
3. Approve endpoint marks the version immutable and supersedes any older approved version for the same reporting period
4. Projection job rebuilds dashboard read models
5. Dashboard queries begin using the newly approved version

### Future cadence composition flow

1. User creates a quarterly or yearly draft
2. Backend loads approved source periods for the requested cadence range
3. Composition service materializes aggregated metrics and source references
4. User adds cadence-specific narrative inputs where allowed
5. Approval and read-model projection follow the same revision rules

### Cross-year chart behavior

1. Dashboard query groups actual values by canonical metric definition
2. Graph legend uses the canonical chart display name such as `Views`
3. Tooltip or audit detail can show source alias history such as `Impressions` in older periods
4. Goal values are resolved from each period's own brand-year KPI plan

## 8. Testing Strategy

### Backend

- unit tests for domain services and formulas
- unit tests for metric alias resolution and historical label mapping
- integration tests for module flows and repositories
- workflow tests for draft, submit, reject, approve state transitions
- projection tests for dashboard read-model generation

### Frontend

- component tests for report workspace sections
- end-to-end tests for main analyst journey
- visual regression tests for dark and light theme on critical pages
- future regression coverage for monthly, quarterly, and yearly workspace variants

## 9. Containerization And Environments

- provide `docker-compose.yml` as the default production orchestration entrypoint and `docker-compose.local.yml` for local services
- backend and frontend should run as separate app containers
- MySQL should run in its own container with named volume persistence
- optional worker container should handle async import parsing and projection jobs
- local development should not depend on host-installed Node or MySQL beyond Docker
- production routing should assume Caddy handles public HTTP(S), domain routing, and reverse proxy behavior

## 10. Observability And Debuggability

- structured logs with request id and brand id
- domain events for submission and approval actions
- revision-link events for approved and rejected follow-up drafts
- top-content-generation logs with selection criteria and winning rows
- import job lifecycle logs
- explicit validation payloads
- audit trail UI backed by append-only records
- alias-resolution logs when import labels map to canonical metrics

## 11. Assumptions

- async jobs are acceptable for import parsing and dashboard projection.
- a single NestJS service is enough for phase 1 if modules stay well bounded.
- report dataset scale is moderate enough for MySQL-backed editing with pagination and virtualization.
- Docker is the default dev and deployment packaging model from the start.
- Caddy is already available on the target server and should remain the outer reverse proxy layer.
- metric aliases are governed centrally and not edited ad hoc per report.

## 12. Risks

- putting too much dynamic behavior into one generic dataset module can reduce clarity unless contracts stay strict.
- projection lag after approval can confuse users if dashboard refresh rules are unclear.
- file upload and parsing paths can become an operational bottleneck if not isolated cleanly.
- if cadence-aware composition is not planned early, quarter and year reporting may fork away from the monthly architecture.
- Docker images and local compose flows can become slow if build boundaries are not kept clean.
- alias rules may become a hidden source of bugs if the business meaning of renamed metrics is not documented.
- cross-year chart behavior may confuse users if the canonical label policy is inconsistent across screens.

## 13. Open Questions

- Should KPI plan approval exist in phase 1, or only report approval?
- Will imports always be user-uploaded files, or should architecture reserve space for scheduled ingestion soon?
- Does phase 1 need a dedicated campaign management screen, or can campaign context live inside report editing first?
- Should top content ranking configuration be centralized, brand-specific, or both?
- Should quarterly reports aggregate directly from approved monthly periods only, or also allow quarter-only records not tied to monthly rows?
- Which renamed source labels are confirmed business-equivalent to existing canonical metrics?

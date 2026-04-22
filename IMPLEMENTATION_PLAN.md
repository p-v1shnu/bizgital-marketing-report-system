# BIZGITAL Marketing Report Implementation Plan

## 1. Delivery Strategy

The project should move in two gates:

1. Blueprint approval
2. Controlled implementation and scaffolding

This document covers the path after blueprint sign-off, but no code scaffolding should begin until the blueprint set is approved.

## 2. Recommended Build Sequence

### Phase 0: Blueprint sign-off

Deliverables:

- approved product scope
- approved domain vocabulary
- approved schema direction
- approved UX flow and approval policy
- approved revision-history and superseded-version policy

Exit criteria:

- major open business questions are resolved enough to start build
- no disagreement about canonical report aggregate and workflow

### Phase 1: Foundation and platform skeleton

Goals:

- create monorepo or repo structure
- set up NestJS backend and Next.js frontend foundations
- establish theme tokens for dark and light modes
- implement authentication, brand boundary, and role model
- establish Docker-first local development and deployment packaging

Deliverables:

- app shell and navigation
- identity and access foundation
- brand management module
- base UI system for workspace, tables, forms, charts
- Docker Compose baseline for local development
- deployment assumptions aligned with Caddy as the production reverse proxy

### Phase 2: KPI planning and reporting-period core

Goals:

- implement brands, memberships, KPI definitions, stable metric definitions, metric aliases, KPI plans, and campaign KPI context
- implement reporting periods and report version lifecycle
- expose draft, submit, approve, reject workflow skeleton
- keep cadence fields and contracts extensible for future quarterly and yearly reports

Deliverables:

- KPI goal management UI and API
- metric alias governance for source-label changes
- reporting period list and month creation flow
- report version state machine with audit logging and revision history
- cross-year chart policy using canonical labels plus per-period alias detail

### Phase 3: Import, mapping, and dataset workspace

Goals:

- build file upload and workbook profiling
- build mapping workflow
- materialize editable dataset columns, rows, and values
- support visible columns, prefix columns, custom columns, and manual rows

Deliverables:

- import wizard
- mapping and preview UI
- dataset grid editing
- draft save and reload flow
- cadence-safe contracts so monthly implementation does not block future quarterly or yearly layers

### Phase 4: Calculations, evidence, and review readiness

Goals:

- implement formula execution on backend
- generate metric snapshots
- add auto-ranked top content highlights and evidence upload
- add competitor and question evidence
- enforce validation rules needed for submission

Deliverables:

- derived metric engine
- top content generation and evidence sections in report workspace
- review checklist and blocking validations

### Phase 5: Approval and dashboard

Goals:

- finalize approval workflow
- generate approved read models
- deliver dashboard charts and summary screens
- connect goal-vs-actual views

Deliverables:

- content and approver flow
- approved-only dashboard
- multi-month summary outputs
- revision history and superseded-version visibility controls

### Phase 6: Hardening and launch readiness

Goals:

- optimize performance and import reliability
- fill audit and observability gaps
- complete testing coverage
- run UAT with real monthly use cases
- confirm the architecture can support quarterly and yearly extensions without schema rewrite

Deliverables:

- performance tuning
- test suite expansion
- operational playbooks
- release checklist
- Docker-based deployment baseline
- Caddy reverse-proxy deployment notes

### Phase 7: Future quarterly and yearly reporting

Goals:

- add quarterly report cadence on top of approved monthly periods
- add yearly report cadence on top of approved monthly or quarterly periods
- support cadence-specific manual inputs and top content outputs

Deliverables:

- quarter and year composition services
- quarter and year workspace screens
- cadence-aware dashboard views

## 3. Prioritization Alignment

The implementation order should reflect the stated priorities:

1. UX and UI redesign
2. New database structure
3. Import performance and usability
4. Maintainability, debuggability, and testability
5. Better dashboard visualization
6. Calculated metric rule system
7. Multi-role collaboration support
8. Future scalability

Additional platform directive:

- Docker is the default environment model for local development and deployment packaging
- Caddy is the production-facing reverse proxy and is already installed on the target server

Practical interpretation:

- do not delay design-system and workspace UX decisions
- lock the database and aggregate model before writing many endpoints
- design import workflow around speed and error recovery early

## 4. Workstreams

### Workstream A: Product and UX

- finalize visual direction
- design desktop-first workspace patterns
- define dark and light theme tokens
- confirm dashboard and review layouts

### Workstream B: Domain and data

- finalize canonical entities
- create schema migration plan
- define formula metadata model
- define canonical metric identity and alias strategy
- define read-model projection strategy

### Workstream C: Backend platform

- NestJS module structure
- authorization policy model
- domain events and audit hooks
- import processing pipeline

### Workstream D: Frontend platform

- Next.js route structure
- shared layout and navigation
- data grid strategy
- charting strategy

### Workstream E: Quality and operations

- test strategy
- observability
- error taxonomy
- deployment baseline
- Docker build and compose workflow

## 5. Dependencies And Sequencing Notes

- report version workflow should exist before approval UI is built
- column catalog design should be stable before mapping UI gets deep
- formula engine should depend on finalized metric definitions and dataset contracts
- dashboard read models should be built only after approved-version rules are locked
- history and superseded-version UX should be solved before UAT to avoid user confusion
- top content generation rules should be locked before UAT so users can trust the ranking output
- cadence-safe identifiers and period contracts should be locked before phase 1 implementation goes deep

## 6. Major Risks

- scope is broad because all major modules are included in MVP
- schema churn can be expensive if reporting aggregate rules are not agreed early
- import usability can dominate the schedule if large-file behavior is unknown
- dashboard requirements may drift if canonical executive metrics are not confirmed
- approval complexity can expand quickly if per-brand customization is requested late
- quarterly and yearly expansion can become a re-platforming effort if monthly assumptions are embedded too deeply
- Docker friction can slow onboarding if the local stack is too heavy or poorly optimized

## 7. Assumptions

- the team accepts one global approval pattern for phase 1 unless business proves otherwise
- a single canonical formula system can cover MVP calculations
- brand-level role scoping is enough without more complex org hierarchies
- asynchronous job processing can be introduced when needed
- question master data is centrally managed, then activated per brand
- competitor coverage changes by year without deleting history
- phase 1 remains monthly-first, while quarterly and yearly support is designed in but not fully built yet
- Docker Compose is acceptable as the initial local orchestration path

## 8. Open Questions Requiring Business Confirmation

- exact KPI list and campaign KPI ownership model
- canonical metric list and approved alias mappings for renamed source labels
- required validation rules for submission
- mandatory versus optional evidence sections
- expected file sizes and performance targets
- whether campaign management needs its own module in phase 1 or can stay embedded in report flows
- required top content groups and ranking rules for phase 1
- exact quarterly and yearly manual-input requirements beyond rolled-up monthly data
- canonical chart display names for renamed metrics across years

## 9. Intentionally Excluded From Phase 1

- legacy table migration tooling
- automated connector ingestion beyond CSV and Excel upload
- custom workflow builder
- advanced executive portfolio reporting across many brands
- spreadsheet-like formula authoring for end users
- real-time collaborative editing
- mobile-first creation experience

## 10. Suggested Immediate Next Step After Approval

Once this blueprint is approved:

1. lock terminology and workflow states
2. choose repo structure and project conventions
3. scaffold NestJS and Next.js foundations
4. implement schema migrations for the agreed core tables
5. build the report workspace shell before deep feature coding

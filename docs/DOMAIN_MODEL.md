# BIZGITAL Marketing Report Domain Model

## 1. Domain Overview

V2 should be modeled as a set of explicit business domains with clean boundaries.

Primary domains:

- Identity and Access
- Brand Administration
- Planning and KPI Goals
- Reporting Periods and Report Versions
- Import and Mapping
- Dataset and Enrichment
- Calculation and Metric Snapshot
- Evidence and Narrative
- Approval and Audit
- Analytics and Dashboard Read Model

## 2. Aggregate Roots

### Brand

Represents a business brand that owns members, reports, KPI plans, competitors, and questions.

Key responsibilities:

- stores brand profile and presentation settings
- defines brand-level access scope
- owns brand-specific configuration

### ReportingPeriod

Represents a unique month for a brand.

Key responsibilities:

- ensures uniqueness for `brand + year + month`
- groups all report versions for that month
- exposes current workflow status for the month

Future note:

- this concept should evolve into a cadence-aware reporting period model so monthly, quarterly, and yearly periods share the same versioning principles

### ReportVersion

Represents the canonical monthly report aggregate.

This is the most important aggregate in v2.

It contains:

- import job references
- mapped dataset structure
- manual rows and custom column values
- derived metric results
- top content highlights
- competitor evidence
- question evidence
- validation status
- submission and approval state

Future extension:

- quarterly and yearly report versions should reuse the same versioning principles while allowing cadence-specific inputs and aggregated source references

Behavior rules:

- `draft` is editable
- `submitted` is locked pending decision
- `approved` is immutable
- `rejected` is immutable as a record, but can spawn a new draft copy

### ReportCadence

Represents the time granularity of a reportable business output.

Expected values:

- `monthly`
- `quarterly`
- `yearly`

Phase 1 uses `monthly` operationally, but the language and data model should not block later introduction of `quarterly` and `yearly`.

### YearlyKpiPlan

Represents brand-level KPI goals for a given year.

Key responsibilities:

- stores target values per KPI definition
- supports dashboard goal-vs-actual comparisons
- remains independent from monthly report data

### MetricDefinition

Represents a stable internal metric identity used for planning, actuals, calculations, and reporting.

Key responsibilities:

- provides a durable internal code that does not depend on Facebook naming
- allows yearly KPI plans to reference the same semantic metric over time
- separates business meaning from source-platform labels

### MetricAlias

Represents a source label or business-facing label that maps to a stable metric definition for a given effective period.

Key responsibilities:

- maps changing platform terms such as `Impressions` or `Views` to internal metric definitions
- supports effective dates, source-system context, and import mapping behavior
- preserves history when labels change over time

### CampaignKpiContext

Represents campaign-specific KPI targets or annotations attached to campaign-tagged report rows or report metrics.

Key responsibilities:

- links campaign identity to relevant report content
- stores campaign-level KPI context without replacing the yearly brand KPI plan

### CompetitorCatalogAssignment

Represents a competitor made relevant to a brand within a time context.

Key responsibilities:

- connects competitor master data to a brand
- defines active applicability by year or effective period for reporting periods

### QuestionCatalogItem

Represents a centrally managed reusable question or insight prompt that can be activated per brand.

Key responsibilities:

- stores question text and status
- supports ordering and brand-level activation with effective dates
- acts as the parent for monthly evidence entries

### TopContentSelectionSet

Represents the auto-generated set of top-performing posts for configured ranking groups within a report version.

Key responsibilities:

- selects top-ranked rows from the dataset using configured metric rules
- stores the ranked output used in presentation
- requires supporting evidence assets from Content before submission

## 3. Core Entities

### Identity and access

- User
- Role
- Permission
- BrandMembership

### Brand administration

- Brand
- BrandSetting
- BrandThemePreference

### Planning

- KpiDefinition
- MetricDefinition
- MetricAlias
- BrandKpiPlan
- BrandKpiPlanItem
- Campaign
- CampaignKpiDefinition

### Reporting

- ReportingPeriod
- ReportVersion
- ReportValidationIssue
- ReportRevisionComment

### Import and mapping

- ImportJob
- ImportSheet
- ImportColumnSample
- ColumnDefinition
- ColumnOption
- ColumnMapping
- VisibleColumnPreset

### Dataset

- DatasetColumn
- DatasetRow
- DatasetValue
- DatasetRowSource

### Calculation

- MetricFormula
- MetricSnapshot
- MetricSnapshotItem

### Evidence

- TopContentCard
- Competitor
- BrandCompetitor
- CompetitorEvidence
- QuestionMaster
- BrandQuestionActivation
- QuestionEvidence
- MediaAsset

### Workflow and audit

- ApprovalRequest
- ApprovalDecision
- ActivityLog
- DomainEvent

## 4. Canonical Relationships

- Brand has many BrandMemberships.
- Brand has many ReportingPeriods.
- Brand has many YearlyKpiPlans.
- Brand has many BrandCompetitors.
- Brand has many BrandQuestionActivations.
- ReportingPeriod has many ReportVersions.
- ReportingPeriod has one current draft version at most.
- ReportVersion has many DatasetColumns.
- ReportVersion has many DatasetRows.
- DatasetRow has many DatasetValues.
- ReportVersion has many MetricSnapshotItems.
- ReportVersion has many TopContentCards.
- ReportVersion has many CompetitorEvidence items.
- ReportVersion has many QuestionEvidence items.
- ReportVersion has many ApprovalDecisions.
- Approved ReportVersion feeds Analytics read models.
- A newer approved ReportVersion supersedes the older approved version for the same reporting period.
- Future higher-cadence report versions should derive from approved lower-cadence periods plus cadence-specific inputs.

## 5. Domain Boundaries

### Identity and Access boundary

Owns:

- authentication and authorization
- system roles and brand-scoped memberships

Does not own:

- report business rules

### Planning boundary

Owns:

- KPI definitions
- yearly targets
- metric identity and alias governance

Does not own:

- monthly actual values

### Reporting boundary

Owns:

- reporting period lifecycle
- report versions
- draft, submit, approve, reject, and revise transitions
- future cadence composition rules for quarterly and yearly reporting

Does not own:

- authentication internals

### Import and Dataset boundary

Owns:

- staged file import
- raw preview
- mapped columns
- editable report dataset

Does not own:

- final dashboard output contracts

### Calculation boundary

Owns:

- derived metric definitions
- execution of formulas
- metric snapshots and provenance

Does not own:

- KPI planning targets

### Evidence boundary

Owns:

- top content highlight assets
- competitor evidence
- question evidence

Does not own:

- approval decisions

### Analytics boundary

Owns:

- dashboard read models
- goal-vs-actual views

Does not own:

- mutable draft data

## 6. State Model

### ReportingPeriod state

- `not_started`
- `in_progress`
- `submitted`
- `approved`
- `rejected`

Notes:

- this is a convenience state derived from the latest report version status
- the authoritative workflow state still belongs to the latest report version

### ReportVersion workflow state

- `draft`
- `submitted`
- `approved`
- `rejected`
- `superseded`

### ImportJob state

- `uploaded`
- `profiling`
- `ready_for_mapping`
- `mapped`
- `failed`

## 7. Canonical Business Rules

- A dashboard must never mix draft data with approved analytics.
- Only one current draft version may exist per reporting period.
- Submitting a version freezes its data until approved or rejected.
- Rejecting a version requires reason comments.
- Approving a version produces the immutable source for dashboard reads.
- Creating a revision from an approved or rejected version must create a new draft version; prior versions are never overwritten.
- When a new approved version exists, the prior approved version becomes `superseded`.
- Quarterly and yearly reports must read from approved source periods, not draft source periods.
- Formula outputs must record provenance: imported, calculated, or manual.
- KPI targets are assigned per brand-year against stable metric definitions, not raw source labels.
- Imported Facebook-derived calculated metrics are fixed by formula and cannot be manually edited.
- Manual rows must be distinguishable from imported rows.
- Manual rows may contain directly entered metric values when the evidence source is external to the import file.
- Top content highlights are generated from report rows by rule; users do not manually choose winners by free input.
- Top content evidence such as screenshots is required before submission.
- Source metric labels may change over time; import mapping should resolve aliases to a stable metric definition whenever business semantics remain the same.
- If a renamed platform metric changes meaning, a new metric definition should be created rather than silently overwriting the old one.
- Cross-year analytics should group actuals by canonical metric definition while preserving source alias history per period.
- Visible columns are presentation configuration, not row-level source data.
- Evidence records should survive dataset remapping within the same report version.
- Audit entries are append-only.

## 8. Source-Of-Truth Policy

### Canonical write models

- ReportVersion and its child entities are canonical for monthly report content.
- BrandKpiPlan is canonical for yearly goal data.
- BrandCompetitor and BrandQuestionActivation catalogs are canonical for ongoing brand context.
- Approved monthly report versions are canonical source inputs for future quarterly and yearly report composition.
- MetricDefinition is canonical for stable metric identity; MetricAlias is canonical for source-name translation over time.

### Canonical read models

- Analytics tables or materialized read models are canonical for dashboard performance only after being built from approved report versions.
- Cross-year chart queries should read actuals by canonical metric definition and join goal values from the relevant brand-year KPI plan for each period.

### Non-canonical data

- UI state
- temporary import previews
- cached chart responses
- legacy report tables from v1

## 9. Suggested Ubiquitous Language

- Brand
- Reporting Period
- Report Version
- Draft
- Submission
- Approval
- Rejection
- Revision
- Superseded Version
- KPI Goal
- Metric Definition
- Metric Alias
- Campaign KPI
- Actual Metric
- Top Content Highlight
- Top Content Evidence
- Dataset Column
- Dataset Row
- Visible Column
- Prefix Column
- Custom Column
- Manual Row
- Derived Metric
- Evidence
- Top Content Card
- Competitor Evidence
- Question Evidence

Using this vocabulary consistently across API, UI, schema, and documentation will reduce the ambiguity that existed in the legacy system.

## 10. Assumptions

- Report versions will be duplicated only when workflow revisions require a new immutable version, not on every autosave.
- Brand-scoped roles are enough for phase 1.
- MySQL can support both normalized write tables and dashboard read models if indexes are planned early.
- Questions are centrally defined, then activated per brand over time.
- Competitor participation can change by year without deleting historical evidence.
- Draft reports can remain incomplete until submission-time validation.
- Quarterly and yearly reports will need cadence-specific narrative or evidence input in addition to rolled-up metrics.
- Some future KPI categories such as Page Followers may be monthly actuals while still being governed through the yearly KPI planning layer.
- Graph labels should prefer one canonical display name even when historical source aliases changed across periods.

## 11. Risks

- A generic dataset model may invite too many custom patterns unless governed by column and metric registries.
- If the formula boundary is unclear, content users may expect spreadsheet-like freedom that conflicts with auditability.
- If evidence is attached too tightly to imported rows, small mapping changes may break narrative content.
- If top content ranking rules are not transparent, trust in the generated highlights may be low.
- If cadence handling is added too late, monthly assumptions may spread across APIs and schema design.
- If metric renames and metric meaning changes are not separated, trend lines may compare non-equivalent values.
- If graph labeling hides alias history completely, users may lose trust when they remember old platform terminology.

## 12. Open Questions

- Should some evidence be tied to a row or metric rather than only to the report version and module section?
- What exact campaign object is needed in phase 1: simple campaign name tagging or a full campaign registry?
- Do we need configurable approval policies per brand after phase 1, or can one global policy continue longer?
- Should top content ranking groups be globally fixed, or configurable per brand?
- Should quarterly and yearly reports reuse the same approval roles as monthly reports, or allow separate approvers later?
- Which historical platform renames are approved to map to the same canonical metric definition, such as `Impressions -> Views` and `Reach -> Viewers`?

## 13. Critical Label Distinctions

### Viewers vs Viewers (Post)

- `Viewers` = manual metric entered directly by the content team (not from Meta CSV)
- `Viewers (Post)` = Meta CSV column `Reach`, renamed by the user via the mapping system
- These are DIFFERENT metrics; do NOT alias or merge them
- The column mapping system lets users rename any Meta CSV column to a company-preferred name; `Reach -> Viewers (Post)` is the standard rename for this project
- This distinction affects top-content slot labels, manual-metrics fallback arrays, and `top-content.constants.ts` `metricLabelOverride` fields

### Manual metrics vs CSV-derived metrics

- Some metrics (for example `Viewers`) are entered manually by team members in the dataset grid
- CSV-derived metrics come from Meta CSV uploads through the mapping and rename pipeline
- The system reads manual values via `globalUiSetting -> manualSourceRowsSetting`

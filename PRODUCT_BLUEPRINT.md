# BIZGITAL Marketing Report Product Blueprint

## 1. Product Intent

BIZGITAL Marketing Report is a brand-scoped marketing reporting platform, not only an import utility.

Phase 1 focuses on monthly reporting, but the core model must be designed so quarterly and yearly reporting can be added later without redesigning the domain.

Its job is to help content teams, approvers, and admins:

- plan yearly KPI goals by brand
- prepare monthly report workspaces from CSV or Excel
- support future quarterly and yearly report composition from approved lower-level reporting data plus additional user input
- map, enrich, and calculate reporting data in a controlled way
- capture qualitative evidence such as top content highlights, competitor posts, and question posts
- review, submit, approve, reject, revise, and audit report changes
- consume dashboard summaries and goal-vs-actual analytics from approved data

This is a true greenfield rebuild. The legacy system is reference-only and must not dictate the new model when it conflicts with clarity, maintainability, or future scale.

## 2. Product Principles

- One canonical monthly report model. No parallel report models like legacy `brand_reports` vs `orders`.
- Reporting cadence must scale. Monthly is phase 1, but the architecture must support quarterly and yearly layers later.
- Desktop-first analyst workflow. Dense, keyboard-friendly, split-pane, high-information UI.
- Backend-owned business logic. Mapping, calculations, validations, and approval state live in domain services, not frontend-only code.
- Approved data is trustworthy. Dashboards and summaries should read from immutable approved report versions.
- Qualitative evidence is first-class. Top content highlights, competitor, and question features are part of the product core.
- Audit by default. Important business actions must be traceable.
- Dark and light theme from day one. The product should feel intentional, modern, and not generic.

## 3. Legacy Findings Preserved

- Legacy operational source of truth is `orders + order_headers + order_rows + order_cells`.
- `brand_reports` is legacy and should not become the v2 base model.
- Yearly KPI goals are active planning data used in charts and summaries.
- Top content highlights, competitor, and question features are not optional side modules.
- Legacy mixes multiple generations of logic. V2 must separate canonical rules from legacy leftovers explicitly.

## 4. Product Scope For MVP

The first release must include all major modules from the beginning:

- Brand management
- User and role access by brand
- Yearly KPI goal management by brand and year
- Import workspace for CSV and Excel
- Column mapping and visible columns configuration
- Custom columns, prefix columns, and manual rows
- Calculated metrics and derived columns
- Monthly report save, edit, and reload flow
- Dashboard and report summary with charts
- Goal vs actual charting
- Auto-ranked top content highlights with supporting screenshots and links
- Competitor management and competitor evidence/posts
- Question management and question evidence/posts
- Approval workflow with Draft, Submit, Approve, Reject
- Audit-friendly structure

Phase 1 cadence boundary:

- monthly reports are the only editable reporting cadence in the first implementation
- quarterly and yearly reports are future layers that must be enabled by the domain, schema, and architecture from the start

## 5. Target Users And Roles

### System-level role

- Admin: manages platform-wide configuration, brand creation, access policies, KPI master definitions, question master data, and support operations.

### Brand-scoped roles

- Content: prepares monthly reports, imports files, performs mapping and enrichment, maintains evidence, and submits work.
- Approver: performs formal review, approval, or rejection for a report version.
- Viewer: reads approved dashboards, summaries, and report detail without editing.
- Auditor: reads audit trails, approval history, and version history across a brand.

Notes:

- A user may have different roles in different brands.
- A user may hold multiple roles in the same brand.
- Phase 1 approval chain is `Content -> Approver`.

## 6. Core User Journeys

### Journey A: Brand setup

1. Admin creates a brand.
2. Admin assigns members and brand roles.
3. Admin configures visible-source defaults, prefix-column catalog, question activation, and competitor sets.
4. Admin sets yearly KPI goals for the target year.

Common yearly KPI examples confirmed from current business usage:

- Views
- Viewers
- Engagement
- 3 Second Video Views
- 15 Second Video Views

### Journey B: Monthly report preparation

1. Content opens a brand month workspace.
2. Content uploads CSV or Excel.
3. Content selects sheet and preview boundaries.
4. Content maps imported columns to report columns.
5. Content adjusts visible columns and enrichment columns.
6. Content adds manual rows and reviews derived metrics.
7. Content saves draft and can reopen later without losing context.

### Journey C: Narrative and evidence completion

1. System generates top content highlights from report rows based on configured ranking metrics.
2. Content reviews the generated top content highlights and adds supporting screenshots and links.
3. Content records competitor evidence/posts for the month.
4. Content records question evidence/posts for the month.
5. Content reviews validation status before submission.

### Journey D: Submission and approval

1. Content submits a report version.
2. Approver checks completeness and business consistency.
3. Approver approves or rejects.
4. If rejected, the rejected version remains immutable and a new draft revision can be created from it.
5. If an approved version later needs correction, a new draft revision can be created from the latest approved version.
6. When a newer revision is approved, it becomes the current approved version and older approved versions remain in history as superseded versions.
7. Dashboards use only the current approved version.

### Journey E: Dashboard consumption

1. Viewer opens brand dashboard for one or many months.
2. System reads approved report versions only.
3. Charts compare actual metrics against yearly KPI goals.
4. Viewer drills down into report detail, evidence, and approval history.

### Journey F: Future quarterly and yearly reporting

1. System composes quarterly or yearly drafts from approved lower-level reporting data.
2. User adds cadence-specific narrative inputs or evidence when required.
3. System recalculates cadence-level top content highlights and summaries.
4. Approval and dashboard publishing follow the same version-history principles.

## 7. Information Architecture

The product should feel like an analyst cockpit, not a simple admin panel.

Top-level IA:

- Brand Switcher
- Dashboard
- Reports
- Quarterly Reports
- Yearly Reports
- KPI Goals
- Competitors
- Questions
- Administration
- Audit Trail

Inside a Report workspace:

- Overview
- Import Data
- Mapping
- Enrichment
- Metrics
- Top Content
- Competitors
- Questions
- Review and Submit
- History

## 8. UX Direction

### Design concept

- Editorial analytics aesthetic: strong typography, dense grids, clear data hierarchy, and less card clutter.
- Desktop-first layout with command bar, sticky context header, left section rail, center data canvas, and right inspector panel.
- Use contrasting surfaces and color tokens that feel confident in both light and dark themes.
- Favor fast analyst workflows: keyboard shortcuts, saved views, persistent filters, and inline validation.

### Interaction principles

- Large imports should feel guided, not fragile.
- Approval state must always be visible.
- Validation errors should be attached to exact sections, columns, rows, or evidence items.
- Users should understand what is calculated, what is imported, and what is manually overridden.
- Active work should stay uncluttered; historical revisions should be hidden by default but available on demand.

## 9. Proposed System Modules

- Identity and Access
- Brand Administration
- KPI Planning
- Campaign KPI Context
- Reporting Periods
- Import Pipeline
- Mapping and Column Configuration
- Dataset Workspace
- Calculation Engine
- Top Content Highlights
- Competitor Intelligence
- Question and Insight Tracking
- Approval Workflow
- Dashboard and Analytics
- Audit and Activity History
- Media and Asset Management

## 10. Canonical Source-Of-Truth Rules

- Brand is the primary security and ownership boundary.
- A reporting period is unique per `brand + year + month`.
- A report version is the only canonical monthly reporting aggregate.
- Quarterly and yearly reports must be treated as higher-order reporting outputs built from approved lower-level periods plus cadence-specific inputs.
- Draft versions are editable; submitted, approved, rejected, and superseded versions are immutable.
- Row-level facts live in the report dataset tables, not in frontend state.
- Actual metric values exposed to dashboards come from versioned metric snapshots derived from the report version.
- KPI goals live in a separate planning domain and are never overwritten by monthly actual data.
- KPI in this product means yearly brand target metrics, not ranked top posts.
- KPI definitions are primarily global, brand-year plans choose which KPI targets apply for that year, and new KPI categories such as Page Followers must be addable without schema redesign.
- Platform naming changes must be handled through metric aliasing and effective-date mapping, not by loosely renaming historical meaning in place.
- KPI definitions are primarily global, while campaign KPI context can be attached to campaign-tagged content and metric outputs.
- Cross-year charts should aggregate by canonical metric definition, show one stable metric label in the graph, and reveal period-specific source aliases in tooltip or audit detail.
- Competitor evidence, question evidence, and top content highlights belong to the report version, not to ad hoc UI state.
- Top content highlights are derived automatically from report rows and configured ranking metrics; Content supplies supporting screenshots and presentation evidence.
- Imported Facebook-derived calculated metrics are not directly editable.
- Manual rows may carry manually entered metric values when the source data exists outside the Facebook export and must retain provenance.
- Approval decisions attach to report versions and must be auditable.
- Every decided version is preserved in history; revisions never overwrite prior approved or rejected versions.
- Legacy `brand_reports` is excluded from the v2 canonical model.

## 11. Assumptions

- One brand-month should resolve to one active reporting period.
- One active editable draft is sufficient per reporting period at a time.
- Final dashboards should use approved data only.
- Formula execution should run on the backend for consistency.
- Media files should live in object storage, while metadata stays in MySQL.
- Most users operate on desktop; mobile is secondary for view-only access in phase 1.
- Question definitions are centrally managed and activated per brand with time-aware applicability.
- Competitor sets change by brand and year.
- Drafts may be incomplete and savable at any time, but submit requires all required sections and fields to pass validation.
- Quarterly reports will mainly aggregate three approved monthly periods, with room for quarter-level user input.
- Yearly reports will mainly aggregate approved monthly or quarterly data, with room for year-level user input.
- Source platforms may rename metrics over time, so the system needs stable internal metric identities separate from display labels and import aliases.
- Cross-year goal lines should resolve from the KPI plan of each month's own brand-year, even when the actual metric series is shown as one continuous canonical line.

## 12. Risks

- Dynamic reporting data can become hard to query if the schema is too generic.
- Formula flexibility can recreate legacy ambiguity if definitions and ownership are unclear.
- Approval can become performative if validation rules are weak or inconsistent.
- Dashboard trust will drop quickly if approved data can be changed silently.
- Import performance may suffer if large files are parsed synchronously without staging.
- If top content ranking rules are unclear, users may dispute why a post was selected or omitted.
- If monthly-only assumptions leak into the core model, quarterly and yearly reporting will be expensive to add later.
- If platform metric renames are modeled poorly, historical comparisons may become misleading.

## 13. Open Questions Requiring Business Confirmation

- Which KPI definitions are globally mandatory for every brand, and which are optional?
- What exact campaign KPI fields must be stored when a row is tagged to a campaign?
- Which monthly summary metrics are considered canonical for executive reporting?
- What import sizes and row counts must the MVP handle comfortably?
- What exact top content ranking groups are required by default, such as top engagement and top impression?
- What quarter-level and year-level inputs should exist beyond pure aggregation?
- For each renamed platform metric, has the business confirmed it is a true rename versus a new metric definition with different meaning?

## 14. Intentionally Excluded From Phase 1

- Legacy data migration from the old system
- Automated ingestion from third-party APIs
- Real-time multi-user collaborative editing in the same draft
- Mobile authoring parity
- Cross-brand consolidated executive portfolio dashboard
- End-user formula builder for arbitrary expressions beyond supported admin-defined rules
- Workflow automation beyond Draft, Submit, Approve, Reject

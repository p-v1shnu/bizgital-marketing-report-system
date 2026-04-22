# BIZGITAL Marketing Report UX Flow

## 1. Experience Goal

The product should feel like a serious analyst workstation.

It should be:

- desktop-first
- fast for repetitive monthly workflows
- structured so future quarterly and yearly workspaces feel native, not bolted on
- visually intentional in both dark and light themes
- explicit about data provenance, validation, and approval state

Avoid:

- generic admin-dashboard card soup
- burying important workflow state
- spreadsheet chaos without structure

## 2. UX Design Direction

### Visual language

- Strong editorial typography paired with compact data tables
- Clear contrast between workspace canvas, inspector surfaces, and navigation rails
- Accent colors used to communicate workflow state, not decorative overload
- Theme tokens defined from the beginning for both light and dark modes

### Layout model

- Persistent top bar for brand, period, and workflow state
- Left rail for module navigation
- Main center canvas for tables, forms, and charts
- Optional right inspector for validation details, field metadata, and asset previews

### Workflow philosophy

- Users work section by section, but always see overall completeness
- Draft autosave is quiet and reliable
- Submit, approve, and reject actions are prominent and irreversible without explicit new revision flow
- Historical versions are preserved, but hidden by default unless the user opens history controls

## 3. Primary Information Architecture

### Global navigation

- Dashboard
- Reports
- Quarterly Reports
- Yearly Reports
- KPI Goals
- Competitors
- Questions
- Administration
- Audit

### Brand workspace entry

Brand landing page should show:

- current reporting periods
- future quarter and year status overview
- status by month
- KPI goal coverage
- pending approvals
- quick access to competitors and questions

### Report workspace navigation

- Overview
- Import
- Mapping
- Enrichment
- Metrics
- Top Content
- Competitors
- Questions
- Review
- History

## 4. Core Screen Concepts

### Dashboard

Purpose:

- consumption of approved analytics and narratives

Main components:

- KPI trend area
- goal-vs-actual chart area
- top content highlight rail
- competitor comparison block
- question insight block
- period filter and view presets
- future cadence switcher for month, quarter, and year

### Reports index

Purpose:

- operational monthly management

Main components:

- month grid or table by brand year
- status chips
- assignee info
- last updated and current approver
- create or resume draft action
- history toggle to reveal rejected and superseded versions only when needed

### Report workspace

Purpose:

- prepare a single month report end to end

Main components:

- section progress sidebar
- import summary banner
- dataset grid
- mapping panel
- formula and validation drawer
- evidence galleries
- approval summary footer

## 5. End-To-End User Flows

### Flow A: Start a new monthly report

1. Content opens Reports.
2. Content selects a month or creates a reporting period if missing.
3. System creates or resumes the active draft version.
4. User lands on Overview with completion checklist.

### Flow B: Import and map file

1. Content opens Import.
2. Upload area accepts CSV, XLS, XLSX.
3. System profiles workbook, sheets, row count, and inferred headers.
4. User chooses sheet and preview limits.
5. Mapping screen pairs source columns to dataset columns.
6. User confirms visible columns and enrichment columns.
7. System stores mapping config and produces report dataset rows.

### Flow C: Enrich and calculate

1. Content edits manual fields in a structured grid.
2. Content adds manual rows where source files are incomplete.
3. Formula engine recalculates derived metrics server-side.
4. UI marks each value as imported, calculated, or manual.
5. Validation panel lists missing or inconsistent data.

### Flow D: Add narrative evidence

1. System auto-generates top content candidates from the report dataset, such as top engagement and top impression posts.
2. Content reviews the ranked cards and uploads supporting screenshots and links for each required top content item.
3. Content adds competitor evidence and related assets.
4. Content adds question evidence and related assets.
5. Section checklists reflect completeness.

### Flow E: Submit and approve

1. Content opens Review.
2. System shows blocking validation issues and warnings.
3. Content submits draft.
4. Approver opens submitted version in read-only review mode.
5. Approver approves or rejects with required comments on rejection.
6. Reject keeps the version immutable and allows Content to create a new draft derived from the rejected version.
7. Approve publishes the version to dashboard read models.
8. If a later correction is needed, Content creates a revision draft from the latest approved version.

## 6. UX Rules For Data Clarity

- Every metric should reveal its provenance on hover or inspector view.
- Imported and calculated values from the Facebook import must not expose an edit affordance.
- Every manual row value should reveal that it was entered manually and, when relevant, the supporting source.
- Every top content card should show why it was selected, including ranking basis and rank.
- Every rejected report should show rejection comments at workspace entry.
- Every approved report should display version number and approval timestamp.
- Every validation issue should link to the exact place to fix it.

## 7. Approval UX

### States visible everywhere

- Draft
- Submitted
- Approved
- Rejected

### Review mode requirements

- lock editing for submitted and approved versions
- show side-by-side key changes from previous approved version when available
- allow approvers to inspect change history and add decision comments

### Rejection behavior

- rejection must capture reason
- new draft should inherit prior content to avoid rework
- prior rejected version remains visible in History

### History behavior

- daily working views show only the active draft, submitted version, and current approved version
- rejected and superseded versions are hidden by default
- a `Show history` control reveals all historical revisions with timestamps, actor names, and decision comments

### Submission readiness behavior

- drafts may be saved with incomplete data at any time
- submit becomes available only when all required sections are complete
- required sections include dataset requirements, top content evidence, competitor evidence, and question evidence
- the same readiness pattern should be reusable for future quarterly and yearly reports

## 8. Theme Behavior

- Dark and light themes use the same structural hierarchy and tokens
- Charts must be legible in both themes without reauthoring per chart
- Dense data tables should preserve contrast, focus state, and validation colors in both themes

## 9. Accessibility And Productivity Expectations

- keyboard navigation across main workspace sections
- sticky headers for wide tables
- resizable panes for power users
- clear focus states
- readable chart and table contrast
- upload and validation errors announced accessibly

## 10. Assumptions

- Most editing happens on large laptop or desktop screens.
- Content users are comfortable with grid-based editing if feedback is responsive.
- Approvers value a concise approval surface more than full edit capability.

## 11. Risks

- Overloading the report workspace can hurt learnability if navigation and checklist design are weak.
- If mapping and enrichment are split poorly, users may not understand the sequence.
- If charts and evidence share the same space without hierarchy, the dashboard may feel noisy.
- If top content evidence upload is cumbersome, users may feel the auto-ranked output still requires too much manual cleanup.
- If monthly layouts are too specialized, quarterly and yearly flows may require a redesign later.

## 12. Open Questions

- Does the business want a calendar-style monthly planner, a table, or both for report management?
- Which dashboard views matter most on day one: monthly, quarterly, yearly, or rolling 12-month?
- Should the history view support comparing any two revisions, or only current versus previous approved?
- How many top content groups and ranks should be required by default in phase 1?
- What extra quarter-level or year-level sections should exist beyond aggregated monthly content?

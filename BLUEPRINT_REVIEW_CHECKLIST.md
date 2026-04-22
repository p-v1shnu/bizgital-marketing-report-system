# BIZGITAL Marketing Report Blueprint Review Checklist

## 1. Product Scope

- [x] V2 is confirmed as a true greenfield rebuild
- [x] Legacy system is reference-only
- [x] MVP includes all major business modules from the beginning
- [x] Phase 1 focuses on monthly reports
- [x] Quarterly and yearly reports are planned into the core design for future phases

## 2. Roles And Workflow

- [x] Phase 1 roles are centered on `Admin`, `Content`, `Approver`, `Viewer`, and `Auditor`
- [x] Approval flow is `Draft -> Submitted -> Approved / Rejected`
- [x] `Approved` and `Rejected` versions are immutable
- [x] Editing after approval or rejection creates a new draft revision
- [x] Older approved versions become `Superseded` when replaced
- [x] UI hides rejected and superseded versions by default, but keeps them visible in history

## 3. Source Of Truth

- [x] `brand_reports` is treated as legacy and excluded from the v2 canonical model
- [x] `ReportVersion` is the canonical monthly reporting aggregate
- [x] Dashboards read only from approved versions
- [x] KPI goals are a separate yearly planning layer
- [x] Competitor evidence, question evidence, and top content highlights are first-class modules

## 4. KPI And Metrics

- [x] KPI means yearly brand target metrics, not ranked top posts
- [x] Confirmed KPI examples include `Views`, `Viewers`, `Engagement`, `3 Second Video Views`, and `15 Second Video Views`
- [x] New KPI categories such as `Page Followers` must be addable without schema redesign
- [x] KPI plans are assigned per `brand + year`
- [x] Metric naming changes are handled through stable metric definitions plus aliases
- [x] Confirmed alias mappings include `Impressions -> Views` and `Reach -> Viewers`
- [x] Cross-year charts should use one canonical metric line while preserving alias history in tooltip or audit detail
- [x] Cross-year goal values should resolve from each period's own year plan

## 5. Dataset And Input Rules

- [x] Imported Facebook-derived calculated values are not directly editable
- [x] Manual rows are allowed and may carry manually entered values with provenance
- [x] Campaign context should not remain free text forever; the design should support a lightweight campaign registry
- [x] Drafts may be saved with incomplete data
- [x] Submit is blocked until all required sections and fields pass validation

## 6. Required Report Sections

- [x] Competitor evidence is required before submit
- [x] Question evidence is required before submit
- [x] Top content evidence is required before submit
- [x] Top content highlights are auto-ranked from report rows
- [x] Content users provide screenshots or supporting evidence for top content highlights

## 7. UX And Information Architecture

- [x] UX is desktop-first
- [x] Dark and light themes are required from the start
- [x] Product should avoid generic admin-dashboard design
- [x] Business logic should remain on the backend where possible
- [x] History and audit visibility should exist without cluttering daily work views

## 8. Technical Architecture

- [x] Backend stack is NestJS
- [x] Frontend stack is Next.js
- [x] Database is MySQL
- [x] Environment model is Docker-first
- [x] Production reverse proxy is Caddy
- [x] Architecture must remain ready for future quarterly and yearly reporting

## 9. Still Worth Confirming

- [ ] Canonical list of KPI metrics required by default for every brand
- [ ] Exact top content ranking groups for phase 1
- [ ] Whether campaign management gets its own phase 1 screen or starts embedded in report flows
- [ ] Exact quarter-level and year-level manual inputs beyond aggregation
- [ ] Import row-count and file-size expectations for performance targets

## 10. Approval Signal

If the checked items above match the intended business direction, the blueprint is ready to move into project scaffolding.

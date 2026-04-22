# Next Session Brief

## Core Intent

The next session must move the product away from demo-style framing and closer to the real product information architecture.

The system should feel like a real internal reporting platform:

- user logs in
- user sees the list of brands they are responsible for
- user selects a brand
- user lands in that brand workspace
- brand workspace focuses on `Reports` first and `Dashboard` second
- user opens an existing report or creates a new one
- user continues the real monthly workflow from there

Do not treat the home page as a hero page or storytelling surface.
Do not make the product feel like a presentation prototype.

## Locked Decisions From This Session

### Admin Audit Log v1

- Scope, event catalog, UI/permission rules, API contract, and acceptance criteria are locked in:
  - `ADMIN_AUDIT_LOG_V1_SPEC.md`

### 1. Post-login entry behavior

- After login, the user should see the brands assigned to them.
- Even if the user has only one brand, still show the brand list.
- Do not auto-enter the only brand.

### 2. Brand workspace structure

- Inside a brand, the primary surfaces for now are:
  - `Reports`
  - `Dashboard`
- `Reports` should be the operational default.
- `Dashboard` is secondary and should support time filtering.
- Access control and role-specific permissions will be discussed later; do not over-design them yet.

### 3. Report list behavior

- In the report list, the main action should be `Open`.
- Do not force the user to think in terms of `Resume draft`.
- If the latest editable state is a draft, `Open` should continue from that draft automatically.
- If the latest state is submitted or approved, `Open` should open the relevant latest state appropriately.
- `Create revision` can remain a separate action when needed.

### 4. Create new report behavior

- The user must be able to create a new report from inside the brand workspace.
- The default month should be the month after the latest existing report for that brand.
- The user must still be able to change the month manually.

### 5. Navigation behavior

- The product should have a sidebar.
- The sidebar should be collapsible / expandable.
- Tools and workspace navigation should live in that sidebar instead of being spread as large explanatory content blocks on the page.

## Current Understanding Of The Real Product Shape

### User journey

1. User logs in.
2. User sees assigned brands.
3. User clicks a brand.
4. User lands on the brand workspace.
5. User sees:
   - reports list
   - dashboard entry
   - actions to open existing reports or create a new report
6. If creating a report:
   - choose month
   - upload Meta export file
   - continue into the report workflow
7. Inside the report workflow, user completes:
   - import
   - mapping
   - enrichment / manual company-format fields
   - metrics
   - top content
   - competitors
   - questions
   - review
   - submit

### Brand-level configuration areas that will exist later

These are part of the system shape, but should not dilute the core monthly workflow UX:

- brand creation
- assign users to brands
- configure KPI for a brand
- configure competitors for a brand
- configure questions for a brand
- configure custom columns / derived columns
- KPI alias naming across years/platform changes

## What Was Learned This Session

- The previous home/brand entry still felt too much like a landing page.
- Too much text and explanatory content makes the UI feel unlike a real operational tool.
- The user wants action-first UX, not “read this first” UX.
- The product should not ask users to understand internal workflow states like `Resume draft`.
- The system should absorb that logic internally and expose simpler actions such as `Open`.
- Submitted reports should read as `Awaiting decision`, not as if they still have blockers.

## Runtime / Implementation Notes

- Frontend: `http://localhost:3000`
- Backend health: `http://localhost:3001/api/health`
- Docker services are active and were rebuilt in this session.
- `apps/frontend/.next` was added to `.dockerignore` to avoid Docker build-context failures.
- Review readiness logic was adjusted so submitted versions no longer show a false blocker only because there is no active draft.

## Current Data Notes

- Existing brand in local seed data is still `demo-brand`.
- That is seed data naming, not product direction.
- Existing active months include:
  - March 2026
  - April 2026
  - May 2026
- May 2026 was used to prove the real workflow path and is currently in submitted state.

## Required Focus For Next Session

### Priority 1: Reshape the IA around the real product flow

Implement or restructure toward:

- post-login brand list / brand picker
- brand workspace with a clearer reports-first operational layout
- collapsible sidebar
- reports list as the main working surface

### Priority 2: Make the reports list feel like a real work queue

The report list should show useful operational information such as:

- month / year
- report status
- created date and/or updated date
- actionable primary buttons
- revision/open actions where appropriate

Reduce decorative summary content that does not help a user decide what to do next.

### Priority 3: Reframe create-report UX

The create flow should feel like:

- create report
- choose month
- upload file
- continue working

Not like:

- browse a lot of narrative status UI first

### Priority 4: Keep Dashboard secondary but real

Dashboard should be reachable from brand workspace and should support month filtering.

Default dashboard filter behavior:

- start month = current month minus 2 months
- end month = current month

This reflects the normal 3-month viewing pattern.

## Important UX Constraints

- Minimize explanation-heavy hero sections.
- Avoid large blocks of text that users must read before acting.
- Prefer obvious actions, concise labels, and worklist structure.
- The UI should answer:
  - what can I do now
  - which item needs my attention
  - how do I continue where I left off

## Still Not Done

- Post-login brand list is not implemented yet.
- Brand workspace IA is still not final.
- Reports list still needs to be aligned more closely to the intended real product list structure.
- Dashboard filtering defaults described above are not yet the main validated focus.
- Real user-file validation is still required.

## Definition Of Done For The Next Session

The next session should be considered successful only if:

- the top-level product flow clearly reflects:
  - brand list
  - brand workspace
  - reports list
  - dashboard
- the brand workspace no longer feels like a landing page
- the reports surface feels like an operational report list, not a showcase board
- `Open` is the main mental model for continuing work
- the sidebar is present and collapsible
- the UI feels materially closer to a system people actually use day to day

## Reference Files

- `PRODUCT_BLUEPRINT.md`
- `DOMAIN_MODEL.md`
- `UX_FLOW.md`
- `DATABASE_SCHEMA.md`
- `ARCHITECTURE.md`
- `IMPLEMENTATION_PLAN.md`
- `BLUEPRINT_REVIEW_CHECKLIST.md`
- `ADMIN_AUDIT_LOG_V1_SPEC.md`

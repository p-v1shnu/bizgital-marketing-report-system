# BIZGITAL Marketing Report Proposed Database Schema

## 1. Schema Strategy

The schema should support:

- clear write models for mutable business operations
- immutable approved report versions
- dynamic but governed reporting datasets
- fast dashboard reads from approved data
- strong auditability

Preferred database: MySQL

Guiding decisions:

- keep core business entities relational and explicit
- use JSON only for bounded metadata, not as the primary source for important business facts
- support versioned report aggregates without recreating legacy ambiguity
- avoid hardcoding monthly-only assumptions into identifiers and read models where future cadence support is expected

## 2. High-Level Table Groups

- Access and identity
- Brand and configuration
- KPI planning
- Reporting periods and versions
- Import staging and mapping
- Dataset tables
- Metric and formula tables
- Evidence tables
- Approval and audit tables
- Analytics read-model tables

## 3. Core Relational Tables

### Access and identity

#### `users`

- `id`
- `email`
- `password_hash`
- `display_name`
- `status`
- `created_at`
- `updated_at`

#### `roles`

- `id`
- `code`
- `name`
- `scope_type` (`system`, `brand`)

#### `permissions`

- `id`
- `code`
- `name`

#### `role_permissions`

- `role_id`
- `permission_id`

#### `brand_memberships`

- `id`
- `brand_id`
- `user_id`
- `role_id`
- `status`
- `created_at`
- `updated_at`

Unique:

- unique `brand_id + user_id + role_id`

### Brand and configuration

#### `brands`

- `id`
- `code`
- `name`
- `logo_asset_id`
- `timezone`
- `status`
- `created_at`
- `updated_at`

#### `brand_settings`

- `brand_id`
- `default_theme`
- `default_visible_column_preset_id`
- `report_due_day`
- `created_at`
- `updated_at`

#### `column_catalogs`

Global or brand-specific configurable columns.

- `id`
- `brand_id` nullable
- `column_key`
- `label`
- `column_type` (`source`, `prefix`, `custom`, `derived`)
- `data_type` (`string`, `number`, `date`, `boolean`, `select`, `url`)
- `is_required`
- `is_active`
- `display_order`
- `created_at`
- `updated_at`

#### `column_catalog_options`

- `id`
- `column_catalog_id`
- `value`
- `label`
- `display_order`

#### `visible_column_presets`

- `id`
- `brand_id`
- `name`
- `created_by_user_id`
- `created_at`

#### `visible_column_preset_items`

- `id`
- `preset_id`
- `column_catalog_id`
- `display_order`

### KPI planning

#### `kpi_definitions`

- `id`
- `code`
- `name`
- `description`
- `unit_type`
- `aggregation_type`
- `is_active`

Note:

- if the team prefers a simpler model, this table can be folded into `metric_definitions` and treated as a business-facing KPI registry over the same canonical metric identities

#### `metric_definitions`

- `id`
- `metric_key`
- `canonical_name`
- `chart_display_name`
- `description`
- `unit_type`
- `aggregation_scope`
- `status`
- `created_at`
- `updated_at`

Notes:

- this table stores stable internal metric identities such as `views`, `viewers`, `engagement`, `video_views_3s`, `video_views_15s`, or future metrics like `page_followers`

#### `metric_aliases`

- `id`
- `metric_definition_id`
- `source_system`
- `alias_label`
- `alias_type` (`source_label`, `business_label`, `display_label`)
- `effective_from` nullable
- `effective_to` nullable
- `notes` nullable
- `created_at`
- `updated_at`

Notes:

- use this table to handle platform naming changes such as `Impressions` to `Views` or `Reach` to `Viewers` when the business confirms they map to the same canonical metric
- if the meaning changed, create a new `metric_definitions` record instead of only adding an alias

#### `campaigns`

- `id`
- `brand_id`
- `name`
- `status`
- `starts_at` nullable
- `ends_at` nullable
- `created_at`
- `updated_at`

#### `campaign_kpi_definitions`

- `id`
- `campaign_id`
- `metric_definition_id`
- `target_value` nullable
- `notes`
- `created_at`
- `updated_at`

#### `brand_kpi_plans`

- `id`
- `brand_id`
- `year`
- `status`
- `created_by_user_id`
- `approved_by_user_id` nullable
- `created_at`
- `updated_at`

Unique:

- unique `brand_id + year`

#### `brand_kpi_plan_items`

- `id`
- `brand_kpi_plan_id`
- `metric_definition_id`
- `target_value`
- `notes`

Unique:

- unique `brand_kpi_plan_id + metric_definition_id`

### Reporting periods and versions

#### `reporting_periods`

- `id`
- `brand_id`
- `cadence` (`monthly`)
- `year`
- `month`
- `quarter` nullable
- `period_start_date`
- `period_end_date`
- `current_state`
- `current_draft_version_id` nullable
- `current_approved_version_id` nullable
- `created_at`
- `updated_at`

Unique:

- unique `brand_id + cadence + year + month + quarter`

#### `report_versions`

- `id`
- `reporting_period_id`
- `version_no`
- `cadence` (`monthly`)
- `workflow_state`
- `created_from_version_id` nullable
- `created_by_user_id`
- `submitted_at` nullable
- `submitted_by_user_id` nullable
- `approved_at` nullable
- `approved_by_user_id` nullable
- `rejected_at` nullable
- `rejected_by_user_id` nullable
- `rejection_reason` nullable
- `change_summary` nullable
- `superseded_at` nullable
- `source_periods_json` nullable
- `created_at`
- `updated_at`

Unique:

- unique `reporting_period_id + version_no`

### Import staging and mapping

#### `import_jobs`

- `id`
- `report_version_id`
- `uploaded_by_user_id`
- `original_filename`
- `file_asset_id`
- `file_type`
- `status`
- `selected_sheet_name` nullable
- `detected_row_count`
- `detected_column_count`
- `created_at`
- `updated_at`

#### `import_job_sheets`

- `id`
- `import_job_id`
- `sheet_name`
- `sheet_index`
- `header_row_index`
- `preview_row_count`

#### `import_column_samples`

- `id`
- `import_job_sheet_id`
- `source_column_name`
- `source_position`
- `sample_values_json`
- `inferred_data_type`

#### `column_mappings`

- `id`
- `report_version_id`
- `source_column_name`
- `source_position`
- `column_catalog_id`
- `mapping_type` (`direct`, `ignore`, `derived_input`)
- `is_visible`
- `created_at`
- `updated_at`

### Dataset tables

#### `dataset_columns`

- `id`
- `report_version_id`
- `column_catalog_id` nullable
- `column_key`
- `label`
- `column_kind` (`source`, `prefix`, `custom`, `derived`)
- `data_type`
- `is_visible`
- `is_required`
- `display_order`
- `created_at`
- `updated_at`

#### `dataset_rows`

- `id`
- `report_version_id`
- `row_no`
- `row_source` (`imported`, `manual`)
- `source_ref` nullable
- `campaign_id` nullable
- `created_by_user_id` nullable
- `created_at`
- `updated_at`

Unique:

- unique `report_version_id + row_no`

#### `dataset_values`

- `id`
- `dataset_row_id`
- `dataset_column_id`
- `string_value` nullable
- `number_value` nullable
- `date_value` nullable
- `boolean_value` nullable
- `json_value` nullable
- `value_origin` (`imported`, `manual`, `calculated`)
- `supporting_asset_id` nullable
- `created_at`
- `updated_at`

Unique:

- unique `dataset_row_id + dataset_column_id`

Index notes:

- index `dataset_column_id`
- index `value_origin`
- composite index `dataset_row_id + dataset_column_id`

### Metric and formula tables

#### `metric_definitions`

- `id`
- `brand_id` nullable
- `metric_key`
- `label`
- `unit_type`
- `aggregation_scope` (`row`, `report`)
- `source_type` (`direct`, `derived`)
- `is_active`

#### `metric_formulas`

- `id`
- `metric_definition_id`
- `formula_version`
- `expression_json`
- `output_data_type`
- `effective_from`
- `effective_to` nullable
- `created_by_user_id`
- `created_at`

#### `metric_snapshots`

- `id`
- `report_version_id`
- `generated_at`
- `generated_by_user_id`

#### `metric_snapshot_items`

- `id`
- `metric_snapshot_id`
- `metric_definition_id`
- `value`
- `value_origin` (`imported`, `manual`, `calculated`)
- `trace_json` nullable

Unique:

- unique `metric_snapshot_id + metric_definition_id`

### Evidence tables

#### `media_assets`

- `id`
- `storage_disk`
- `storage_path`
- `original_filename`
- `mime_type`
- `file_size`
- `width` nullable
- `height` nullable
- `uploaded_by_user_id`
- `created_at`

#### `top_content_cards`

- `id`
- `report_version_id`
- `metric_definition_id`
- `dataset_row_id`
- `slot_key`
- `title`
- `headline_value`
- `caption`
- `external_url` nullable
- `image_asset_id` nullable
- `rank_position`
- `selection_basis`
- `display_order`
- `created_at`
- `updated_at`

#### `competitors`

- `id`
- `name`
- `primary_platform`
- `website_url` nullable
- `facebook_url` nullable
- `instagram_url` nullable
- `tiktok_url` nullable
- `youtube_url` nullable
- `created_at`
- `updated_at`

#### `brand_competitors`

- `id`
- `brand_id`
- `competitor_id`
- `active_from_year`
- `active_to_year` nullable
- `display_order`
- `status`

Unique:

- unique `brand_id + competitor_id + active_from_year`

#### `question_masters`

- `id`
- `question_text`
- `status`
- `created_at`
- `updated_at`

#### `brand_question_activations`

- `id`
- `brand_id`
- `question_master_id`
- `active_from_date`
- `active_to_date` nullable
- `display_order`
- `status`
- `created_at`
- `updated_at`

#### `competitor_evidence`

- `id`
- `report_version_id`
- `competitor_id`
- `title`
- `post_url` nullable
- `note`
- `captured_metric_value` nullable
- `captured_metric_label` nullable
- `display_order`
- `created_at`
- `updated_at`

#### `competitor_evidence_assets`

- `id`
- `competitor_evidence_id`
- `media_asset_id`
- `display_order`

#### `question_evidence`

- `id`
- `report_version_id`
- `brand_question_activation_id`
- `title`
- `response_note`
- `post_url` nullable
- `display_order`
- `created_at`
- `updated_at`

#### `question_evidence_assets`

- `id`
- `question_evidence_id`
- `media_asset_id`
- `display_order`

### Approval and audit

#### `approval_requests`

- `id`
- `report_version_id`
- `requested_by_user_id`
- `requested_at`
- `status`

#### `approval_decisions`

- `id`
- `approval_request_id`
- `decided_by_user_id`
- `decision` (`approve`, `reject`)
- `comment`
- `decided_at`

#### `report_version_links`

- `id`
- `from_report_version_id`
- `to_report_version_id`
- `link_type` (`revision_of`, `supersedes`)
- `created_at`

#### `activity_logs`

- `id`
- `brand_id` nullable
- `actor_user_id` nullable
- `entity_type`
- `entity_id`
- `action`
- `context_json`
- `created_at`

## 4. Analytics Read Models

The dashboard should not aggregate large dynamic tables at request time if it can be avoided.

Suggested read-model tables:

#### `report_metric_period_read_model`

- `brand_id`
- `reporting_period_id`
- `report_version_id`
- `cadence`
- `year`
- `month`
- `quarter` nullable
- `metric_definition_id`
- `source_alias_label` nullable
- `actual_value`
- `goal_value` nullable
- `approved_at`

#### `dashboard_top_kpi_read_model`

- `brand_id`
- `report_version_id`
- `slot_key`
- `title`
- `headline_value`
- `external_url`
- `image_asset_id`

#### `dashboard_competitor_read_model`

- `brand_id`
- `report_version_id`
- `competitor_id`
- `summary_json`

These can be rebuilt whenever a report version is approved or KPI goals change.

## 5. Constraints And Rules

- approved report versions are immutable
- rejected report versions are immutable
- only one active draft per reporting period
- read models are derived only from approved versions
- no important dashboard fact should exist only in JSON
- evidence assets are reusable metadata records, not inline blobs
- newer approved versions supersede but never overwrite older approved versions
- imported or calculated Facebook-derived metric values must not be directly edited in place
- top content winners are generated from report rows, while supporting screenshots are provided by users
- phase 1 persists monthly periods, but table design should allow quarterly and yearly periods later without breaking keys

## 6. Indexing Priorities

- `reporting_periods (brand_id, year, month)`
- `report_versions (reporting_period_id, workflow_state)`
- `dataset_rows (report_version_id, row_source)`
- `dataset_values (dataset_column_id)`
- `metric_aliases (source_system, alias_label, effective_from, effective_to)`
- `metric_snapshot_items (metric_snapshot_id, metric_definition_id)`
- `brand_kpi_plan_items (brand_kpi_plan_id, metric_definition_id)`
- `activity_logs (entity_type, entity_id, created_at)`

## 7. Schema Assumptions

- Dynamic reporting structure is required, so dataset tables are intentional.
- Metric snapshots are preferred over recalculating every chart request.
- Object storage or equivalent file storage is available for images and uploads.
- Quarterly and yearly outputs may later use dedicated cadence-level content tables or extend report version metadata depending on complexity.
- KPI planning and actual reporting should share stable metric identities even when source labels change.
- Chart read models should preserve both canonical metric identity and the period-specific source alias used at import time.

## 8. Schema Risks

- Dataset tables can become large quickly and need careful indexing and archival policy.
- If formula trace data is too verbose, snapshot tables may grow faster than expected.
- MySQL query complexity may rise if too many dashboard needs rely on raw dataset joins.
- A mixed-cadence model can become messy if monthly and future quarterly/yearly outputs are not clearly separated in read models.
- If alias mapping is too permissive, unlike metrics may be merged accidentally.

## 9. Open Questions

- Should competitor evidence include follower or engagement comparison fields as first-class columns?
- Does phase 1 need a full campaign registry table in the UI, or is campaign name tagging enough initially?
- How long should draft import staging data be retained after remapping or version supersession?
- How many required top content groups should the schema assume by default?
- Should quarterly and yearly cadence-specific inputs live in shared report-version structures or dedicated extension tables?
- Which historical Facebook label changes should map to existing canonical metrics in phase 1?

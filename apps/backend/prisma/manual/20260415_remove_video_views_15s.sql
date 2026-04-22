SET @target_enum_value := 'video_views_15s';
SET @mapping_enum :=
  "ENUM('post_name','published_at','platform','campaign_name','views','viewers','page_followers','engagement','video_views_3s','content_url')";

DELETE bpi
FROM brand_kpi_plan_items bpi
INNER JOIN global_kpi_catalog gkc ON gkc.id = bpi.kpi_catalog_id
WHERE gkc.canonical_metric_key = @target_enum_value;

DELETE FROM global_kpi_catalog
WHERE canonical_metric_key = @target_enum_value;

DELETE FROM column_mappings
WHERE target_field = @target_enum_value;

DELETE FROM dataset_cells
WHERE target_field = @target_enum_value;

DELETE FROM metric_snapshot_items
WHERE metric_key = @target_enum_value;

DELETE FROM top_content_cards
WHERE metric_key = @target_enum_value;

SET @sql := CONCAT(
  'ALTER TABLE global_kpi_catalog MODIFY COLUMN canonical_metric_key ',
  @mapping_enum,
  ' NULL'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := CONCAT(
  'ALTER TABLE column_mappings MODIFY COLUMN target_field ',
  @mapping_enum,
  ' NOT NULL'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := CONCAT(
  'ALTER TABLE dataset_cells MODIFY COLUMN target_field ',
  @mapping_enum,
  ' NOT NULL'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := CONCAT(
  'ALTER TABLE metric_snapshot_items MODIFY COLUMN metric_key ',
  @mapping_enum,
  ' NOT NULL'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := CONCAT(
  'ALTER TABLE top_content_cards MODIFY COLUMN metric_key ',
  @mapping_enum,
  ' NOT NULL'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

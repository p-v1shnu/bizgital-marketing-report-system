SET @has_competitor_mode := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'reporting_periods'
    AND COLUMN_NAME = 'competitor_mode'
);
SET @sql := IF(
  @has_competitor_mode = 0,
  "ALTER TABLE reporting_periods ADD COLUMN competitor_mode ENUM('with_competitors', 'without_competitors') NOT NULL DEFAULT 'with_competitors' AFTER current_state",
  "SELECT 1"
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @brand_id_column_type := (
  SELECT COLUMN_TYPE
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'brands'
    AND COLUMN_NAME = 'id'
);
SET @brand_id_character_set := (
  SELECT CHARACTER_SET_NAME
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'brands'
    AND COLUMN_NAME = 'id'
);
SET @brand_id_collation := (
  SELECT COLLATION_NAME
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'brands'
    AND COLUMN_NAME = 'id'
);
SET @string_column_suffix := IF(
  @brand_id_character_set IS NULL OR @brand_id_collation IS NULL,
  '',
  CONCAT(' CHARACTER SET ', @brand_id_character_set, ' COLLATE ', @brand_id_collation)
);
SET @create_mode_history_sql := CONCAT(
  'CREATE TABLE IF NOT EXISTS brand_competitor_year_mode_changes (',
  'id ', COALESCE(@brand_id_column_type, 'VARCHAR(191)'), @string_column_suffix, ' NOT NULL,',
  'brand_id ', COALESCE(@brand_id_column_type, 'VARCHAR(191)'), @string_column_suffix, ' NOT NULL,',
  'year INT NOT NULL,',
  'effective_month INT NOT NULL,',
  "mode ENUM('with_competitors', 'without_competitors') NOT NULL DEFAULT 'with_competitors',",
  'created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),',
  'updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),',
  'PRIMARY KEY (id),',
  'UNIQUE KEY brand_competitor_year_mode_unique (brand_id, year, effective_month),',
  'KEY bcy_mode_brand_year_month_idx (brand_id, year, effective_month),',
  'CONSTRAINT brand_competitor_year_mode_brand_fk ',
  'FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE CASCADE ON UPDATE CASCADE',
  ')'
);
PREPARE stmt FROM @create_mode_history_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

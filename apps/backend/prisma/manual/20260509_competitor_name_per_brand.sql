SET @has_competitor_name_unique_index := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'competitors'
    AND INDEX_NAME = 'competitors_name_key'
);

SET @sql := IF(
  @has_competitor_name_unique_index > 0,
  'ALTER TABLE competitors DROP INDEX competitors_name_key',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

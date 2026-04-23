SET @has_monthly_post_count := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'competitor_monitoring'
    AND COLUMN_NAME = 'monthly_post_count'
);

SET @sql := IF(
  @has_monthly_post_count = 0,
  "ALTER TABLE competitor_monitoring ADD COLUMN monthly_post_count INT NULL AFTER follower_count",
  "SELECT 1"
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

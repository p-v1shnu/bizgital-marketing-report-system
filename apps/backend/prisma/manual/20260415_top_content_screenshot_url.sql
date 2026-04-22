SET @column_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'top_content_cards'
    AND COLUMN_NAME = 'screenshot_url'
);

SET @alter_sql := IF(
  @column_exists = 0,
  'ALTER TABLE top_content_cards ADD COLUMN screenshot_url TEXT NULL AFTER external_url',
  'SELECT 1'
);

PREPARE stmt FROM @alter_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

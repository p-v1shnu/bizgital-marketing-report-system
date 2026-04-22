SET @has_deleted_at := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'reporting_periods'
    AND COLUMN_NAME = 'deleted_at'
);
SET @sql := IF(
  @has_deleted_at = 0,
  "ALTER TABLE reporting_periods ADD COLUMN deleted_at DATETIME(3) NULL AFTER question_snapshot_captured_at",
  "SELECT 1"
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_deleted_by_name := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'reporting_periods'
    AND COLUMN_NAME = 'deleted_by_name'
);
SET @sql := IF(
  @has_deleted_by_name = 0,
  "ALTER TABLE reporting_periods ADD COLUMN deleted_by_name VARCHAR(191) NULL AFTER deleted_at",
  "SELECT 1"
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_deleted_by_email := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'reporting_periods'
    AND COLUMN_NAME = 'deleted_by_email'
);
SET @sql := IF(
  @has_deleted_by_email = 0,
  "ALTER TABLE reporting_periods ADD COLUMN deleted_by_email VARCHAR(191) NULL AFTER deleted_by_name",
  "SELECT 1"
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_purge_at := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'reporting_periods'
    AND COLUMN_NAME = 'purge_at'
);
SET @sql := IF(
  @has_purge_at = 0,
  "ALTER TABLE reporting_periods ADD COLUMN purge_at DATETIME(3) NULL AFTER deleted_by_email",
  "SELECT 1"
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_deleted_purge_idx := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'reporting_periods'
    AND INDEX_NAME = 'reporting_periods_deleted_at_purge_at_idx'
);
SET @sql := IF(
  @has_deleted_purge_idx = 0,
  "CREATE INDEX reporting_periods_deleted_at_purge_at_idx ON reporting_periods (deleted_at, purge_at)",
  "SELECT 1"
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

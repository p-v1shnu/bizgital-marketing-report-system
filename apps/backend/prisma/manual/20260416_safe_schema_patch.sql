ALTER TABLE question_evidence
  MODIFY COLUMN title TEXT NULL,
  MODIFY COLUMN response_note TEXT NULL;

SET @has_mode := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'question_evidence'
    AND COLUMN_NAME = 'mode'
);
SET @sql := IF(
  @has_mode = 0,
  "ALTER TABLE question_evidence ADD COLUMN mode ENUM('has_questions', 'no_questions') NOT NULL DEFAULT 'has_questions' AFTER post_url",
  "SELECT 1"
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_question_count := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'question_evidence'
    AND COLUMN_NAME = 'question_count'
);
SET @sql := IF(
  @has_question_count = 0,
  "ALTER TABLE question_evidence ADD COLUMN question_count INT NOT NULL DEFAULT 0 AFTER mode",
  "SELECT 1"
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @should_backfill_legacy_questions := IF(@has_mode = 0 OR @has_question_count = 0, 1, 0);
SET @sql := IF(
  @should_backfill_legacy_questions = 1,
  "UPDATE question_evidence
   SET mode = 'has_questions',
       question_count = CASE
         WHEN title IS NULL OR CHAR_LENGTH(TRIM(title)) = 0 THEN 0
         ELSE 1
       END",
  "SELECT 1"
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS question_evidence_screenshots (
  id VARCHAR(191) NOT NULL,
  question_evidence_id VARCHAR(191) NOT NULL,
  display_order INT NOT NULL DEFAULT 1,
  screenshot_url TEXT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY question_evidence_screenshot_evidence_order_unique (question_evidence_id, display_order),
  KEY question_evidence_screenshots_question_evidence_id_idx (question_evidence_id),
  CONSTRAINT question_evidence_screenshots_question_evidence_id_fkey
    FOREIGN KEY (question_evidence_id)
    REFERENCES question_evidence(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SET @has_question_snapshot_column := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'reporting_periods'
    AND COLUMN_NAME = 'question_snapshot_captured_at'
);
SET @sql := IF(
  @has_question_snapshot_column = 0,
  "ALTER TABLE reporting_periods ADD COLUMN question_snapshot_captured_at DATETIME(3) NULL AFTER current_state",
  "SELECT 1"
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS reporting_period_question_assignments (
  id VARCHAR(191) NOT NULL,
  reporting_period_id VARCHAR(191) NOT NULL,
  brand_question_activation_id VARCHAR(191) NOT NULL,
  question_master_id VARCHAR(191) NOT NULL,
  question_text_snapshot TEXT NOT NULL,
  display_order INT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY reporting_period_question_assignment_period_activation_unique (reporting_period_id, brand_question_activation_id),
  KEY reporting_period_question_assignments_period_display_idx (reporting_period_id, display_order),
  KEY reporting_period_question_assignments_question_master_id_idx (question_master_id),
  CONSTRAINT reporting_period_question_assignments_period_fk
    FOREIGN KEY (reporting_period_id)
    REFERENCES reporting_periods(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS brand_competitor_assignment_status_changes (
  id VARCHAR(191) NOT NULL,
  assignment_id VARCHAR(191) NOT NULL,
  effective_year INT NOT NULL,
  effective_month INT NOT NULL,
  status ENUM('active', 'inactive') NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY brand_competitor_assignment_status_change_unique (assignment_id, effective_year, effective_month),
  KEY bcasc_assignment_effective_idx (assignment_id, effective_year, effective_month),
  CONSTRAINT brand_competitor_assignment_status_change_assignment_fk
    FOREIGN KEY (assignment_id)
    REFERENCES brand_competitor_assignments(id)
    ON DELETE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

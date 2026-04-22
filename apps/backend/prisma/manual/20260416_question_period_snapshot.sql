ALTER TABLE reporting_periods
  ADD COLUMN question_snapshot_captured_at DATETIME(3) NULL AFTER current_state;

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
    FOREIGN KEY (reporting_period_id) REFERENCES reporting_periods(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

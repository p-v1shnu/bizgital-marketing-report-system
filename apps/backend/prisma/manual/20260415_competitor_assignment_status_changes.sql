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
    REFERENCES brand_competitor_assignments (id)
    ON DELETE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

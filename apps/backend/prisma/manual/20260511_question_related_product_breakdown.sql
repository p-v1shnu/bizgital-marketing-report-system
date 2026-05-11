CREATE TABLE IF NOT EXISTS question_evidence_related_product_breakdowns (
  id VARCHAR(191) NOT NULL,
  question_evidence_id VARCHAR(191) NOT NULL,
  related_product_option_id VARCHAR(191) NOT NULL,
  value_key VARCHAR(191) NOT NULL,
  label VARCHAR(255) NOT NULL,
  question_count INT NOT NULL,
  display_order INT NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY question_evidence_product_evidence_option_unique (question_evidence_id, related_product_option_id),
  KEY question_evidence_product_evidence_idx (question_evidence_id),
  KEY question_evidence_product_option_idx (related_product_option_id),
  CONSTRAINT question_evidence_product_evidence_fkey
    FOREIGN KEY (question_evidence_id) REFERENCES question_evidence(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT question_evidence_product_option_fkey
    FOREIGN KEY (related_product_option_id) REFERENCES brand_dropdown_options(id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE question_evidence
  MODIFY COLUMN title TEXT NULL,
  MODIFY COLUMN response_note TEXT NULL;

ALTER TABLE question_evidence
  ADD COLUMN mode ENUM('has_questions', 'no_questions') NOT NULL DEFAULT 'has_questions' AFTER post_url,
  ADD COLUMN question_count INT NOT NULL DEFAULT 0 AFTER mode;

UPDATE question_evidence
SET
  mode = 'has_questions',
  question_count = CASE
    WHEN title IS NULL OR CHAR_LENGTH(TRIM(title)) = 0 THEN 0
    ELSE 1
  END;

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
    FOREIGN KEY (question_evidence_id) REFERENCES question_evidence(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
);

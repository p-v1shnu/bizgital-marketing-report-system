ALTER TABLE report_versions
  ADD COLUMN question_highlight_note_optional TINYINT(1) NOT NULL DEFAULT 0 AFTER question_highlight_note;

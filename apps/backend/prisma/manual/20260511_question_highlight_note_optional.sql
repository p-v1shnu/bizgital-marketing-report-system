SET @has_question_highlight_note_optional := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'report_versions'
    AND COLUMN_NAME = 'question_highlight_note_optional'
);

SET @sql := IF(
  @has_question_highlight_note_optional = 0,
  'ALTER TABLE report_versions ADD COLUMN question_highlight_note_optional TINYINT(1) NOT NULL DEFAULT 0 AFTER question_highlight_note',
  'SELECT ''skip: report_versions.question_highlight_note_optional already exists'''
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

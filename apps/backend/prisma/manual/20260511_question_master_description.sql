SET @has_question_master_description := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'question_masters'
    AND COLUMN_NAME = 'description'
);

SET @sql := IF(
  @has_question_master_description = 0,
  'ALTER TABLE `question_masters` ADD COLUMN `description` TEXT NULL AFTER `question_text`',
  'SELECT ''skip: question_masters.description already exists'''
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_brand_dropdown_description := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'brand_dropdown_options'
    AND COLUMN_NAME = 'description'
);

SET @sql := IF(
  @has_brand_dropdown_description = 0,
  'ALTER TABLE brand_dropdown_options ADD COLUMN description TEXT NULL AFTER label',
  'SELECT ''skip: brand_dropdown_options.description already exists'''
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_global_company_format_description := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'global_company_format_options'
    AND COLUMN_NAME = 'description'
);

SET @sql := IF(
  @has_global_company_format_description = 0,
  'ALTER TABLE global_company_format_options ADD COLUMN description TEXT NULL AFTER label',
  'SELECT ''skip: global_company_format_options.description already exists'''
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

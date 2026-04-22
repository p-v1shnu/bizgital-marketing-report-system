ALTER TABLE `import_jobs` ADD COLUMN `snapshot_source_type` VARCHAR(191) NULL;
ALTER TABLE `import_jobs` ADD COLUMN `snapshot_sheet_name` VARCHAR(191) NULL;
ALTER TABLE `import_jobs` ADD COLUMN `snapshot_header_row` JSON NULL;
ALTER TABLE `import_jobs` ADD COLUMN `snapshot_data_rows` JSON NULL;
ALTER TABLE `import_jobs` ADD COLUMN `snapshot_captured_at` DATETIME(3) NULL;

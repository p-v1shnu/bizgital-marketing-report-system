ALTER TABLE brands
  ADD COLUMN IF NOT EXISTS activated_at DATETIME(3) NULL AFTER status;

ALTER TABLE brands
  ADD COLUMN IF NOT EXISTS deactivated_at DATETIME(3) NULL AFTER activated_at;

UPDATE brands
SET
  activated_at = CASE
    WHEN status = 'active' THEN COALESCE(activated_at, created_at)
    ELSE activated_at
  END,
  deactivated_at = CASE
    WHEN status = 'inactive' THEN COALESCE(deactivated_at, updated_at, created_at)
    ELSE deactivated_at
  END;

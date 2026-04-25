CREATE TABLE IF NOT EXISTS brand_campaigns (
  id VARCHAR(191) NOT NULL,
  brand_id VARCHAR(191) NOT NULL,
  year INT NOT NULL,
  name VARCHAR(191) NOT NULL,
  name_key VARCHAR(191) NOT NULL,
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  channel ENUM(
    'facebook',
    'instagram',
    'tiktok',
    'youtube',
    'x',
    'line',
    'website',
    'other'
  ) NULL,
  objective ENUM('awareness', 'engagement', 'conversion') NULL,
  start_date DATE NULL,
  end_date DATE NULL,
  notes TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY brand_campaign_brand_year_name_key_unique (brand_id, year, name_key),
  KEY brand_campaign_brand_year_status_created_at_idx (brand_id, year, status, created_at),
  CONSTRAINT brand_campaigns_brand_id_fkey
    FOREIGN KEY (brand_id) REFERENCES brands(id)
    ON DELETE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

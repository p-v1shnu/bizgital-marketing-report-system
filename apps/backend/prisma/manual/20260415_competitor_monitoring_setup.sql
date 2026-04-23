ALTER TABLE `competitors`
  ADD COLUMN `status` ENUM('active', 'inactive') NOT NULL DEFAULT 'active';

CREATE TABLE IF NOT EXISTS `brand_competitor_assignments` (
  `id` VARCHAR(191) NOT NULL,
  `brand_id` VARCHAR(191) NOT NULL,
  `competitor_id` VARCHAR(191) NOT NULL,
  `year` INT NOT NULL,
  `display_order` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `brand_competitor_assignment_brand_year_competitor_unique` (`brand_id`, `year`, `competitor_id`),
  KEY `brand_competitor_assignments_brand_year_display_order_idx` (`brand_id`, `year`, `display_order`),
  KEY `brand_competitor_assignments_competitor_id_idx` (`competitor_id`),
  CONSTRAINT `brand_competitor_assignments_brand_fk` FOREIGN KEY (`brand_id`) REFERENCES `brands` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `brand_competitor_assignments_competitor_fk` FOREIGN KEY (`competitor_id`) REFERENCES `competitors` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `competitor_monitoring` (
  `id` VARCHAR(191) NOT NULL,
  `report_version_id` VARCHAR(191) NOT NULL,
  `competitor_id` VARCHAR(191) NOT NULL,
  `status` ENUM('has_posts', 'no_activity') NULL,
  `follower_count` INT NULL,
  `monthly_post_count` INT NULL,
  `no_activity_note` TEXT NULL,
  `no_activity_evidence_image_url` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `competitor_monitoring_version_competitor_unique` (`report_version_id`, `competitor_id`),
  KEY `competitor_monitoring_report_version_id_idx` (`report_version_id`),
  KEY `competitor_monitoring_competitor_id_idx` (`competitor_id`),
  CONSTRAINT `competitor_monitoring_report_version_fk` FOREIGN KEY (`report_version_id`) REFERENCES `report_versions` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `competitor_monitoring_competitor_fk` FOREIGN KEY (`competitor_id`) REFERENCES `competitors` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `competitor_monitoring_posts` (
  `id` VARCHAR(191) NOT NULL,
  `competitor_monitoring_id` VARCHAR(191) NOT NULL,
  `display_order` INT NOT NULL DEFAULT 1,
  `screenshot_url` TEXT NOT NULL,
  `post_url` TEXT NULL,
  `note` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `competitor_monitoring_post_monitoring_display_unique` (`competitor_monitoring_id`, `display_order`),
  KEY `competitor_monitoring_posts_monitoring_id_idx` (`competitor_monitoring_id`),
  CONSTRAINT `competitor_monitoring_posts_monitoring_fk` FOREIGN KEY (`competitor_monitoring_id`) REFERENCES `competitor_monitoring` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

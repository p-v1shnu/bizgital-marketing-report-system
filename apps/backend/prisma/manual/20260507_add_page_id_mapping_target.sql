ALTER TABLE column_mappings
  MODIFY COLUMN target_field ENUM(
    'post_name',
    'published_at',
    'platform',
    'campaign_name',
    'page_id',
    'views',
    'viewers',
    'page_followers',
    'engagement',
    'video_views_3s',
    'content_url'
  ) NOT NULL;

ALTER TABLE dataset_cells
  MODIFY COLUMN target_field ENUM(
    'post_name',
    'published_at',
    'platform',
    'campaign_name',
    'page_id',
    'views',
    'viewers',
    'page_followers',
    'engagement',
    'video_views_3s',
    'content_url'
  ) NOT NULL;

ALTER TABLE metric_snapshot_items
  MODIFY COLUMN metric_key ENUM(
    'post_name',
    'published_at',
    'platform',
    'campaign_name',
    'page_id',
    'views',
    'viewers',
    'page_followers',
    'engagement',
    'video_views_3s',
    'content_url'
  ) NOT NULL;

ALTER TABLE top_content_cards
  MODIFY COLUMN metric_key ENUM(
    'post_name',
    'published_at',
    'platform',
    'campaign_name',
    'page_id',
    'views',
    'viewers',
    'page_followers',
    'engagement',
    'video_views_3s',
    'content_url'
  ) NOT NULL;

ALTER TABLE global_kpi_catalog
  MODIFY COLUMN canonical_metric_key ENUM(
    'post_name',
    'published_at',
    'platform',
    'campaign_name',
    'page_id',
    'views',
    'viewers',
    'page_followers',
    'engagement',
    'video_views_3s',
    'content_url'
  ) NULL;

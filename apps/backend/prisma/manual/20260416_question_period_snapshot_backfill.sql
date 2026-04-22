INSERT IGNORE INTO reporting_period_question_assignments (
  id,
  reporting_period_id,
  brand_question_activation_id,
  question_master_id,
  question_text_snapshot,
  display_order,
  created_at,
  updated_at
)
SELECT
  CONCAT('qps_', rp.id, '_', ranked.id) AS id,
  rp.id AS reporting_period_id,
  ranked.id AS brand_question_activation_id,
  ranked.question_master_id,
  ranked.question_text_snapshot,
  ranked.display_order,
  NOW(3) AS created_at,
  NOW(3) AS updated_at
FROM reporting_periods rp
JOIN (
  SELECT *
  FROM (
    SELECT
      bqa.id,
      bqa.brand_id,
      bqa.question_master_id,
      qm.question_text AS question_text_snapshot,
      bqa.display_order,
      bqa.created_at,
      ROW_NUMBER() OVER (
        PARTITION BY bqa.brand_id, bqa.question_master_id
        ORDER BY bqa.display_order ASC, bqa.created_at ASC, bqa.id ASC
      ) AS dedupe_rank
    FROM brand_question_activations bqa
    INNER JOIN question_masters qm ON qm.id = bqa.question_master_id
    WHERE bqa.status = 'active'
      AND qm.status = 'active'
  ) ranked_source
  WHERE ranked_source.dedupe_rank = 1
) ranked ON ranked.brand_id = rp.brand_id
WHERE rp.question_snapshot_captured_at IS NULL;

UPDATE reporting_periods
SET question_snapshot_captured_at = NOW(3)
WHERE question_snapshot_captured_at IS NULL;

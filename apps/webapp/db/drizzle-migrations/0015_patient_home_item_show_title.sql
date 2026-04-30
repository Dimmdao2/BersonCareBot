ALTER TABLE "patient_home_block_items" ADD COLUMN "show_title" boolean DEFAULT true NOT NULL;

WITH anchor AS (
  SELECT COALESCE(
    (SELECT "sort_order" FROM "patient_home_blocks" WHERE "code" = 'daily_warmup'),
    10
  ) AS "daily_order"
)
UPDATE "patient_home_blocks" AS b
SET "sort_order" = CASE
    WHEN b."code" = 'useful_post' THEN anchor."daily_order" + 1
    ELSE b."sort_order" + 1
  END,
  "updated_at" = now()
FROM anchor
WHERE b."code" = 'useful_post'
  OR (b."code" <> 'daily_warmup' AND b."code" <> 'useful_post' AND b."sort_order" > anchor."daily_order");
-- TEMPORARY LOCAL MIGRATION NUMBER 0298 -- renumbered by the lead at merge (0297 taken by the access-state removal).
-- B1.4 (docs/_TODO/SAAS_FOUNDATION/SAAS_BILLING_PLAN.md): product catalog cut whole, owner
-- decision 01.08 verbatim "вырезай каталог". Drops the four tables created by
-- 0095_booking_stage7_products.sql. Neither table exists on prod (owner 01.08, "там нет этого")
-- nor carries rows on dev -- plain drop, no emptiness guard.

DROP TABLE IF EXISTS "be_product_history_events";
--> statement-breakpoint

DROP TABLE IF EXISTS "be_product_purchases";
--> statement-breakpoint

DROP TABLE IF EXISTS "be_product_pay_links";
--> statement-breakpoint

DROP TABLE IF EXISTS "be_products";

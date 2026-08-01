-- Number 0289 assigned by the lead at merge (01.08): it collided with the К2 refunds migration,
-- which was renumbered to 0290. This number is final -- do not renumber.
-- §5a item 2.6a (owner 31.07): "какой тариф выдаётся при регистрации" is its own platform setting,
-- independent of saas_trial_policy. NULL tariff_id is a legal value -- it means the person picks a
-- tariff themselves, not a code default.
CREATE TABLE IF NOT EXISTS "saas_registration_tariff_policy" (
  "key" text PRIMARY KEY DEFAULT 'global' NOT NULL,
  "tariff_id" uuid REFERENCES "saas_tariffs"("id") ON DELETE RESTRICT,
  "updated_by" uuid,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "saas_registration_tariff_policy_key_check" CHECK ("key" = 'global')
);

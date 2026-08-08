-- 0381: D15b/5 slice 5 — `user_identity` becomes the ONLY read source of FIO.
-- TEMPORARY LOCAL MIGRATION NUMBER 0381 (AGENTS.md "Миграции") — lead renumbers at land.
--
-- Authority: WORK_ORDER.md D15b/5 ("ФИО в user_identity"), owner instruction 09.08
-- ("identities/users зеркалированы на 91% — сделай переезд правильно"). This closes question В-1
-- of `docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/evidence/18-duplication-sweep.md` in the FORWARD
-- direction. Reasoning and measurements: `evidence/22-identity-migration.md`.
--
-- Why 0377's backfill was not enough. 0377 mirrored only `merged_into_id IS NULL`, so merge
-- tombstones keep FIO in `platform_users` and have no `user_identity` row at all. Measured on a
-- disposable PG16 cluster restored from `bersoncarebot_test` and `bcb_webapp_dev` (09.08.2026):
--   canonical rows without a mirror row ....... 0 (test) / 0 (dev)
--   MERGED rows without a mirror row .......... 41 (test) / 41 (dev)
--   mirror rows diverging on any of 5 columns .. 0 (test) / 0 (dev)
-- Readers drop their `COALESCE(ui.x, pu.x)` fallback in this same slice, so the mirror has to be
-- TOTAL — one row per `platform_users` row — or a tombstone would start reading NULL FIO
-- (`platformUserFullPurge`, merge audit trails and name-match hints do read tombstones).
--
-- Contacts need no equivalent backfill and must NOT get one: merge clears `phone_normalized` and
-- `email_normalized` on the tombstone (measured: 0 tombstones carry either on dev or test), and
-- `uq_user_contacts_phone` / `uq_user_contacts_email` would forbid a tombstone holding the same
-- value as its survivor. `user_contacts` is canonical-only BY CONSTRUCTION; `user_identity` is not.
--
-- Forward-only and idempotent: re-running inserts nothing and re-asserts the same invariants.

INSERT INTO public.user_identity (
  platform_user_id,
  first_name,
  last_name,
  patronymic,
  display_name,
  birth_date,
  created_at,
  updated_at
)
SELECT
  pu.id,
  pu.first_name,
  pu.last_name,
  pu.patronymic,
  COALESCE(pu.display_name, ''),
  pu.birth_date,
  pu.created_at,
  pu.updated_at
FROM public.platform_users pu
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_identity ui WHERE ui.platform_user_id = pu.id
)
ON CONFLICT (platform_user_id) DO NOTHING;

-- Fail closed: after this migration `user_identity` is the source of truth for FIO, so a row that
-- is missing or that disagrees with the column it replaces must stop the migration, not be papered
-- over by a reader-side COALESCE (that fallback is removed in the same slice).
DO $$
DECLARE
  missing bigint;
  diverging bigint;
BEGIN
  SELECT count(*) INTO missing
  FROM public.platform_users pu
  WHERE NOT EXISTS (
    SELECT 1 FROM public.user_identity ui WHERE ui.platform_user_id = pu.id
  );

  IF missing > 0 THEN
    RAISE EXCEPTION '0381 parity failed: % platform_users row(s) have no user_identity mirror', missing;
  END IF;

  SELECT count(*) INTO diverging
  FROM public.user_identity ui
  JOIN public.platform_users pu ON pu.id = ui.platform_user_id
  WHERE NOT (
    ui.first_name IS NOT DISTINCT FROM pu.first_name
    AND ui.last_name IS NOT DISTINCT FROM pu.last_name
    AND ui.patronymic IS NOT DISTINCT FROM pu.patronymic
    AND ui.display_name IS NOT DISTINCT FROM COALESCE(pu.display_name, '')
    AND ui.birth_date IS NOT DISTINCT FROM pu.birth_date
  );

  IF diverging > 0 THEN
    RAISE EXCEPTION '0381 parity failed: % user_identity row(s) diverge from platform_users FIO', diverging;
  END IF;
END $$;

COMMENT ON TABLE public.user_identity IS
  'D15b/5: source of truth for FIO of a platform user. One row per public.platform_users row, including merge tombstones. The five FIO columns on platform_users are the legacy write-through copy and are dropped once every writer targets this table.';

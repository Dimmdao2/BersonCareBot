-- 0383: D25 — messenger links land in `public.user_channel_bindings`; the numeric back-pointer
-- `platform_users.integrator_user_id` stops being trusted as an identity key.
-- TEMPORARY LOCAL MIGRATION NUMBER 0383 (AGENTS.md "Миграции") — lead renumbers at land.
--
-- Authority: ACCESS_MODEL.md ("интегратор — модуль доставки, а не хранилище данных людей"),
-- WORK_ORDER.md D25, evidence `15-integrator-tables-disposition.md` §10-11 and
-- `19-integrator-cut-record.md` §б-3. Row-by-row reconciliation: `evidence/22-identity-migration.md`.
--
-- WHY THE BACK-POINTER CANNOT BE THE KEY (measured 09.08.2026 on a disposable PG16 cluster
-- restored from the 08.08 dumps + live dev/test schema — identical result on both environments):
--   `integrator.users` held 134 anchors and `integrator.identities` 134 rows — exactly ONE identity
--   per anchor. The integrator created an anchor PER MESSENGER, while the webapp consolidates every
--   messenger of one person onto ONE `platform_users` row. `integrator_user_id` is a scalar, so for
--   a person with two messengers it can only ever hold one of the two anchors. That — not data loss
--   — is the whole of the "91 % mirrored" gap: 8 of the 12 unmatched anchors are the second
--   messenger of a person already fully present in `user_channel_bindings` (8 = exactly the number
--   of people with more than one binding), 2 are rows where the back-pointer was written with the
--   Telegram chat id instead of the anchor id, and 2 never became webapp accounts at all.
--   The same defect explains the 383 rows of `reminder_occurrence_history` whose two keys did not
--   agree (`18-duplication-sweep.md` §18): 383/383 resolve as "same person, other anchor", not as
--   the merge fallout that document guessed at. `platform_user_id` was right in every one of them.
--
-- WHAT THIS MIGRATION DOES
--   1. Where `integrator.identities` still exists (production has not been cut), copy every
--      messenger link it holds into `public.user_channel_bindings`, resolving the person through
--      the back-pointer. This is the last fact those tables held that `public` did not.
--   2. Clear back-pointers that provably do not name an anchor: a value that also appears as an
--      `external_id` in `user_channel_bindings`. An anchor id is a small serial (max 145 measured);
--      a messenger chat id is eight digits and up (min 6 966 223 measured) — four orders of
--      magnitude apart, so the two ranges cannot legitimately collide. 3 such rows on dev, 3 on
--      test, none of which named a real anchor.
--
-- On dev and test the integrator tables are already gone, so step 1 is a no-op there and the one
-- link that was lost with them is restored from the dump by
-- `apps/webapp/scripts/d25-recover-channel-bindings-from-dump.mjs` (see that file for provenance).
--
-- Forward-only and idempotent.

DO $$
DECLARE
  recovered bigint := 0;
BEGIN
  IF to_regclass('integrator.identities') IS NOT NULL THEN
    WITH inserted AS (
      INSERT INTO public.user_channel_bindings (user_id, channel_code, external_id, created_at)
      SELECT pu.id, i.resource, i.external_id, i.created_at
      FROM integrator.identities i
      JOIN public.platform_users pu ON pu.integrator_user_id = i.user_id
      WHERE i.resource IN ('telegram', 'max', 'vk')
        AND NOT EXISTS (
          SELECT 1 FROM public.user_channel_bindings b
          WHERE b.channel_code = i.resource AND b.external_id = i.external_id
        )
      ON CONFLICT (channel_code, external_id) DO NOTHING
      RETURNING 1
    )
    SELECT count(*) INTO recovered FROM inserted;

    RAISE NOTICE '0383: recovered % messenger link(s) from integrator.identities', recovered;
  ELSE
    RAISE NOTICE '0383: integrator.identities absent — nothing to recover in this environment';
  END IF;
END $$;

UPDATE public.platform_users pu
SET integrator_user_id = NULL
WHERE pu.integrator_user_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.user_channel_bindings b
    WHERE b.external_id = pu.integrator_user_id::text
  );

DO $$
DECLARE
  bogus bigint;
BEGIN
  SELECT count(*) INTO bogus
  FROM public.platform_users pu
  WHERE pu.integrator_user_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.user_channel_bindings b
      WHERE b.external_id = pu.integrator_user_id::text
    );

  IF bogus > 0 THEN
    RAISE EXCEPTION '0383 failed: % platform_users row(s) still carry a chat id in integrator_user_id', bogus;
  END IF;
END $$;

COMMENT ON COLUMN public.platform_users.integrator_user_id IS
  'LEGACY back-pointer to the dropped integrator.users anchor. NOT an identity key: the integrator created one anchor per messenger, so this scalar cannot address a person with more than one. Resolve people by public.user_channel_bindings (channel_code, external_id). Kept only until the last reader of the numeric key is gone (D25).';

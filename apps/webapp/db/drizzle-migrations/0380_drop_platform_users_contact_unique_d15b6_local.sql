-- 0380: D15b/6 slice 4 — drop legacy contact uniqueness on platform_users; user_contacts holds it.
-- TEMPORARY LOCAL MIGRATION NUMBER 0380 (AGENTS.md "Миграции") — lead renumbers at land.
--
-- Authority: WORK_ORDER.md D15b/6 / D25. Dual-write readers + writers landed in slices 1–3 (#987).
-- Non-unique idx_platform_users_phone stays for legacy column lookups during cutover.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.platform_users pu
    WHERE pu.merged_into_id IS NULL
      AND pu.phone_normalized IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.user_contacts uc
        WHERE uc.platform_user_id = pu.id
          AND uc.contact_kind = 'phone'
          AND uc.is_primary = true
          AND uc.value_normalized = pu.phone_normalized
      )
  ) THEN
    RAISE EXCEPTION '0380 parity failed: canonical platform_users.phone_normalized missing primary user_contacts mirror';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.platform_users pu
    WHERE pu.merged_into_id IS NULL
      AND pu.email_normalized IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.user_contacts uc
        WHERE uc.platform_user_id = pu.id
          AND uc.contact_kind = 'email'
          AND uc.is_primary = true
          AND uc.value_normalized = pu.email_normalized
      )
  ) THEN
    RAISE EXCEPTION '0380 parity failed: canonical platform_users.email_normalized missing primary user_contacts mirror';
  END IF;
END $$;

ALTER TABLE public.platform_users
  DROP CONSTRAINT IF EXISTS platform_users_phone_normalized_key;

DROP INDEX IF EXISTS public.uq_platform_users_email_normalized_active;

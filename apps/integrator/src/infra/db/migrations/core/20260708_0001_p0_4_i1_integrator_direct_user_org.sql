ALTER TABLE integrator.contacts
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE integrator.content_access_grants
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE integrator.mailing_logs
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE integrator.user_reminder_rules
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE integrator.user_subscriptions
  ADD COLUMN IF NOT EXISTS organization_id uuid;

CREATE INDEX IF NOT EXISTS idx_contacts_organization_id
  ON integrator.contacts USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_content_access_grants_organization_id
  ON integrator.content_access_grants USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_mailing_logs_organization_id
  ON integrator.mailing_logs USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_user_reminder_rules_organization_id
  ON integrator.user_reminder_rules USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_organization_id
  ON integrator.user_subscriptions USING btree (organization_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'contacts_organization_id_fkey'
      AND conrelid = 'integrator.contacts'::regclass
  ) THEN
    ALTER TABLE integrator.contacts
      ADD CONSTRAINT contacts_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'content_access_grants_organization_id_fkey'
      AND conrelid = 'integrator.content_access_grants'::regclass
  ) THEN
    ALTER TABLE integrator.content_access_grants
      ADD CONSTRAINT content_access_grants_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'mailing_logs_organization_id_fkey'
      AND conrelid = 'integrator.mailing_logs'::regclass
  ) THEN
    ALTER TABLE integrator.mailing_logs
      ADD CONSTRAINT mailing_logs_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_reminder_rules_organization_id_fkey'
      AND conrelid = 'integrator.user_reminder_rules'::regclass
  ) THEN
    ALTER TABLE integrator.user_reminder_rules
      ADD CONSTRAINT user_reminder_rules_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_subscriptions_organization_id_fkey'
      AND conrelid = 'integrator.user_subscriptions'::regclass
  ) THEN
    ALTER TABLE integrator.user_subscriptions
      ADD CONSTRAINT user_subscriptions_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
DECLARE
  v_default_org_id constant uuid := 'a0000000-0000-4000-8000-000000000001';
  v_org_count integer;
  v_multi_org_user_count bigint;
  v_unresolved_row_count bigint;
BEGIN
  SELECT count(*)::integer
  INTO v_org_count
  FROM public.be_organizations
  WHERE id = v_default_org_id;

  IF v_org_count <> 1 THEN
    RAISE EXCEPTION 'P0.4.I1 expected default organization %, found %', v_default_org_id, v_org_count;
  END IF;

  WITH referenced_integrator_users AS (
    SELECT user_id FROM integrator.contacts
    UNION SELECT user_id FROM integrator.content_access_grants
    UNION SELECT user_id FROM integrator.mailing_logs
    UNION SELECT user_id FROM integrator.user_reminder_rules
    UNION SELECT user_id FROM integrator.user_subscriptions
  ), active_user_orgs AS (
    SELECT platform_user_id, organization_id FROM public.org_enrollments WHERE status = 'active'
    UNION ALL
    SELECT platform_user_id, organization_id FROM public.be_organization_members WHERE status = 'active'
  ), bridge_org_counts AS (
    SELECT
      refs.user_id,
      count(DISTINCT active_user_orgs.organization_id) AS organization_count
    FROM referenced_integrator_users refs
    LEFT JOIN public.platform_users platform_user
      ON platform_user.integrator_user_id = refs.user_id
    LEFT JOIN active_user_orgs
      ON active_user_orgs.platform_user_id = platform_user.id
    GROUP BY refs.user_id
  )
  SELECT count(*)::bigint
  INTO v_multi_org_user_count
  FROM bridge_org_counts
  WHERE organization_count > 1;

  IF v_multi_org_user_count <> 0 THEN
    RAISE EXCEPTION 'P0.4.I1 expected no multi-org direct integrator users, found % user keys',
      v_multi_org_user_count;
  END IF;

  WITH user_org AS (
    SELECT platform_user_id, (array_agg(DISTINCT organization_id))[1] AS organization_id
    FROM (
      SELECT platform_user_id, organization_id FROM public.org_enrollments WHERE status = 'active'
      UNION ALL
      SELECT platform_user_id, organization_id FROM public.be_organization_members WHERE status = 'active'
    ) orgs
    GROUP BY platform_user_id
    HAVING count(DISTINCT organization_id) = 1
  ), integrator_user_org AS (
    SELECT platform_user.integrator_user_id, user_org.organization_id
    FROM public.platform_users platform_user
    JOIN user_org
      ON user_org.platform_user_id = platform_user.id
    WHERE platform_user.integrator_user_id IS NOT NULL
  )
  SELECT sum(row_count)::bigint
  INTO v_unresolved_row_count
  FROM (
    SELECT count(*) AS row_count
    FROM integrator.contacts source
    LEFT JOIN integrator_user_org
      ON integrator_user_org.integrator_user_id = source.user_id
    WHERE source.organization_id IS NULL
      AND integrator_user_org.organization_id IS NULL
    UNION ALL
    SELECT count(*)
    FROM integrator.content_access_grants source
    LEFT JOIN integrator_user_org
      ON integrator_user_org.integrator_user_id = source.user_id
    WHERE source.organization_id IS NULL
      AND integrator_user_org.organization_id IS NULL
    UNION ALL
    SELECT count(*)
    FROM integrator.mailing_logs source
    LEFT JOIN integrator_user_org
      ON integrator_user_org.integrator_user_id = source.user_id
    WHERE source.organization_id IS NULL
      AND integrator_user_org.organization_id IS NULL
    UNION ALL
    SELECT count(*)
    FROM integrator.user_reminder_rules source
    LEFT JOIN integrator_user_org
      ON integrator_user_org.integrator_user_id = source.user_id
    WHERE source.organization_id IS NULL
      AND integrator_user_org.organization_id IS NULL
    UNION ALL
    SELECT count(*)
    FROM integrator.user_subscriptions source
    LEFT JOIN integrator_user_org
      ON integrator_user_org.integrator_user_id = source.user_id
    WHERE source.organization_id IS NULL
      AND integrator_user_org.organization_id IS NULL
  ) unresolved;

  RAISE NOTICE 'P0.4.I1 direct-user rows using default-org fallback: %', v_unresolved_row_count;
END $$;

UPDATE integrator.contacts target
SET organization_id = COALESCE(integrator_user_org.organization_id, 'a0000000-0000-4000-8000-000000000001'::uuid)
FROM integrator.contacts source
LEFT JOIN (
  SELECT platform_user.integrator_user_id, user_org.organization_id
  FROM public.platform_users platform_user
  JOIN (
    SELECT platform_user_id, (array_agg(DISTINCT organization_id))[1] AS organization_id
    FROM (
      SELECT platform_user_id, organization_id FROM public.org_enrollments WHERE status = 'active'
      UNION ALL
      SELECT platform_user_id, organization_id FROM public.be_organization_members WHERE status = 'active'
    ) orgs
    GROUP BY platform_user_id
    HAVING count(DISTINCT organization_id) = 1
  ) user_org
    ON user_org.platform_user_id = platform_user.id
  WHERE platform_user.integrator_user_id IS NOT NULL
) integrator_user_org
  ON integrator_user_org.integrator_user_id = source.user_id
WHERE target.organization_id IS NULL
  AND target.id = source.id;

UPDATE integrator.content_access_grants target
SET organization_id = COALESCE(integrator_user_org.organization_id, 'a0000000-0000-4000-8000-000000000001'::uuid)
FROM integrator.content_access_grants source
LEFT JOIN (
  SELECT platform_user.integrator_user_id, user_org.organization_id
  FROM public.platform_users platform_user
  JOIN (
    SELECT platform_user_id, (array_agg(DISTINCT organization_id))[1] AS organization_id
    FROM (
      SELECT platform_user_id, organization_id FROM public.org_enrollments WHERE status = 'active'
      UNION ALL
      SELECT platform_user_id, organization_id FROM public.be_organization_members WHERE status = 'active'
    ) orgs
    GROUP BY platform_user_id
    HAVING count(DISTINCT organization_id) = 1
  ) user_org
    ON user_org.platform_user_id = platform_user.id
  WHERE platform_user.integrator_user_id IS NOT NULL
) integrator_user_org
  ON integrator_user_org.integrator_user_id = source.user_id
WHERE target.organization_id IS NULL
  AND target.id = source.id;

UPDATE integrator.mailing_logs target
SET organization_id = COALESCE(integrator_user_org.organization_id, 'a0000000-0000-4000-8000-000000000001'::uuid)
FROM integrator.mailing_logs source
LEFT JOIN (
  SELECT platform_user.integrator_user_id, user_org.organization_id
  FROM public.platform_users platform_user
  JOIN (
    SELECT platform_user_id, (array_agg(DISTINCT organization_id))[1] AS organization_id
    FROM (
      SELECT platform_user_id, organization_id FROM public.org_enrollments WHERE status = 'active'
      UNION ALL
      SELECT platform_user_id, organization_id FROM public.be_organization_members WHERE status = 'active'
    ) orgs
    GROUP BY platform_user_id
    HAVING count(DISTINCT organization_id) = 1
  ) user_org
    ON user_org.platform_user_id = platform_user.id
  WHERE platform_user.integrator_user_id IS NOT NULL
) integrator_user_org
  ON integrator_user_org.integrator_user_id = source.user_id
WHERE target.organization_id IS NULL
  AND target.user_id = source.user_id
  AND target.mailing_id = source.mailing_id;

UPDATE integrator.user_reminder_rules target
SET organization_id = COALESCE(integrator_user_org.organization_id, 'a0000000-0000-4000-8000-000000000001'::uuid)
FROM integrator.user_reminder_rules source
LEFT JOIN (
  SELECT platform_user.integrator_user_id, user_org.organization_id
  FROM public.platform_users platform_user
  JOIN (
    SELECT platform_user_id, (array_agg(DISTINCT organization_id))[1] AS organization_id
    FROM (
      SELECT platform_user_id, organization_id FROM public.org_enrollments WHERE status = 'active'
      UNION ALL
      SELECT platform_user_id, organization_id FROM public.be_organization_members WHERE status = 'active'
    ) orgs
    GROUP BY platform_user_id
    HAVING count(DISTINCT organization_id) = 1
  ) user_org
    ON user_org.platform_user_id = platform_user.id
  WHERE platform_user.integrator_user_id IS NOT NULL
) integrator_user_org
  ON integrator_user_org.integrator_user_id = source.user_id
WHERE target.organization_id IS NULL
  AND target.id = source.id;

SET LOCAL app.stage13_bypass = 'true';

UPDATE integrator.user_subscriptions target
SET organization_id = COALESCE(integrator_user_org.organization_id, 'a0000000-0000-4000-8000-000000000001'::uuid)
FROM integrator.user_subscriptions source
LEFT JOIN (
  SELECT platform_user.integrator_user_id, user_org.organization_id
  FROM public.platform_users platform_user
  JOIN (
    SELECT platform_user_id, (array_agg(DISTINCT organization_id))[1] AS organization_id
    FROM (
      SELECT platform_user_id, organization_id FROM public.org_enrollments WHERE status = 'active'
      UNION ALL
      SELECT platform_user_id, organization_id FROM public.be_organization_members WHERE status = 'active'
    ) orgs
    GROUP BY platform_user_id
    HAVING count(DISTINCT organization_id) = 1
  ) user_org
    ON user_org.platform_user_id = platform_user.id
  WHERE platform_user.integrator_user_id IS NOT NULL
) integrator_user_org
  ON integrator_user_org.integrator_user_id = source.user_id
WHERE target.organization_id IS NULL
  AND target.user_id = source.user_id
  AND target.topic_id = source.topic_id;

DO $$
DECLARE
  v_null_count bigint;
BEGIN
  SELECT sum(null_rows)
  INTO v_null_count
  FROM (
    SELECT count(*) FILTER (WHERE organization_id IS NULL) AS null_rows FROM integrator.contacts
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM integrator.content_access_grants
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM integrator.mailing_logs
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM integrator.user_reminder_rules
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM integrator.user_subscriptions
  ) checks;

  IF v_null_count <> 0 THEN
    RAISE EXCEPTION 'P0.4.I1 expected no NULL organization_id rows, found %', v_null_count;
  END IF;
END $$;

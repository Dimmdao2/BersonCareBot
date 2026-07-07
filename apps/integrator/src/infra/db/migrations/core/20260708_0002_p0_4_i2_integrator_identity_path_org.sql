ALTER TABLE integrator.conversations
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE integrator.message_drafts
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE integrator.user_questions
  ADD COLUMN IF NOT EXISTS organization_id uuid;

CREATE INDEX IF NOT EXISTS idx_conversations_organization_id
  ON integrator.conversations USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_message_drafts_organization_id
  ON integrator.message_drafts USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_user_questions_organization_id
  ON integrator.user_questions USING btree (organization_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'conversations_organization_id_fkey'
      AND conrelid = 'integrator.conversations'::regclass
  ) THEN
    ALTER TABLE integrator.conversations
      ADD CONSTRAINT conversations_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'message_drafts_organization_id_fkey'
      AND conrelid = 'integrator.message_drafts'::regclass
  ) THEN
    ALTER TABLE integrator.message_drafts
      ADD CONSTRAINT message_drafts_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES public.be_organizations(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_questions_organization_id_fkey'
      AND conrelid = 'integrator.user_questions'::regclass
  ) THEN
    ALTER TABLE integrator.user_questions
      ADD CONSTRAINT user_questions_organization_id_fkey
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
    RAISE EXCEPTION 'P0.4.I2 expected default organization %, found %', v_default_org_id, v_org_count;
  END IF;

  WITH referenced_integrator_users AS (
    SELECT identity.user_id
    FROM integrator.conversations source
    JOIN integrator.identities identity
      ON identity.id = source.user_identity_id
    UNION
    SELECT identity.user_id
    FROM integrator.message_drafts source
    JOIN integrator.identities identity
      ON identity.id = source.identity_id
    UNION
    SELECT identity.user_id
    FROM integrator.user_questions source
    JOIN integrator.identities identity
      ON identity.id = source.user_identity_id
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
    RAISE EXCEPTION 'P0.4.I2 expected no multi-org identity-path integrator users, found % user keys',
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
    FROM integrator.conversations source
    JOIN integrator.identities identity
      ON identity.id = source.user_identity_id
    LEFT JOIN integrator_user_org
      ON integrator_user_org.integrator_user_id = identity.user_id
    WHERE source.organization_id IS NULL
      AND integrator_user_org.organization_id IS NULL
    UNION ALL
    SELECT count(*)
    FROM integrator.message_drafts source
    JOIN integrator.identities identity
      ON identity.id = source.identity_id
    LEFT JOIN integrator_user_org
      ON integrator_user_org.integrator_user_id = identity.user_id
    WHERE source.organization_id IS NULL
      AND integrator_user_org.organization_id IS NULL
    UNION ALL
    SELECT count(*)
    FROM integrator.user_questions source
    JOIN integrator.identities identity
      ON identity.id = source.user_identity_id
    LEFT JOIN integrator_user_org
      ON integrator_user_org.integrator_user_id = identity.user_id
    WHERE source.organization_id IS NULL
      AND integrator_user_org.organization_id IS NULL
  ) unresolved;

  RAISE NOTICE 'P0.4.I2 identity-path rows using default-org fallback: %', v_unresolved_row_count;
END $$;

UPDATE integrator.conversations target
SET organization_id = COALESCE(integrator_user_org.organization_id, 'a0000000-0000-4000-8000-000000000001'::uuid)
FROM integrator.conversations source
JOIN integrator.identities identity
  ON identity.id = source.user_identity_id
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
  ON integrator_user_org.integrator_user_id = identity.user_id
WHERE target.organization_id IS NULL
  AND target.id = source.id;

UPDATE integrator.message_drafts target
SET organization_id = COALESCE(integrator_user_org.organization_id, 'a0000000-0000-4000-8000-000000000001'::uuid)
FROM integrator.message_drafts source
JOIN integrator.identities identity
  ON identity.id = source.identity_id
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
  ON integrator_user_org.integrator_user_id = identity.user_id
WHERE target.organization_id IS NULL
  AND target.id = source.id;

UPDATE integrator.user_questions target
SET organization_id = COALESCE(integrator_user_org.organization_id, 'a0000000-0000-4000-8000-000000000001'::uuid)
FROM integrator.user_questions source
JOIN integrator.identities identity
  ON identity.id = source.user_identity_id
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
  ON integrator_user_org.integrator_user_id = identity.user_id
WHERE target.organization_id IS NULL
  AND target.id = source.id;

DO $$
DECLARE
  v_null_count bigint;
BEGIN
  SELECT sum(null_rows)
  INTO v_null_count
  FROM (
    SELECT count(*) FILTER (WHERE organization_id IS NULL) AS null_rows FROM integrator.conversations
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM integrator.message_drafts
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM integrator.user_questions
  ) checks;

  IF v_null_count <> 0 THEN
    RAISE EXCEPTION 'P0.4.I2 expected no NULL organization_id rows, found %', v_null_count;
  END IF;
END $$;

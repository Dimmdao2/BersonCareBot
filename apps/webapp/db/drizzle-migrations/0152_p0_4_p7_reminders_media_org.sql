ALTER TABLE mailing_logs_webapp
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE material_ratings
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE media_files
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE media_folders
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE media_hls_proxy_error_events
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE media_playback_client_events
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE media_playback_resolution_events
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE media_playback_user_video_first_resolve
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE media_transcode_jobs
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE media_upload_sessions
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE message_log
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE notification_delivery_attempts
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE operator_health_failure_archive
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE patient_content_rating_feedback
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE product_analytics_events_recent
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE product_analytics_user_hourly
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE product_push_notifications
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE reminder_delivery_events
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE reminder_journal
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE reminder_occurrence_history
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE reminder_rules
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE user_subscriptions_webapp
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE webapp_reminder_occurrences
  ADD COLUMN IF NOT EXISTS organization_id uuid;

CREATE INDEX IF NOT EXISTS idx_mailing_logs_webapp_organization_id
  ON mailing_logs_webapp USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_material_ratings_organization_id
  ON material_ratings USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_media_files_organization_id
  ON media_files USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_media_folders_organization_id
  ON media_folders USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_media_hls_proxy_error_events_organization_id
  ON media_hls_proxy_error_events USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_media_playback_client_events_organization_id
  ON media_playback_client_events USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_media_playback_resolution_events_organization_id
  ON media_playback_resolution_events USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_media_playback_user_video_first_resolve_org
  ON media_playback_user_video_first_resolve USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_media_transcode_jobs_organization_id
  ON media_transcode_jobs USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_media_upload_sessions_organization_id
  ON media_upload_sessions USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_message_log_organization_id
  ON message_log USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_notification_delivery_attempts_organization_id
  ON notification_delivery_attempts USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_operator_health_failure_archive_organization_id
  ON operator_health_failure_archive USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_pcrf_organization_id
  ON patient_content_rating_feedback USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_product_analytics_events_recent_organization_id
  ON product_analytics_events_recent USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_product_analytics_user_hourly_organization_id
  ON product_analytics_user_hourly USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_product_push_notifications_organization_id
  ON product_push_notifications USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_reminder_delivery_events_organization_id
  ON reminder_delivery_events USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_reminder_journal_organization_id
  ON reminder_journal USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_reminder_occurrence_history_organization_id
  ON reminder_occurrence_history USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_reminder_rules_organization_id
  ON reminder_rules USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_webapp_organization_id
  ON user_subscriptions_webapp USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_webapp_reminder_occurrences_organization_id
  ON webapp_reminder_occurrences USING btree (organization_id);

DO $$
DECLARE
  v_table_name text;
  v_constraint_name text;
BEGIN
  FOREACH v_table_name IN ARRAY ARRAY[
    'mailing_logs_webapp',
    'material_ratings',
    'media_files',
    'media_folders',
    'media_hls_proxy_error_events',
    'media_playback_client_events',
    'media_playback_resolution_events',
    'media_playback_user_video_first_resolve',
    'media_transcode_jobs',
    'media_upload_sessions',
    'message_log',
    'notification_delivery_attempts',
    'operator_health_failure_archive',
    'patient_content_rating_feedback',
    'product_analytics_events_recent',
    'product_analytics_user_hourly',
    'product_push_notifications',
    'reminder_delivery_events',
    'reminder_journal',
    'reminder_occurrence_history',
    'reminder_rules',
    'user_subscriptions_webapp',
    'webapp_reminder_occurrences'
  ]
  LOOP
    v_constraint_name := v_table_name || '_organization_id_fkey';

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = v_constraint_name
        AND conrelid = v_table_name::regclass
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (organization_id) REFERENCES be_organizations(id) ON DELETE CASCADE',
        v_table_name,
        v_constraint_name
      );
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE
  v_default_org_id constant uuid := 'a0000000-0000-4000-8000-000000000001';
  v_org_count integer;
  v_multi_user_count bigint;
BEGIN
  SELECT count(*)::integer
  INTO v_org_count
  FROM be_organizations
  WHERE id = v_default_org_id;

  IF v_org_count <> 1 THEN
    RAISE EXCEPTION 'P0.4.P7 expected default organization %, found %', v_default_org_id, v_org_count;
  END IF;

  WITH referenced_users(platform_user_id) AS (
    SELECT platform_user_id FROM message_log WHERE platform_user_id IS NOT NULL
    UNION SELECT user_id FROM material_ratings
    UNION SELECT patient_user_id FROM media_folders WHERE patient_user_id IS NOT NULL
    UNION SELECT created_by FROM media_folders WHERE created_by IS NOT NULL
    UNION SELECT uploaded_by FROM media_files WHERE uploaded_by IS NOT NULL
    UNION SELECT owner_user_id FROM media_upload_sessions
    UNION SELECT user_id FROM media_hls_proxy_error_events
    UNION SELECT user_id FROM media_playback_client_events
    UNION SELECT user_id FROM media_playback_resolution_events
    UNION SELECT user_id FROM media_playback_user_video_first_resolve
    UNION SELECT user_id FROM notification_delivery_attempts WHERE user_id IS NOT NULL
    UNION SELECT doctor_user_id FROM operator_health_failure_archive WHERE doctor_user_id IS NOT NULL
    UNION SELECT archived_by_user_id FROM operator_health_failure_archive WHERE archived_by_user_id IS NOT NULL
    UNION SELECT user_id FROM patient_content_rating_feedback
    UNION SELECT user_id FROM product_analytics_events_recent WHERE user_id IS NOT NULL
    UNION SELECT user_id FROM product_analytics_user_hourly
    UNION SELECT user_id FROM product_push_notifications
    UNION SELECT platform_user_id FROM reminder_rules WHERE platform_user_id IS NOT NULL
    UNION SELECT platform_user_id FROM webapp_reminder_occurrences
  ), active_org_counts AS (
    SELECT
      refs.platform_user_id,
      count(DISTINCT orgs.organization_id) AS organization_count
    FROM referenced_users refs
    LEFT JOIN (
      SELECT platform_user_id, organization_id FROM org_enrollments WHERE status = 'active'
      UNION ALL
      SELECT platform_user_id, organization_id FROM be_organization_members WHERE status = 'active'
    ) orgs
      ON orgs.platform_user_id = refs.platform_user_id
    GROUP BY refs.platform_user_id
  )
  SELECT count(*)::bigint
  INTO v_multi_user_count
  FROM active_org_counts
  WHERE organization_count > 1;

  IF v_multi_user_count <> 0 THEN
    RAISE EXCEPTION 'P0.4.P7 expected no multi-org referenced users, found % user keys', v_multi_user_count;
  END IF;
END $$;

DO $$
DECLARE
  v_default_org_id constant uuid := 'a0000000-0000-4000-8000-000000000001';
BEGIN
  WITH RECURSIVE user_org AS (
    SELECT platform_user_id, (array_agg(DISTINCT organization_id))[1] AS organization_id
    FROM (
      SELECT platform_user_id, organization_id FROM org_enrollments WHERE status = 'active'
      UNION ALL
      SELECT platform_user_id, organization_id FROM be_organization_members WHERE status = 'active'
    ) orgs
    GROUP BY platform_user_id
    HAVING count(DISTINCT organization_id) = 1
  )
  UPDATE message_log target
  SET organization_id = COALESCE(user_org.organization_id, v_default_org_id)
  FROM message_log source
  LEFT JOIN user_org
    ON user_org.platform_user_id = source.platform_user_id
  WHERE target.organization_id IS NULL
    AND target.id = source.id;

  WITH RECURSIVE user_org AS (
    SELECT platform_user_id, (array_agg(DISTINCT organization_id))[1] AS organization_id
    FROM (
      SELECT platform_user_id, organization_id FROM org_enrollments WHERE status = 'active'
      UNION ALL
      SELECT platform_user_id, organization_id FROM be_organization_members WHERE status = 'active'
    ) orgs
    GROUP BY platform_user_id
    HAVING count(DISTINCT organization_id) = 1
  )
  UPDATE material_ratings target
  SET organization_id = COALESCE(user_org.organization_id, v_default_org_id)
  FROM material_ratings source
  LEFT JOIN user_org
    ON user_org.platform_user_id = source.user_id
  WHERE target.organization_id IS NULL
    AND target.id = source.id;

  WITH user_org AS (
    SELECT platform_user_id, (array_agg(DISTINCT organization_id))[1] AS organization_id
    FROM (
      SELECT platform_user_id, organization_id FROM org_enrollments WHERE status = 'active'
      UNION ALL
      SELECT platform_user_id, organization_id FROM be_organization_members WHERE status = 'active'
    ) orgs
    GROUP BY platform_user_id
    HAVING count(DISTINCT organization_id) = 1
  )
  UPDATE patient_content_rating_feedback target
  SET organization_id = COALESCE(user_org.organization_id, v_default_org_id)
  FROM patient_content_rating_feedback source
  LEFT JOIN user_org
    ON user_org.platform_user_id = source.user_id
  WHERE target.organization_id IS NULL
    AND target.id = source.id;

  WITH user_org AS (
    SELECT platform_user_id, (array_agg(DISTINCT organization_id))[1] AS organization_id
    FROM (
      SELECT platform_user_id, organization_id FROM org_enrollments WHERE status = 'active'
      UNION ALL
      SELECT platform_user_id, organization_id FROM be_organization_members WHERE status = 'active'
    ) orgs
    GROUP BY platform_user_id
    HAVING count(DISTINCT organization_id) = 1
  )
  UPDATE product_push_notifications target
  SET organization_id = COALESCE(user_org.organization_id, v_default_org_id)
  FROM product_push_notifications source
  LEFT JOIN user_org
    ON user_org.platform_user_id = source.user_id
  WHERE target.organization_id IS NULL
    AND target.id = source.id;

  WITH user_org AS (
    SELECT platform_user_id, (array_agg(DISTINCT organization_id))[1] AS organization_id
    FROM (
      SELECT platform_user_id, organization_id FROM org_enrollments WHERE status = 'active'
      UNION ALL
      SELECT platform_user_id, organization_id FROM be_organization_members WHERE status = 'active'
    ) orgs
    GROUP BY platform_user_id
    HAVING count(DISTINCT organization_id) = 1
  )
  UPDATE product_analytics_events_recent target
  SET organization_id = COALESCE(user_org.organization_id, v_default_org_id)
  FROM product_analytics_events_recent source
  LEFT JOIN user_org
    ON user_org.platform_user_id = source.user_id
  WHERE target.organization_id IS NULL
    AND target.id = source.id;

  WITH user_org AS (
    SELECT platform_user_id, (array_agg(DISTINCT organization_id))[1] AS organization_id
    FROM (
      SELECT platform_user_id, organization_id FROM org_enrollments WHERE status = 'active'
      UNION ALL
      SELECT platform_user_id, organization_id FROM be_organization_members WHERE status = 'active'
    ) orgs
    GROUP BY platform_user_id
    HAVING count(DISTINCT organization_id) = 1
  )
  UPDATE product_analytics_user_hourly target
  SET organization_id = COALESCE(user_org.organization_id, v_default_org_id)
  FROM product_analytics_user_hourly source
  LEFT JOIN user_org
    ON user_org.platform_user_id = source.user_id
  WHERE target.organization_id IS NULL
    AND target.bucket_hour = source.bucket_hour
    AND target.user_id = source.user_id
    AND target.entry_channel = source.entry_channel
    AND target.page_key = source.page_key;

  WITH user_org AS (
    SELECT platform_user_id, (array_agg(DISTINCT organization_id))[1] AS organization_id
    FROM (
      SELECT platform_user_id, organization_id FROM org_enrollments WHERE status = 'active'
      UNION ALL
      SELECT platform_user_id, organization_id FROM be_organization_members WHERE status = 'active'
    ) orgs
    GROUP BY platform_user_id
    HAVING count(DISTINCT organization_id) = 1
  )
  UPDATE operator_health_failure_archive target
  SET organization_id = COALESCE(doctor_org.organization_id, archived_by_org.organization_id, v_default_org_id)
  FROM operator_health_failure_archive source
  LEFT JOIN user_org doctor_org
    ON doctor_org.platform_user_id = source.doctor_user_id
  LEFT JOIN user_org archived_by_org
    ON archived_by_org.platform_user_id = source.archived_by_user_id
  WHERE target.organization_id IS NULL
    AND target.id = source.id;
END $$;

DO $$
DECLARE
  v_default_org_id constant uuid := 'a0000000-0000-4000-8000-000000000001';
BEGIN
  WITH RECURSIVE user_org AS (
    SELECT platform_user_id, (array_agg(DISTINCT organization_id))[1] AS organization_id
    FROM (
      SELECT platform_user_id, organization_id FROM org_enrollments WHERE status = 'active'
      UNION ALL
      SELECT platform_user_id, organization_id FROM be_organization_members WHERE status = 'active'
    ) orgs
    GROUP BY platform_user_id
    HAVING count(DISTINCT organization_id) = 1
  ), folder_seed AS (
    SELECT
      folder.id,
      folder.parent_id,
      COALESCE(patient_org.organization_id, created_by_org.organization_id, v_default_org_id) AS own_organization_id
    FROM media_folders folder
    LEFT JOIN user_org patient_org
      ON patient_org.platform_user_id = folder.patient_user_id
    LEFT JOIN user_org created_by_org
      ON created_by_org.platform_user_id = folder.created_by
  ), folder_tree AS (
    SELECT id, parent_id, own_organization_id AS organization_id
    FROM folder_seed
    WHERE parent_id IS NULL
    UNION ALL
    SELECT child.id, child.parent_id, COALESCE(parent.organization_id, child.own_organization_id)
    FROM folder_seed child
    JOIN folder_tree parent
      ON parent.id = child.parent_id
  )
  UPDATE media_folders target
  SET organization_id = folder_tree.organization_id
  FROM folder_tree
  WHERE target.organization_id IS NULL
    AND target.id = folder_tree.id;

  UPDATE media_folders
  SET organization_id = v_default_org_id
  WHERE organization_id IS NULL;

  WITH user_org AS (
    SELECT platform_user_id, (array_agg(DISTINCT organization_id))[1] AS organization_id
    FROM (
      SELECT platform_user_id, organization_id FROM org_enrollments WHERE status = 'active'
      UNION ALL
      SELECT platform_user_id, organization_id FROM be_organization_members WHERE status = 'active'
    ) orgs
    GROUP BY platform_user_id
    HAVING count(DISTINCT organization_id) = 1
  )
  UPDATE media_files target
  SET organization_id = COALESCE(folder.organization_id, uploaded_by_org.organization_id, v_default_org_id)
  FROM media_files source
  LEFT JOIN media_folders folder
    ON folder.id = source.folder_id
  LEFT JOIN user_org uploaded_by_org
    ON uploaded_by_org.platform_user_id = source.uploaded_by
  WHERE target.organization_id IS NULL
    AND target.id = source.id;

  UPDATE media_transcode_jobs target
  SET organization_id = COALESCE(media.organization_id, v_default_org_id)
  FROM media_files media
  WHERE target.organization_id IS NULL
    AND target.media_id = media.id;

  UPDATE media_transcode_jobs
  SET organization_id = v_default_org_id
  WHERE organization_id IS NULL;

  WITH user_org AS (
    SELECT platform_user_id, (array_agg(DISTINCT organization_id))[1] AS organization_id
    FROM (
      SELECT platform_user_id, organization_id FROM org_enrollments WHERE status = 'active'
      UNION ALL
      SELECT platform_user_id, organization_id FROM be_organization_members WHERE status = 'active'
    ) orgs
    GROUP BY platform_user_id
    HAVING count(DISTINCT organization_id) = 1
  )
  UPDATE media_upload_sessions target
  SET organization_id = COALESCE(media.organization_id, owner_org.organization_id, v_default_org_id)
  FROM media_upload_sessions source
  LEFT JOIN media_files media
    ON media.id = source.media_id
  LEFT JOIN user_org owner_org
    ON owner_org.platform_user_id = source.owner_user_id
  WHERE target.organization_id IS NULL
    AND target.id = source.id;

  WITH user_org AS (
    SELECT platform_user_id, (array_agg(DISTINCT organization_id))[1] AS organization_id
    FROM (
      SELECT platform_user_id, organization_id FROM org_enrollments WHERE status = 'active'
      UNION ALL
      SELECT platform_user_id, organization_id FROM be_organization_members WHERE status = 'active'
    ) orgs
    GROUP BY platform_user_id
    HAVING count(DISTINCT organization_id) = 1
  )
  UPDATE media_playback_resolution_events target
  SET organization_id = COALESCE(user_org.organization_id, media.organization_id, v_default_org_id)
  FROM media_playback_resolution_events source
  LEFT JOIN user_org
    ON user_org.platform_user_id = source.user_id
  LEFT JOIN media_files media
    ON media.id = source.media_id
  WHERE target.organization_id IS NULL
    AND target.id = source.id;

  WITH user_org AS (
    SELECT platform_user_id, (array_agg(DISTINCT organization_id))[1] AS organization_id
    FROM (
      SELECT platform_user_id, organization_id FROM org_enrollments WHERE status = 'active'
      UNION ALL
      SELECT platform_user_id, organization_id FROM be_organization_members WHERE status = 'active'
    ) orgs
    GROUP BY platform_user_id
    HAVING count(DISTINCT organization_id) = 1
  )
  UPDATE media_playback_user_video_first_resolve target
  SET organization_id = COALESCE(user_org.organization_id, media.organization_id, v_default_org_id)
  FROM media_playback_user_video_first_resolve source
  LEFT JOIN user_org
    ON user_org.platform_user_id = source.user_id
  LEFT JOIN media_files media
    ON media.id = source.media_id
  WHERE target.organization_id IS NULL
    AND target.user_id = source.user_id
    AND target.media_id = source.media_id;

  WITH user_org AS (
    SELECT platform_user_id, (array_agg(DISTINCT organization_id))[1] AS organization_id
    FROM (
      SELECT platform_user_id, organization_id FROM org_enrollments WHERE status = 'active'
      UNION ALL
      SELECT platform_user_id, organization_id FROM be_organization_members WHERE status = 'active'
    ) orgs
    GROUP BY platform_user_id
    HAVING count(DISTINCT organization_id) = 1
  )
  UPDATE media_playback_client_events target
  SET organization_id = COALESCE(user_org.organization_id, media.organization_id, v_default_org_id)
  FROM media_playback_client_events source
  LEFT JOIN user_org
    ON user_org.platform_user_id = source.user_id
  LEFT JOIN media_files media
    ON media.id = source.media_id
  WHERE target.organization_id IS NULL
    AND target.id = source.id;

  WITH user_org AS (
    SELECT platform_user_id, (array_agg(DISTINCT organization_id))[1] AS organization_id
    FROM (
      SELECT platform_user_id, organization_id FROM org_enrollments WHERE status = 'active'
      UNION ALL
      SELECT platform_user_id, organization_id FROM be_organization_members WHERE status = 'active'
    ) orgs
    GROUP BY platform_user_id
    HAVING count(DISTINCT organization_id) = 1
  )
  UPDATE media_hls_proxy_error_events target
  SET organization_id = COALESCE(user_org.organization_id, media.organization_id, v_default_org_id)
  FROM media_hls_proxy_error_events source
  LEFT JOIN user_org
    ON user_org.platform_user_id = source.user_id
  LEFT JOIN media_files media
    ON media.id = source.media_id
  WHERE target.organization_id IS NULL
    AND target.id = source.id;
END $$;

DO $$
DECLARE
  v_default_org_id constant uuid := 'a0000000-0000-4000-8000-000000000001';
BEGIN
  WITH user_org AS (
    SELECT platform_user_id, (array_agg(DISTINCT organization_id))[1] AS organization_id
    FROM (
      SELECT platform_user_id, organization_id FROM org_enrollments WHERE status = 'active'
      UNION ALL
      SELECT platform_user_id, organization_id FROM be_organization_members WHERE status = 'active'
    ) orgs
    GROUP BY platform_user_id
    HAVING count(DISTINCT organization_id) = 1
  ), integrator_user_org AS (
    SELECT
      platform_user.integrator_user_id,
      user_org.organization_id
    FROM platform_users platform_user
    JOIN user_org
      ON user_org.platform_user_id = platform_user.id
    WHERE platform_user.integrator_user_id IS NOT NULL
  )
  UPDATE reminder_rules target
  SET organization_id = COALESCE(platform_org.organization_id, integrator_user_org.organization_id, v_default_org_id)
  FROM reminder_rules source
  LEFT JOIN user_org platform_org
    ON platform_org.platform_user_id = source.platform_user_id
  LEFT JOIN integrator_user_org
    ON integrator_user_org.integrator_user_id = source.integrator_user_id
  WHERE target.organization_id IS NULL
    AND target.id = source.id;

  WITH user_org AS (
    SELECT platform_user_id, (array_agg(DISTINCT organization_id))[1] AS organization_id
    FROM (
      SELECT platform_user_id, organization_id FROM org_enrollments WHERE status = 'active'
      UNION ALL
      SELECT platform_user_id, organization_id FROM be_organization_members WHERE status = 'active'
    ) orgs
    GROUP BY platform_user_id
    HAVING count(DISTINCT organization_id) = 1
  ), integrator_user_org AS (
    SELECT platform_user.integrator_user_id, user_org.organization_id
    FROM platform_users platform_user
    JOIN user_org
      ON user_org.platform_user_id = platform_user.id
    WHERE platform_user.integrator_user_id IS NOT NULL
  )
  UPDATE reminder_occurrence_history target
  SET organization_id = COALESCE(rule.organization_id, integrator_user_org.organization_id, v_default_org_id)
  FROM reminder_occurrence_history source
  LEFT JOIN reminder_rules rule
    ON rule.integrator_rule_id = source.integrator_rule_id
  LEFT JOIN integrator_user_org
    ON integrator_user_org.integrator_user_id = source.integrator_user_id
  WHERE target.organization_id IS NULL
    AND target.id = source.id;

  WITH user_org AS (
    SELECT platform_user_id, (array_agg(DISTINCT organization_id))[1] AS organization_id
    FROM (
      SELECT platform_user_id, organization_id FROM org_enrollments WHERE status = 'active'
      UNION ALL
      SELECT platform_user_id, organization_id FROM be_organization_members WHERE status = 'active'
    ) orgs
    GROUP BY platform_user_id
    HAVING count(DISTINCT organization_id) = 1
  ), integrator_user_org AS (
    SELECT platform_user.integrator_user_id, user_org.organization_id
    FROM platform_users platform_user
    JOIN user_org
      ON user_org.platform_user_id = platform_user.id
    WHERE platform_user.integrator_user_id IS NOT NULL
  )
  UPDATE reminder_delivery_events target
  SET organization_id = COALESCE(occurrence.organization_id, rule.organization_id, integrator_user_org.organization_id, v_default_org_id)
  FROM reminder_delivery_events source
  LEFT JOIN reminder_occurrence_history occurrence
    ON occurrence.integrator_occurrence_id = source.integrator_occurrence_id
  LEFT JOIN reminder_rules rule
    ON rule.integrator_rule_id = source.integrator_rule_id
  LEFT JOIN integrator_user_org
    ON integrator_user_org.integrator_user_id = source.integrator_user_id
  WHERE target.organization_id IS NULL
    AND target.id = source.id;

  UPDATE reminder_journal target
  SET organization_id = COALESCE(rule.organization_id, occurrence.organization_id, v_default_org_id)
  FROM reminder_journal source
  LEFT JOIN reminder_rules rule
    ON rule.id = source.rule_id
  LEFT JOIN reminder_occurrence_history occurrence
    ON occurrence.integrator_occurrence_id = source.occurrence_id
  WHERE target.organization_id IS NULL
    AND target.id = source.id;

  WITH user_org AS (
    SELECT platform_user_id, (array_agg(DISTINCT organization_id))[1] AS organization_id
    FROM (
      SELECT platform_user_id, organization_id FROM org_enrollments WHERE status = 'active'
      UNION ALL
      SELECT platform_user_id, organization_id FROM be_organization_members WHERE status = 'active'
    ) orgs
    GROUP BY platform_user_id
    HAVING count(DISTINCT organization_id) = 1
  )
  UPDATE webapp_reminder_occurrences target
  SET organization_id = COALESCE(rule.organization_id, user_org.organization_id, v_default_org_id)
  FROM webapp_reminder_occurrences source
  LEFT JOIN reminder_rules rule
    ON rule.integrator_rule_id = source.integrator_rule_id
  LEFT JOIN user_org
    ON user_org.platform_user_id = source.platform_user_id
  WHERE target.organization_id IS NULL
    AND target.id = source.id;
END $$;

DO $$
DECLARE
  v_default_org_id constant uuid := 'a0000000-0000-4000-8000-000000000001';
BEGIN
  WITH user_org AS (
    SELECT platform_user_id, (array_agg(DISTINCT organization_id))[1] AS organization_id
    FROM (
      SELECT platform_user_id, organization_id FROM org_enrollments WHERE status = 'active'
      UNION ALL
      SELECT platform_user_id, organization_id FROM be_organization_members WHERE status = 'active'
    ) orgs
    GROUP BY platform_user_id
    HAVING count(DISTINCT organization_id) = 1
  ), integrator_user_org AS (
    SELECT
      platform_user.integrator_user_id::text AS integrator_user_id,
      user_org.organization_id
    FROM platform_users platform_user
    JOIN user_org
      ON user_org.platform_user_id = platform_user.id
    WHERE platform_user.integrator_user_id IS NOT NULL
  )
  UPDATE mailing_logs_webapp target
  SET organization_id = COALESCE(integrator_user_org.organization_id, v_default_org_id)
  FROM mailing_logs_webapp source
  LEFT JOIN integrator_user_org
    ON integrator_user_org.integrator_user_id = source.integrator_user_id::text
  WHERE target.organization_id IS NULL
    AND target.id = source.id;

  WITH user_org AS (
    SELECT platform_user_id, (array_agg(DISTINCT organization_id))[1] AS organization_id
    FROM (
      SELECT platform_user_id, organization_id FROM org_enrollments WHERE status = 'active'
      UNION ALL
      SELECT platform_user_id, organization_id FROM be_organization_members WHERE status = 'active'
    ) orgs
    GROUP BY platform_user_id
    HAVING count(DISTINCT organization_id) = 1
  ), integrator_user_org AS (
    SELECT platform_user.integrator_user_id::text AS integrator_user_id, user_org.organization_id
    FROM platform_users platform_user
    JOIN user_org
      ON user_org.platform_user_id = platform_user.id
    WHERE platform_user.integrator_user_id IS NOT NULL
  )
  UPDATE user_subscriptions_webapp target
  SET organization_id = COALESCE(integrator_user_org.organization_id, v_default_org_id)
  FROM user_subscriptions_webapp source
  LEFT JOIN integrator_user_org
    ON integrator_user_org.integrator_user_id = source.integrator_user_id::text
  WHERE target.organization_id IS NULL
    AND target.id = source.id;

  WITH user_org AS (
    SELECT platform_user_id, (array_agg(DISTINCT organization_id))[1] AS organization_id
    FROM (
      SELECT platform_user_id, organization_id FROM org_enrollments WHERE status = 'active'
      UNION ALL
      SELECT platform_user_id, organization_id FROM be_organization_members WHERE status = 'active'
    ) orgs
    GROUP BY platform_user_id
    HAVING count(DISTINCT organization_id) = 1
  ), integrator_user_org AS (
    SELECT platform_user.integrator_user_id::text AS integrator_user_id, user_org.organization_id
    FROM platform_users platform_user
    JOIN user_org
      ON user_org.platform_user_id = platform_user.id
    WHERE platform_user.integrator_user_id IS NOT NULL
  )
  UPDATE notification_delivery_attempts target
  SET organization_id = COALESCE(
    direct_user_org.organization_id,
    occurrence.organization_id,
    integrator_user_org.organization_id,
    v_default_org_id
  )
  FROM notification_delivery_attempts source
  LEFT JOIN user_org direct_user_org
    ON direct_user_org.platform_user_id = source.user_id
  LEFT JOIN webapp_reminder_occurrences occurrence
    ON occurrence.id = source.occurrence_id
  LEFT JOIN integrator_user_org
    ON source.integrator_user_id ~ '^[0-9]+$'
   AND integrator_user_org.integrator_user_id = source.integrator_user_id
  WHERE target.organization_id IS NULL
    AND target.id = source.id;
END $$;

DO $$
DECLARE
  v_null_count bigint;
  v_mismatch_count bigint;
BEGIN
  SELECT sum(null_rows)
  INTO v_null_count
  FROM (
    SELECT count(*) FILTER (WHERE organization_id IS NULL) AS null_rows FROM mailing_logs_webapp
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM material_ratings
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM media_files
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM media_folders
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM media_hls_proxy_error_events
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM media_playback_client_events
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM media_playback_resolution_events
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM media_playback_user_video_first_resolve
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM media_transcode_jobs
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM media_upload_sessions
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM message_log
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM notification_delivery_attempts
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM operator_health_failure_archive
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM patient_content_rating_feedback
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM product_analytics_events_recent
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM product_analytics_user_hourly
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM product_push_notifications
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM reminder_delivery_events
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM reminder_journal
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM reminder_occurrence_history
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM reminder_rules
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM user_subscriptions_webapp
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM webapp_reminder_occurrences
  ) checks;

  IF v_null_count <> 0 THEN
    RAISE EXCEPTION 'P0.4.P7 expected no NULL organization_id rows, found %', v_null_count;
  END IF;

  WITH mismatches AS (
    SELECT count(*) AS mismatch_count
    FROM media_folders child
    JOIN media_folders parent
      ON parent.id = child.parent_id
    WHERE child.organization_id IS DISTINCT FROM parent.organization_id
    UNION ALL
    SELECT count(*)
    FROM media_files child
    JOIN media_folders parent
      ON parent.id = child.folder_id
    WHERE child.organization_id IS DISTINCT FROM parent.organization_id
    UNION ALL
    SELECT count(*)
    FROM media_transcode_jobs child
    JOIN media_files parent
      ON parent.id = child.media_id
    WHERE child.organization_id IS DISTINCT FROM parent.organization_id
    UNION ALL
    SELECT count(*)
    FROM media_upload_sessions child
    JOIN media_files parent
      ON parent.id = child.media_id
    WHERE child.organization_id IS DISTINCT FROM parent.organization_id
    UNION ALL
    SELECT count(*)
    FROM media_playback_client_events child
    JOIN media_files parent
      ON parent.id = child.media_id
    WHERE child.organization_id IS DISTINCT FROM parent.organization_id
    UNION ALL
    SELECT count(*)
    FROM media_playback_resolution_events child
    JOIN media_files parent
      ON parent.id = child.media_id
    WHERE child.organization_id IS DISTINCT FROM parent.organization_id
    UNION ALL
    SELECT count(*)
    FROM media_playback_user_video_first_resolve child
    JOIN media_files parent
      ON parent.id = child.media_id
    WHERE child.organization_id IS DISTINCT FROM parent.organization_id
    UNION ALL
    SELECT count(*)
    FROM media_hls_proxy_error_events child
    JOIN media_files parent
      ON parent.id = child.media_id
    WHERE child.organization_id IS DISTINCT FROM parent.organization_id
    UNION ALL
    SELECT count(*)
    FROM reminder_occurrence_history child
    JOIN reminder_rules parent
      ON parent.integrator_rule_id = child.integrator_rule_id
    WHERE child.organization_id IS DISTINCT FROM parent.organization_id
    UNION ALL
    SELECT count(*)
    FROM reminder_delivery_events child
    JOIN reminder_rules parent
      ON parent.integrator_rule_id = child.integrator_rule_id
    WHERE child.organization_id IS DISTINCT FROM parent.organization_id
    UNION ALL
    SELECT count(*)
    FROM reminder_journal child
    JOIN reminder_rules parent
      ON parent.id = child.rule_id
    WHERE child.organization_id IS DISTINCT FROM parent.organization_id
    UNION ALL
    SELECT count(*)
    FROM webapp_reminder_occurrences child
    JOIN reminder_rules parent
      ON parent.integrator_rule_id = child.integrator_rule_id
    WHERE child.organization_id IS DISTINCT FROM parent.organization_id
    UNION ALL
    SELECT count(*)
    FROM notification_delivery_attempts child
    JOIN webapp_reminder_occurrences parent
      ON parent.id = child.occurrence_id
    WHERE child.organization_id IS DISTINCT FROM parent.organization_id
  )
  SELECT sum(mismatch_count)::bigint
  INTO v_mismatch_count
  FROM mismatches;

  IF v_mismatch_count <> 0 THEN
    RAISE EXCEPTION 'P0.4.P7 expected no child/parent org mismatches, found %', v_mismatch_count;
  END IF;
END $$;

-- TEMPORARY LOCAL MIGRATION NUMBER 0275 — the lead assigns the final number at merge.
-- #1069 stages 1–2: courses and CMS pages are capabilities, not numeric quotas.

DROP TRIGGER IF EXISTS courses_snapshot_quota_guard ON public.courses;
DROP FUNCTION IF EXISTS app.enforce_courses_snapshot_quota();
--> statement-breakpoint

DROP TRIGGER IF EXISTS content_pages_snapshot_quota_guard ON public.content_pages;
DROP FUNCTION IF EXISTS app.enforce_cms_pages_snapshot_quota();
DROP FUNCTION IF EXISTS app.cms_pages_snapshot_usage(uuid);
--> statement-breakpoint

-- Keep the only stage-1/2 generic number (file volume). Specialist seats are stored separately
-- in included_seats / seat_limit_override, never in the generic quota JSON.
UPDATE public.saas_tariffs
SET quotas = COALESCE(quotas, '{}'::jsonb) - ARRAY[
  'booking',
  'exercise_catalog',
  'exercise_packages',
  'courses',
  'cms_pages',
  'patient_card',
  'subscriptions',
  'payments',
  'mailings',
  'patient_app',
  'patient_app_paid_subscription',
  'branding',
  'custom_domain',
  'clinic_team'
];
--> statement-breakpoint

UPDATE public.saas_org_entitlement_overrides
SET quota = NULL
WHERE mechanic <> 'files' AND quota IS NOT NULL;

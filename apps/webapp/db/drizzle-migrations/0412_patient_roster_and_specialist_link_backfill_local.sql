-- BCB-MIGRATION-BACKFILL
-- TEMPORARY LOCAL MIGRATION NUMBER 0412
-- Existing post-SaaS appointments may have been imported after the original one-time enrollment
-- seed. Converge the clinic roster and the dormant patient↔specialist access links from the same
-- canonical appointment facts before the visibility predicate is connected to live reads.

INSERT INTO public.org_enrollments (organization_id, platform_user_id, status)
SELECT DISTINCT
  appointment.organization_id,
  appointment.platform_user_id,
  'active'
FROM public.be_appointments AS appointment
INNER JOIN public.platform_users AS patient
  ON patient.id = appointment.platform_user_id
WHERE appointment.platform_user_id IS NOT NULL
  AND appointment.deleted_at IS NULL
  AND patient.role = 'client'
  AND patient.merged_into_id IS NULL
  AND COALESCE(patient.is_archived, false) = false
ON CONFLICT (organization_id, platform_user_id) DO NOTHING;

INSERT INTO public.patient_specialist_links (
  organization_id,
  patient_user_id,
  specialist_id,
  status,
  created_via
)
SELECT DISTINCT
  appointment.organization_id,
  appointment.platform_user_id,
  appointment.specialist_id,
  'active',
  'first_appointment'
FROM public.be_appointments AS appointment
INNER JOIN public.platform_users AS patient
  ON patient.id = appointment.platform_user_id
INNER JOIN public.be_specialists AS specialist
  ON specialist.id = appointment.specialist_id
 AND specialist.organization_id = appointment.organization_id
WHERE appointment.platform_user_id IS NOT NULL
  AND appointment.specialist_id IS NOT NULL
  AND appointment.deleted_at IS NULL
  AND patient.role = 'client'
  AND patient.merged_into_id IS NULL
ON CONFLICT (patient_user_id, specialist_id) WHERE status = 'active' DO NOTHING;

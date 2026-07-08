UPDATE be_clinic_services cs
SET buffer_after_minutes = s.break_after_minutes,
    updated_at = now()
FROM booking_services s
WHERE cs.organization_id = 'a0000000-0000-4000-8000-000000000001'::uuid
  AND cs.title = s.title
  AND cs.duration_minutes = s.duration_minutes
  AND cs.buffer_after_minutes IS DISTINCT FROM s.break_after_minutes;

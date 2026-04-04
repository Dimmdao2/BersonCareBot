-- Stage 1 seed: explicit Moscow for known Rubitime branch; optional meta_json-driven mapping.
-- meta_json key (Rubitime «Местное время» UI offset, hours relative to Moscow): rubitime_local_time_offset
-- Values -1..+9 → IANA per docs/TIMEZONE_UTC_NORMALIZATION/MASTER_PLAN.md
-- Idempotent: offset-based updates only touch rows still at schema default timezone.

UPDATE branches
SET timezone = 'Europe/Moscow', updated_at = now()
WHERE integrator_branch_id = 17356;

UPDATE booking_branches
SET timezone = 'Europe/Moscow', updated_at = now()
WHERE rubitime_branch_id = '17356';

UPDATE branches b
SET timezone = m.iana, updated_at = now()
FROM (VALUES
  (-1, 'Europe/Kaliningrad'),
  (0, 'Europe/Moscow'),
  (1, 'Europe/Samara'),
  (2, 'Asia/Yekaterinburg'),
  (3, 'Asia/Omsk'),
  (4, 'Asia/Krasnoyarsk'),
  (5, 'Asia/Irkutsk'),
  (6, 'Asia/Yakutsk'),
  (7, 'Asia/Vladivostok'),
  (8, 'Asia/Magadan'),
  (9, 'Asia/Kamchatka')
) AS m(offset_hours, iana)
WHERE b.timezone = 'Europe/Moscow'
  AND (b.meta_json->>'rubitime_local_time_offset') IS NOT NULL
  AND (b.meta_json->>'rubitime_local_time_offset') ~ '^-?[0-9]+$'
  AND (b.meta_json->>'rubitime_local_time_offset')::integer = m.offset_hours;

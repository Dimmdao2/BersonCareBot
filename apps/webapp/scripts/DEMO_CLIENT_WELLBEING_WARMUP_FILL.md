# Demo Client Fill (dev)

Цель: заполнить для `Demo Client` 2 недели данных (прошлая + текущая до сегодня) по:
- общему самочувствию (`general_wellbeing`, 2-5 записей в день, с пропусками),
- выполнениям разминок (`patient_practice_completions`),
- самочувствию после разминки (`warmup_feeling` в `symptom_entries`),
- расписанию напоминаний (`reminder_rules`, `slots_v1`).

## Кого заполняем

- `platform_users.id = 3d54ecbf-2208-454c-9a39-c6db39a73e58` (`Demo Client`)
- Диапазон: `2026-04-27` .. `2026-05-09` (включительно)

## 1) Снимок БД перед изменениями

```bash
cd /home/dev/dev-projects/BersonCareBot
mkdir -p .tmp/db-backups

set -a && source apps/webapp/.env.dev && set +a
pg_dump "$DATABASE_URL" -Fc -f ".tmp/db-backups/webapp-dev-before-demo-seed-$(date +%Y%m%d-%H%M%S).dump"

set -a && source .env && set +a
pg_dump "$DATABASE_URL" -Fc -f ".tmp/db-backups/integrator-dev-before-demo-seed-$(date +%Y%m%d-%H%M%S).dump"
```

## 2) Заполнение (идемпотентно для напоминаний, диапазон данных очищается и вставляется заново)

```bash
cd /home/dev/dev-projects/BersonCareBot
set -a && source apps/webapp/.env.dev && set +a
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;

-- Ensure service trackings
INSERT INTO public.symptom_trackings (
  user_id, platform_user_id, symptom_key, symptom_title, is_active, updated_at, symptom_type_ref_id,
  region_ref_id, side, diagnosis_text, diagnosis_ref_id, stage_ref_id
)
SELECT
  '3d54ecbf-2208-454c-9a39-c6db39a73e58'::text,
  '3d54ecbf-2208-454c-9a39-c6db39a73e58'::uuid,
  'general_wellbeing',
  'Общее самочувствие',
  true,
  now(),
  '9ca01692-5dbd-4b75-b4cc-9b75a7478c0c'::uuid,
  NULL, NULL, NULL, NULL, NULL
WHERE NOT EXISTS (
  SELECT 1
  FROM public.symptom_trackings
  WHERE platform_user_id = '3d54ecbf-2208-454c-9a39-c6db39a73e58'::uuid
    AND symptom_key = 'general_wellbeing'
    AND is_active
);

INSERT INTO public.symptom_trackings (
  user_id, platform_user_id, symptom_key, symptom_title, is_active, updated_at, symptom_type_ref_id,
  region_ref_id, side, diagnosis_text, diagnosis_ref_id, stage_ref_id
)
SELECT
  '3d54ecbf-2208-454c-9a39-c6db39a73e58'::text,
  '3d54ecbf-2208-454c-9a39-c6db39a73e58'::uuid,
  'warmup_feeling',
  'Самочувствие после разминки',
  true,
  now(),
  '096cd375-4706-4912-ba54-5fd2657ca9a3'::uuid,
  NULL, NULL, NULL, NULL, NULL
WHERE NOT EXISTS (
  SELECT 1
  FROM public.symptom_trackings
  WHERE platform_user_id = '3d54ecbf-2208-454c-9a39-c6db39a73e58'::uuid
    AND symptom_key = 'warmup_feeling'
    AND is_active
);

-- Reset target range
WITH tr AS (
  SELECT id
  FROM public.symptom_trackings
  WHERE platform_user_id = '3d54ecbf-2208-454c-9a39-c6db39a73e58'::uuid
    AND symptom_key IN ('general_wellbeing', 'warmup_feeling')
)
DELETE FROM public.symptom_entries se
WHERE se.platform_user_id = '3d54ecbf-2208-454c-9a39-c6db39a73e58'::uuid
  AND se.recorded_at >= '2026-04-27T00:00:00+03'::timestamptz
  AND se.recorded_at < '2026-05-10T00:00:00+03'::timestamptz
  AND (se.tracking_id IN (SELECT id FROM tr) OR se.patient_practice_completion_id IS NOT NULL);

DELETE FROM public.patient_practice_completions
WHERE user_id = '3d54ecbf-2208-454c-9a39-c6db39a73e58'::uuid
  AND completed_at >= '2026-04-27T00:00:00+03'::timestamptz
  AND completed_at < '2026-05-10T00:00:00+03'::timestamptz
  AND source = 'daily_warmup';

-- Warmup completions + linked warmup feeling
WITH warmup_plan(completed_at, feeling) AS (
  VALUES
    ('2026-04-27T09:02:00+03'::timestamptz, 3),
    ('2026-04-27T19:18:00+03'::timestamptz, 5),
    ('2026-04-28T10:11:00+03'::timestamptz, 1),
    ('2026-04-29T08:47:00+03'::timestamptz, 5),
    ('2026-04-30T09:25:00+03'::timestamptz, 3),
    ('2026-04-30T20:06:00+03'::timestamptz, 1),
    ('2026-05-01T08:58:00+03'::timestamptz, 5),
    ('2026-05-03T10:14:00+03'::timestamptz, 3),
    ('2026-05-03T18:41:00+03'::timestamptz, 5),
    ('2026-05-04T09:07:00+03'::timestamptz, 5),
    ('2026-05-04T19:11:00+03'::timestamptz, 3),
    ('2026-05-05T08:39:00+03'::timestamptz, 3),
    ('2026-05-07T09:13:00+03'::timestamptz, 1),
    ('2026-05-07T18:52:00+03'::timestamptz, 3),
    ('2026-05-09T10:08:00+03'::timestamptz, 5)
),
inserted AS (
  INSERT INTO public.patient_practice_completions (id, user_id, content_page_id, completed_at, source, feeling, notes)
  SELECT
    gen_random_uuid(),
    '3d54ecbf-2208-454c-9a39-c6db39a73e58'::uuid,
    '29d140bd-549c-45d4-9d84-2651278d2f4c'::uuid,
    wp.completed_at,
    'daily_warmup',
    wp.feeling,
    ''
  FROM warmup_plan wp
  RETURNING id, completed_at, feeling
),
warmup_tracking AS (
  SELECT id
  FROM public.symptom_trackings
  WHERE platform_user_id = '3d54ecbf-2208-454c-9a39-c6db39a73e58'::uuid
    AND symptom_key = 'warmup_feeling'
  ORDER BY updated_at DESC
  LIMIT 1
)
INSERT INTO public.symptom_entries (
  id, user_id, tracking_id, value_0_10, entry_type, recorded_at, source, notes, created_at,
  platform_user_id, patient_practice_completion_id
)
SELECT
  gen_random_uuid(),
  '3d54ecbf-2208-454c-9a39-c6db39a73e58'::text,
  wt.id,
  i.feeling,
  'instant',
  i.completed_at,
  'webapp',
  NULL,
  now(),
  '3d54ecbf-2208-454c-9a39-c6db39a73e58'::uuid,
  i.id
FROM inserted i
CROSS JOIN warmup_tracking wt;

-- General wellbeing entries
WITH general_plan(recorded_at, score) AS (
  VALUES
    ('2026-04-27T08:34:00+03'::timestamptz, 3),
    ('2026-04-27T14:06:00+03'::timestamptz, 4),
    ('2026-04-27T21:24:00+03'::timestamptz, 3),
    ('2026-04-28T09:22:00+03'::timestamptz, 2),
    ('2026-04-28T20:18:00+03'::timestamptz, 3),
    ('2026-04-29T13:19:00+03'::timestamptz, 4),
    ('2026-04-30T07:58:00+03'::timestamptz, 3),
    ('2026-04-30T11:44:00+03'::timestamptz, 2),
    ('2026-04-30T16:31:00+03'::timestamptz, 3),
    ('2026-04-30T22:02:00+03'::timestamptz, 2),
    ('2026-05-01T10:02:00+03'::timestamptz, 4),
    ('2026-05-01T19:47:00+03'::timestamptz, 4),
    ('2026-05-03T09:40:00+03'::timestamptz, 3),
    ('2026-05-03T20:35:00+03'::timestamptz, 4),
    ('2026-05-04T08:19:00+03'::timestamptz, 4),
    ('2026-05-04T14:51:00+03'::timestamptz, 3),
    ('2026-05-04T21:08:00+03'::timestamptz, 4),
    ('2026-05-05T09:11:00+03'::timestamptz, 2),
    ('2026-05-05T20:42:00+03'::timestamptz, 3),
    ('2026-05-07T07:49:00+03'::timestamptz, 2),
    ('2026-05-07T11:56:00+03'::timestamptz, 3),
    ('2026-05-07T15:38:00+03'::timestamptz, 2),
    ('2026-05-07T18:22:00+03'::timestamptz, 3),
    ('2026-05-07T22:12:00+03'::timestamptz, 4),
    ('2026-05-08T08:27:00+03'::timestamptz, 3),
    ('2026-05-08T14:59:00+03'::timestamptz, 3),
    ('2026-05-08T21:01:00+03'::timestamptz, 2),
    ('2026-05-09T10:58:00+03'::timestamptz, 4),
    ('2026-05-09T19:17:00+03'::timestamptz, 4)
),
general_tracking AS (
  SELECT id
  FROM public.symptom_trackings
  WHERE platform_user_id = '3d54ecbf-2208-454c-9a39-c6db39a73e58'::uuid
    AND symptom_key = 'general_wellbeing'
  ORDER BY updated_at DESC
  LIMIT 1
)
INSERT INTO public.symptom_entries (
  id, user_id, tracking_id, value_0_10, entry_type, recorded_at, source, notes, created_at,
  platform_user_id, patient_practice_completion_id
)
SELECT
  gen_random_uuid(),
  '3d54ecbf-2208-454c-9a39-c6db39a73e58'::text,
  gt.id,
  gp.score,
  'instant',
  gp.recorded_at,
  'webapp',
  NULL,
  now(),
  '3d54ecbf-2208-454c-9a39-c6db39a73e58'::uuid,
  NULL
FROM general_plan gp
CROSS JOIN general_tracking gt;

-- Reminders
INSERT INTO public.reminder_rules (
  integrator_rule_id, platform_user_id, integrator_user_id, category, is_enabled, schedule_type, timezone,
  interval_minutes, window_start_minute, window_end_minute, days_mask, content_mode,
  linked_object_type, linked_object_id, custom_title, custom_text, schedule_data, reminder_intent,
  display_title, display_description, updated_at, created_at
)
VALUES
  (
    'demo-warmup-weekdays-v1-3d54ecbf',
    '3d54ecbf-2208-454c-9a39-c6db39a73e58'::uuid,
    COALESCE((SELECT integrator_user_id FROM public.platform_users WHERE id = '3d54ecbf-2208-454c-9a39-c6db39a73e58'::uuid), 990001::bigint),
    'lfk',
    true,
    'slots_v1',
    'Europe/Moscow',
    180,
    480,
    1320,
    '1111100',
    'none',
    NULL,
    NULL,
    NULL,
    NULL,
    '{"timesLocal":["09:00","14:00","20:00"],"dayFilter":"weekdays"}'::jsonb,
    'warmup',
    NULL,
    NULL,
    now(),
    now()
  ),
  (
    'demo-rehab-every2d-v1-3d54ecbf',
    '3d54ecbf-2208-454c-9a39-c6db39a73e58'::uuid,
    COALESCE((SELECT integrator_user_id FROM public.platform_users WHERE id = '3d54ecbf-2208-454c-9a39-c6db39a73e58'::uuid), 990001::bigint),
    'lfk',
    true,
    'slots_v1',
    'Europe/Moscow',
    1440,
    480,
    1320,
    '1111111',
    'none',
    'rehab_program',
    'demo-rehab-program',
    NULL,
    NULL,
    '{"timesLocal":["11:30"],"dayFilter":"every_n_days","everyNDays":2,"anchorDate":"2026-04-27"}'::jsonb,
    'exercises',
    'ЛФК программа',
    'Напоминание о программе через день',
    now(),
    now()
  )
ON CONFLICT (integrator_rule_id)
DO UPDATE SET
  platform_user_id = EXCLUDED.platform_user_id,
  integrator_user_id = EXCLUDED.integrator_user_id,
  category = EXCLUDED.category,
  is_enabled = EXCLUDED.is_enabled,
  schedule_type = EXCLUDED.schedule_type,
  timezone = EXCLUDED.timezone,
  interval_minutes = EXCLUDED.interval_minutes,
  window_start_minute = EXCLUDED.window_start_minute,
  window_end_minute = EXCLUDED.window_end_minute,
  days_mask = EXCLUDED.days_mask,
  content_mode = EXCLUDED.content_mode,
  linked_object_type = EXCLUDED.linked_object_type,
  linked_object_id = EXCLUDED.linked_object_id,
  custom_title = EXCLUDED.custom_title,
  custom_text = EXCLUDED.custom_text,
  schedule_data = EXCLUDED.schedule_data,
  reminder_intent = EXCLUDED.reminder_intent,
  display_title = EXCLUDED.display_title,
  display_description = EXCLUDED.display_description,
  updated_at = now();

COMMIT;
SQL
```

## 3) Быстрая проверка (дневные счётчики)

```bash
cd /home/dev/dev-projects/BersonCareBot
set -a && source apps/webapp/.env.dev && set +a
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "
WITH days AS (SELECT d::date AS day FROM generate_series('2026-04-27'::date,'2026-05-09'::date,'1 day') d),
gw AS (
  SELECT recorded_at::date AS day, count(*) AS cnt
  FROM public.symptom_entries se
  JOIN public.symptom_trackings st ON st.id=se.tracking_id
  WHERE se.platform_user_id='3d54ecbf-2208-454c-9a39-c6db39a73e58'::uuid
    AND st.symptom_key='general_wellbeing'
    AND se.recorded_at >= '2026-04-27'::date AND se.recorded_at < '2026-05-10'::date
  GROUP BY recorded_at::date
),
wf AS (
  SELECT completed_at::date AS day, count(*) AS cnt
  FROM public.patient_practice_completions
  WHERE user_id='3d54ecbf-2208-454c-9a39-c6db39a73e58'::uuid
    AND source='daily_warmup'
    AND completed_at >= '2026-04-27'::date AND completed_at < '2026-05-10'::date
  GROUP BY completed_at::date
)
SELECT to_char(days.day,'YYYY-MM-DD') AS day, COALESCE(gw.cnt,0) AS general_mood_entries, COALESCE(wf.cnt,0) AS warmups
FROM days
LEFT JOIN gw ON gw.day=days.day
LEFT JOIN wf ON wf.day=days.day
ORDER BY days.day;"
```

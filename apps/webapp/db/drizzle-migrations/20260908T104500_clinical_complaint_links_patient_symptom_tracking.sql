-- BCB-MIGRATION-OWNER: app_object_owner
-- BCB-MIGRATION-VERIFY: SELECT symptom_tracking_id FROM public.clinical_complaint LIMIT 1;
--
-- Жалоба врача получает durable-связь с ровно одним отслеживанием симптома пациента.
-- До этой миграции врачебная жалоба (`clinical_complaint`) и дневник пациента
-- (`symptom_trackings` / `symptom_entries`) были двумя несвязанными мирами: симптом, записанный
-- врачом в карте или на приёме, у пациента не появлялся вовсе. Связь ведётся по id, а не по
-- совпадению названия: одинаковый текст у двух жалоб — обычное дело, и склейка по нему выдавала бы
-- пациенту чужую историю.
--
-- Инвариант «одна жалоба — одно отслеживание» держится структурно: колонка одна (значит, у жалобы
-- не может быть двух отслеживаний), частичный уникальный индекс запрещает отдать одно отслеживание
-- двум жалобам. `ON DELETE SET NULL` — удаление строки дневника не должно уносить жалобу из карты.
--
-- Разбор прав: миграция меняет одну таблицу приложения (владелец `app_object_owner`) и добавляет
-- один индекс; новых функций и новых ролей нет. Рантайм-роль `app_staff` получает новую колонку в
-- своих колоночных INSERT/UPDATE-списках `public.clinical_complaint`, а также `organization_id` в
-- INSERT-списке `public.symptom_entries` (RLS этой таблицы требует от персонала совпадения
-- организации, иначе зеркальная запись severity отказывает 42501). Оба решения объявлены в
-- `deploy/postgres/privileges/declaration.ts` в этой же ветке. GRANT/REVOKE тут нет: права
-- приезжают шагом reconcile.
ALTER TABLE public.clinical_complaint
  ADD COLUMN IF NOT EXISTS symptom_tracking_id uuid;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
ALTER TABLE public.clinical_complaint
  DROP CONSTRAINT IF EXISTS clinical_complaint_symptom_tracking_id_fkey;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
ALTER TABLE public.clinical_complaint
  ADD CONSTRAINT clinical_complaint_symptom_tracking_id_fkey
  FOREIGN KEY (symptom_tracking_id) REFERENCES public.symptom_trackings(id) ON DELETE SET NULL;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
CREATE UNIQUE INDEX IF NOT EXISTS uq_clinical_complaint_symptom_tracking_id
  ON public.clinical_complaint (symptom_tracking_id)
  WHERE symptom_tracking_id IS NOT NULL;

--> statement-breakpoint
-- BCB-MIGRATION-BACKFILL
--
-- Существующие жалобы получают своё отслеживание. Идентификатор строки дневника выводится из id
-- жалобы (`md5(...)::uuid`), а не берётся случайным: тогда шаг идемпотентен — повторный прогон
-- ничего не задваивает, и связь восстановима без промежуточной таблицы соответствий.
--
-- `patient_tracking_enabled = false`: видимость нового отслеживания пациенту решает приложение из
-- режима арендатора (`patientSymptomTrackingDefault`) вместе с признаком сопровождения конкретного
-- пациента, а признак сопровождения — состояние на СЕГОДНЯ, а не на момент постановки жалобы.
-- Применять сегодняшнюю политику задним числом ко всей истории значит вытолкнуть пациентам старые
-- симптомы, которых никто не пересматривал. Поэтому исторические жалобы приезжают связанными и с
-- полной историей замеров, но скрытыми; врач включает нужные существующим переключателем во
-- вкладке дневника. Новые жалобы получают вычисленное приложением значение сразу.
--
-- Жалобы без `organization_id` (доSaaS-остатки) пропускаются: строка дневника принадлежит
-- арендатору, и приписать её наугад нельзя. Такая жалоба остаётся несвязанной, а связь заведёт
-- первая же запись severity под принципалом врача — тем же кодом, что и для новых жалоб.
INSERT INTO public.symptom_trackings (
  id, user_id, platform_user_id, organization_id, symptom_key, symptom_title,
  is_active, patient_tracking_enabled, created_at, updated_at
)
SELECT
  md5('clinical-complaint-symptom-tracking:' || complaint.id::text)::uuid,
  complaint.patient_user_id::text,
  complaint.patient_user_id,
  complaint.organization_id,
  NULL,
  complaint.text,
  complaint.status = 'active',
  false,
  complaint.created_at,
  complaint.created_at
FROM public.clinical_complaint AS complaint
WHERE complaint.symptom_tracking_id IS NULL
  AND complaint.organization_id IS NOT NULL
ON CONFLICT (id) DO NOTHING;

--> statement-breakpoint
-- BCB-MIGRATION-BACKFILL
UPDATE public.clinical_complaint AS complaint
SET symptom_tracking_id = tracking.id
FROM public.symptom_trackings AS tracking
WHERE complaint.symptom_tracking_id IS NULL
  AND tracking.id = md5('clinical-complaint-symptom-tracking:' || complaint.id::text)::uuid;

--> statement-breakpoint
-- BCB-MIGRATION-BACKFILL
--
-- История замеров жалобы переносится в дневник целиком и один раз: засеваем только те
-- отслеживания, у которых пока нет ни одной записи. `recorded_at` берётся из даты визита, если
-- обновление сделано на приёме, иначе из момента записи в карте — то же правило, что и у
-- зеркалирования вперёд. `source = 'import'`: это перенос, а не действие в интерфейсе.
INSERT INTO public.symptom_entries (
  user_id, platform_user_id, organization_id, tracking_id, value_0_10, entry_type,
  recorded_at, source, notes
)
SELECT
  complaint.patient_user_id::text,
  complaint.patient_user_id,
  complaint.organization_id,
  complaint.symptom_tracking_id,
  complaint_update.severity,
  'instant',
  COALESCE(visit.visited_at, complaint_update.created_at),
  'import',
  NULL
FROM public.clinical_complaint_update AS complaint_update
JOIN public.clinical_complaint AS complaint ON complaint.id = complaint_update.complaint_id
LEFT JOIN public.clinical_visit AS visit ON visit.id = complaint_update.visit_id
WHERE complaint.symptom_tracking_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.symptom_entries AS existing
    WHERE existing.tracking_id = complaint.symptom_tracking_id
  );

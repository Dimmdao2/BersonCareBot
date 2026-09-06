-- BCB-MIGRATION-OWNER: app_object_owner
-- BCB-MIGRATION-VERIFY: SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'be_appointments' AND column_name = 'overlap_confirmed_start_at') AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'be_appointments' AND column_name = 'overlap_confirmed_end_at') AND pg_catalog.pg_get_constraintdef((SELECT oid FROM pg_catalog.pg_constraint WHERE conname = 'be_appointments_specialist_no_overlap' AND conrelid = 'public.be_appointments'::regclass)) LIKE '%overlap_confirmed_start_at%' AND EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid = 'public.be_appointments'::regclass AND tgname = 'be_appointments_confirmed_overlap_occupancy_guard' AND tgfoid = 'public.enforce_be_appointments_confirmed_overlap_occupancy()'::regprocedure AND NOT tgisinternal)
--
-- ENCOUNTER-APPOINTMENT-05 (owner acceptance 2026-09-04, §P4.6): «Если на выбранное время уже
-- существует запись специалиста, до сохранения показано явное подтверждение конфликта. Отмена
-- подтверждения ничего не создаёт; явное согласие разрешает наложение.»
--
-- До этого шага согласие врача было НЕИСПОЛНИМО: `be_appointments_specialist_no_overlap`
-- запрещает любое пересечение записей одного специалиста, поэтому подтверждённая врачом запись
-- отбивалась базой (`23P01`) ровно так же, как случайная. Единственными способами дать согласие
-- работать оставались снятие защиты целиком или обход её вторым write-path — оба запрещены.
--
-- Признак живёт НА САМОЙ записи и назван ТЕМ САМЫМ слотом, для которого согласие было дано:
-- пара `overlap_confirmed_start_at` / `overlap_confirmed_end_at`. Предикат исключающего
-- ограничения выводит такую строку из-под своей пары, а DB-trigger под advisory-xact lock
-- оставляет её занятой для ЛЮБОЙ следующей обычной записи.
--
-- Почему пара времён, а не флаг: флаг пришлось бы гасить руками в КАЖДОМ пути, двигающем запись
-- (врачебный перенос на drizzle и оба пациентских корня на SQL), и забытый путь молча уносил бы
-- иммунитет на слот, которого никто не подтверждал. Совпадение с собственным временем строки
-- перевзводит защиту само: любой перенос делает пару отличной от нового времени, строка
-- возвращается под ограничение, и занятый слот отказывает обычным `23P01`. Ни один существующий
-- write-path для этого не меняется.
--
-- Защита НЕ снимается: обычная запись несёт `NULL` в обеих колонках, `IS DISTINCT FROM` даёт
-- TRUE, и она участвует в ограничении ровно как раньше. `NULL` в предикате частичного индекса
-- опасен только у `=`; `IS DISTINCT FROM` его не порождает. Одного predicate недостаточно для
-- асимметрии «B поверх A разрешена, но C поверх B без согласия запрещена»: B нельзя одновременно
-- исключить ради вставки и оставить в том же exclusion index. Поэтому обычный write дополнительно
-- проверяет совпавшую подтверждённую строку в единственном DB-trigger.
--
-- Права целиком принадлежат `deploy/postgres/privileges` (§1 «Миграция не выдаёт и не отзывает
-- права»); здесь только объекты.
ALTER TABLE public.be_appointments
  ADD COLUMN IF NOT EXISTS overlap_confirmed_start_at timestamptz,
  ADD COLUMN IF NOT EXISTS overlap_confirmed_end_at timestamptz;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
ALTER TABLE public.be_appointments
  DROP CONSTRAINT IF EXISTS be_appointments_specialist_no_overlap;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
-- Предикат воспроизводится ЦЕЛИКОМ (специалист, мягкое удаление, набор «живых» статусов) и
-- получает ровно один новый терм. Пересоздание не может добавить нарушений: каждый добавленный
-- терм только сужает множество проверяемых строк.
ALTER TABLE public.be_appointments
  ADD CONSTRAINT be_appointments_specialist_no_overlap
  EXCLUDE USING gist (
    specialist_id WITH =,
    tstzrange(start_at, end_at, '[)') WITH &&
  ) WHERE (
    specialist_id IS NOT NULL
    AND deleted_at IS NULL
    AND status <> ALL (ARRAY[
      'cancelled_by_patient'::text,
      'cancelled_by_specialist'::text,
      'late_cancellation'::text,
      'no_show'::text,
      'completed'::text,
      'visit_confirmed'::text
    ])
    AND (
      overlap_confirmed_start_at IS DISTINCT FROM start_at
      OR overlap_confirmed_end_at IS DISTINCT FROM end_at
    )
  );
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
-- BCB-MIGRATION-SCHEMA-CREATE: public
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- `be_appointments_specialist_no_overlap` продолжает сериализовать ordinary-vs-ordinary. Эта
-- SECURITY INVOKER trigger-function сериализует по specialist_id также confirmed-vs-later-ordinary:
-- пока подтверждённая B коммитится поверх A, C не может проскочить после отмены A, не увидев B.
CREATE OR REPLACE FUNCTION public.enforce_be_appointments_confirmed_overlap_occupancy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.specialist_id IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'be-appointments-specialist:' || NEW.specialist_id::text,
      0
    )
  );

  IF NEW.deleted_at IS NOT NULL
     OR NEW.status = ANY (ARRAY[
       'cancelled_by_patient'::text,
       'cancelled_by_specialist'::text,
       'late_cancellation'::text,
       'no_show'::text,
       'completed'::text,
       'visit_confirmed'::text
     ])
     OR (
       NEW.overlap_confirmed_start_at IS NOT DISTINCT FROM NEW.start_at
       AND NEW.overlap_confirmed_end_at IS NOT DISTINCT FROM NEW.end_at
     ) THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.be_appointments AS existing
     WHERE existing.id IS DISTINCT FROM NEW.id
       AND existing.organization_id = NEW.organization_id
       AND existing.specialist_id = NEW.specialist_id
       AND existing.deleted_at IS NULL
       AND existing.status <> ALL (ARRAY[
         'cancelled_by_patient'::text,
         'cancelled_by_specialist'::text,
         'late_cancellation'::text,
         'no_show'::text,
         'completed'::text,
         'visit_confirmed'::text
       ])
       AND existing.overlap_confirmed_start_at IS NOT DISTINCT FROM existing.start_at
       AND existing.overlap_confirmed_end_at IS NOT DISTINCT FROM existing.end_at
       AND pg_catalog.tstzrange(existing.start_at, existing.end_at, '[)')
           && pg_catalog.tstzrange(NEW.start_at, NEW.end_at, '[)')
  ) THEN
    RAISE EXCEPTION 'be_appointments_specialist_no_overlap'
      USING ERRCODE = '23P01',
            CONSTRAINT = 'be_appointments_specialist_no_overlap';
  END IF;

  RETURN NEW;
END;
$function$;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
CREATE TRIGGER be_appointments_confirmed_overlap_occupancy_guard
BEFORE INSERT OR UPDATE OF specialist_id, start_at, end_at, status, deleted_at,
  overlap_confirmed_start_at, overlap_confirmed_end_at
ON public.be_appointments
FOR EACH ROW
EXECUTE FUNCTION public.enforce_be_appointments_confirmed_overlap_occupancy();

-- BCB-MIGRATION-OWNER: app_object_owner
-- BCB-MIGRATION-VERIFY: SELECT NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE (table_schema, table_name, column_name) = ('public', 'patient_home_blocks', 'icon_image_url'))
--
-- Решение владельца 10.09.2026: иконки дизайна кабинета пациента живут в репозитории и грузятся
-- прямо из папки, настройки для них нет ни в кабинете доктора, ни в БД. Это продолжение решения
-- владельца 18.08.2026 по иконкам самочувствия («их из БД удалять и читать сразу из папки»).
--
-- Колонка уже была мёртвой ДО этой миграции: `resolvePatientHomeBlockLeadingIconUrl` отдавал
-- bundled-ассет первым, а настраиваемыми были ровно те пять блоков (sos, next_reminder, booking,
-- progress, plan), для которых bundled-ассет существует. То есть врач менял значение, а пациент
-- продолжал видеть иконку из `apps/webapp/public/patient/home/icons/`. Настройка выглядела
-- работающей и ничего не делала.
--
-- Вместе с колонкой уходят: пункт «Иконка блока» в настройках главной, `setPatientHomeBlockIcon`,
-- порт/сервис/репозиторий `setBlockIcon` и запись `patient-home.icon` в реестре защищённых действий.
-- Грант `UPDATE (icon_image_url)` роли `app_staff` снят из декларации прав в этой же ветке.

ALTER TABLE public.patient_home_blocks
  DROP COLUMN icon_image_url;

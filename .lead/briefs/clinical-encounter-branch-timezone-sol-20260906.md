# Worker brief: таймзона филиала на doctor-странице приёма

Ты worker в ветке `wt/clinical-encounter-page-20260906`. Это correction поверх `8cc2809c2`, `dac65449b` и
`7b0350f12`, а не новая поверхность.

До действий прочитай `AGENTS.md`: карту заголовков, §5, §10a, §10b, §16, §17, §21 и §24; затем полностью
`docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md` §34 и пункты `ENCOUNTER-PAGE-04/05/06/07/08/08A/08B/08C` в
`docs/_TODO/DOCTOR_MOBILE_UI_OWNER_ACCEPTANCE_2026-09-04.md`.

Источник оракула: `docs/_TODO/DOCTOR_MOBILE_UI_OWNER_ACCEPTANCE_2026-09-04.md` — «в кабинете доктора рядом не показываются ни UTC,».

## Поведение

- Приём, связанный с canonical appointment физического филиала, в doctor UI везде показывает дату и время по
  IANA-таймзоне именно `be_branches.timezone`: и в шапке страницы приёма, и в строке связанной записи.
- UI не использует timezone браузера, `app_display_timezone`, название филиала либо зашитую Москву как замену
  branch timezone. Один UTC instant в двух строках страницы обязан давать один branch-local день и час.
- В кабинете доктора НЕТ подписи `UTC`, красного `!` и сравнения с timezone устройства. Эти предупреждения —
  отдельное patient-only поведение и в doctor-компоненты не добавляются.
- `PatientAppointmentItem` получает typed поле IANA timezone филиала; `pgDoctorClients.listPatientAppointments`
  выбирает `br.timezone` из уже существующего JOIN и передаёт его в read-model.
- `Visit` получает достаточное typed timezone/instant представление, чтобы server read-model не форматировал
  связанный визит в глобальной app timezone. В `pgPatientClinical.listVisits` timezone берётся из branch связанной
  canonical appointment. Не создавай новый repository/API и не дублируй запрос, если можно расширить уже
  существующий проход по `canonicalAppointmentId`.
- Для визита/записи без филиала сохрани один явно определённый общий fallback. Он не должен называться таймзоной
  филиала или показывать предупреждение. Не меняй DB schema: canonical `be_branches.timezone` уже существует.
- Переиспользуй `displayZonePartsFromUtcInstant` либо существующую общую typed datetime-точку. Не создавай второй
  локальный formatter рядом с существующим без доказанной необходимости.

## Проверки

Расширь поведенческие tests так, чтобы они краснели при каждом независимом откате:

1. linked appointment снова форматируется browser-local;
2. visit header снова использует `app_display_timezone`, когда branch timezone отличается;
3. repository перестаёт передавать `br.timezone`;
4. branch timezone ошибочно заменена на hardcoded `Europe/Moscow`;
5. doctor UI начинает показывать `UTC`/`!`.

Не пиши тесты на строки исходника, CSS-классы либо факт импорта. Если для repository требуется unit test, проверяй
реальный mapped result/query contract существующим тестовым способом этого repository.

Разрешённый scope:

- `apps/webapp/src/modules/doctor-clients/ports.ts`
- `apps/webapp/src/infra/repos/pgDoctorClients.ts`
- `apps/webapp/src/infra/repos/pgDoctorClients.listPatientAppointments.unit.test.ts`
- `apps/webapp/src/modules/patient-clinical/ports.ts`
- `apps/webapp/src/infra/repos/pgPatientClinical.ts`
- существующие in-memory mirrors patient-clinical/doctor-clients, только если typecheck требует contract parity
- `apps/webapp/src/app/app/doctor/patients/[userId]/visits/EncounterPageClient.tsx`
- `apps/webapp/src/app/app/doctor/patients/[userId]/visits/EncounterPageClient.ui.test.tsx`
- один существующий shared datetime helper и его test только если его параметризация действительно устраняет
  дублирование; новый helper-файл не создавай.

Не меняй patient UI, schema/migrations/grants, unrelated calendar UI, модальный стек или clinical lists. Не запускай
full CI, общий dev-server, DB, TEST/PROD; не land и не push. Запусти targeted Vitest, webapp typecheck, scoped ESLint
и `git diff --check`. Закоммить только разрешённые пути явным `git add`. В финале перечисли закрытые ID, SHA и
точные проверки. Не заканчивай ход в ожидании фоновой команды.

# Слепой аудит: четыре корня публичной воронки записи (19.08.2026)

Ветка `wt/public-booking-roots-20260819`, миграция `0047_the_public_funnel_had_no_door_of_its_own.sql`.
Среда — только DEV (`bcb_webapp_dev`), вебапп из этого worktree на `127.0.0.1:5301`. Прод не затронут.

**ВЕРДИКТ: PASS для приземления.** Ни одного finding по §24.6.

Слепой kill-set составлен по `docs/_TODO/PUBLIC_BOOKING_TENANT_SERVICE_SEAM_2026-08-19.md` и решению
владельца о стенах ДО чтения реализации и тестов ветки.

## Чем доказано, а не чем заявлено

### 1. Чужая клиника — отказ приходит из тела функции

Предикат назван: в `app.resolve_public_booking_organization` это `s.organization_id = b.organization_id`.
Снятие предиката руками (запрос от имени `app_seam_public_booking_owner`, который проходит RLS по политике
`rev10_seam_business_34`) возвращает организацию по ЧУЖОЙ услуге; с предикатом — пусто:

    -- с предикатом: (пусто)   без предиката: {a0000000-…-01}
    филиал 54432236 (орг A) + услуга 7d9ec18a (орг D)

Живьём, с ВЫКЛЮЧЕННЫМИ прикладными стенами (временная инъекция в
`resolveSlugBoundPublicInPersonBookingOrganization`, принципал прибит к клинике-фикстуре, откачено):

| запрос | ответ |
| --- | --- |
| чужой филиал + чужая услуга | `400 branch_service_not_found` |
| чужой филиал + своя услуга | `400 branch_service_not_found` |
| свой филиал + чужая услуга | `400 branch_service_not_found` |
| свой филиал + своя услуга (контроль) | `200`, слоты есть |

Прикладной код в этих четырёх прогонах не участвовал — отказ дала дверь.

### 2. Неопубликованная клиника — главный незакрытый пункт, закрыт

Заведена фикстура: организация `e0000000-…-01` («DEV Isolated Clinic») с ПОЛНЫМ живым каталогом —
активный филиал, активная публично записываемая услуга, активный специалист, активная доступность,
рабочие часы, поля формы — и записью каталога `is_published = false`, слаг `audit-unpublished-clinic`.

A/B на ОДНОЙ И ТОЙ ЖЕ фикстуре, менялся ровно один флаг:

| | `is_published=false` | `is_published=true` |
| --- | --- | --- |
| `GET /api/booking/public/slots` | `400 ambiguous_booking_tenant` | `200`, слоты есть |
| `GET /book/audit-unpublished-clinic` | `404` | `200` |
| `GET /api/booking/public/form-fields` | `400` | `200`, поля есть |

С выключенными прикладными стенами (та же инъекция) и той же фикстурой: неопубликованная →
`400 branch_service_not_found` и `fields: []`; опубликованная → `200` со слотами и полями. То есть
проверку публикации держит САМА дверь, а не только слаговая стена перед ней.

### 3. Что уходит анониму — поле за полем

Экран выбора города (`/book/dmitryberson`): `cityCode`, `title`, `isActive`, `sortOrder`. Экран выбора
услуги: `id`, `title`, `description`, `durationMinutes`, `priceMinor` — и больше ничего. На проводе НЕТ:
ФИО сотрудника, `specialistId`, `roomId`, `adminManualOnly`, `publicWidgetVisible`, `bufferAfterMinutes`,
`prepaymentApplicable`, `usableInPackages`, `onlinePaymentApplicable`, `organizationId`.

Утечь ФИО не может конструктивно: владельцу шва выдан колоночный `SELECT` на `be_specialists` ровно из
трёх колонок — `id, is_active, organization_id`; колонки `full_name` у него нет вовсе.

Занятые интервалы и рабочие дни специалиста дверь снимка отдаёт серверу, но маршрут слотов кладёт на
провод только вычисленные `startAt/endAt` свободных слотов.

### 4. Класс контекста

Разделение классов держат гранты, а не соглашение (проверено живьём):

    app_pre_session    -> app.read_public_booking_catalog(…)        ERROR: permission denied
    app_pre_session    -> app.list_public_booking_form_fields()     ERROR: permission denied
    app_tenant_service -> app.resolve_public_booking_organization() ERROR: permission denied
    app_tenant_service -> app.read_public_booking_catalog(…)        ERROR: accepted organization context required

`app.require_accepted_context` требует точного совпадения `session_login + target_role + context_class +
purpose + typed_args_hash + function_identity` в ТОЙ ЖЕ транзакции того же бэкенда, а класс зашит в тело
двери литералом. Объявленные `typedArgs` совпадают с фактическими сигнатурами (`uuid,uuid` ×2,
`uuid,uuid,text,text`, `()`), что подтверждается работающими живыми вызовами.

### 5. Права — сверка декларации с кластером

Фактический `proacl` четырёх функций совпадает с `execute:` в `declaration.ts` ровно: владелец +
одна целевая роль, только `EXECUTE`. Ничего сверх.

Все новые табличные права ветки — КОЛОНОЧНЫЙ `SELECT` владельцу шва `app_seam_public_booking_owner`
по 12 таблицам, колонка в колонку с объявленными `relationSurfaces`. Ни одна рантайм-роль
(`app_staff`, `app_patient`, `app_tenant_service`, `app_pre_session`) не получила ничего; новых ролей нет;
`BYPASSRLS` нет; реляционная дверь класса `tenant_service` порту `webapp` не объявлена.

`function-census` (19), `port-context-catalog` (15), `port-context-callsite-catalog` (5) — зелёные.

### 6. Дублирование фильтра JS vs SQL — расхождения нет

Публичный путь больше не фильтрует в JS: `listPublicBookableServicesForBranch` берёт готовый список из
двери. Оставшийся JS-фильтр `listInPersonServicesForBranch` (пациентский путь) применяет тот же набор —
`isActive && publicWidgetVisible && !adminManualOnly && назначена активному специалисту в этом филиале`;
отличие одно и намеренное: необязательное сужение по `specialistId`, которого у публичного шага нет.

Матрица живой инъекции на фикстуре — каждый признак снят по одному, между снятиями контроль «зелено»:

| снято | ответ |
| --- | --- |
| базовая линия | `200`, слоты |
| `public_widget_visible = false` | `400` |
| `admin_manual_only = true` | `400` |
| услуга `is_active = false` | `400` |
| специалист `is_active = false` | `400` |
| доступность `is_active = false` | `400` |
| филиал `is_active = false` | `400` |
| восстановлено | `200`, слоты |

### 7. Реляционных чтений в анонимной воронке не осталось

За весь живой прогон (город, услуга, слоты, поля формы, шаг создания) в журнале НОЛЬ строк
`[book/public-catalog] catalog read failed` и НОЛЬ `Missing declared webapp port capability`.
Закрытый список `PUBLIC_BOOKING_PRINCIPAL_SOURCES` (7 строк) совпадает с полным набором мест, которые
ставят организационный принципал в `app/book` и `api/booking/public`, — проверено перечислением.

### 8. Публичный снимок слотов против пациентского близнеца

Поверхность отношений двух функций совпадает ПОЛНОСТЬЮ и различается ровно одним отношением:
у пациентской — `org_enrollments` (пациент записан в клинику), у публичной —
`clinic_public_directory_entries` (клиника опубликована). Рабочие часы, рабочие дни, занятость,
`LIMIT 1` по доступности — идентичны. Посетитель и пациент видят одинаковую доступность.

## Прочие проверки

- Тесты ветки: 24/24 зелёные (`publicBookingDoors.unit.test.ts`, `publicBookingPrincipal.unit.test.ts`,
  `publicOrganizationBooking.catalogFailure.unit.test.ts`). Проверок текста исходников в них нет,
  поломка и последствие названы, oracle — контракт миграции.
- `tsc --noEmit`: 0 ошибок в `src/` (5 ошибок в `.next/dev/types/*` — артефакт параллельно работавшего
  dev-сервера, не исходники).
- `check-drizzle-journal-sync`, `check-legacy-migrations-frozen` — OK; `0047` в журнале, четыре функции
  в кластере имеют новые тела, владельца `app_seam_public_booking_owner`, `SECURITY DEFINER`, `STABLE`,
  `PARALLEL UNSAFE`, `search_path=pg_catalog`.

## НЕ СДЕЛАНО

1. **Сквозной записи человека не получилось и не могло** — у шага записи (`create` → `confirm` →
   `be_appointments`) своих дверей в этой ветке НЕТ, это открытый пункт плана; им занят соседний
   worktree `bcb-wt-public-booking-write-20260819`. Живой прогон `POST /api/booking/public/create`
   доходит ДАЛЬШЕ, чем раньше (каталог и слоты резолвятся), и упирается в выдачу кода: провайдер SMS
   ответил `403`, маршрут вернул `503 verification_unavailable`, побочных эффектов не осталось
   (`platform_users` 306→306, `be_appointments` 410→410). **Приземление одной этой ветки НЕ даёт
   человеку записаться снаружи** — оно даёт ему дойти до шага подтверждения.
2. **Маршруты абонементов и статуса оплаты** (`/api/booking/memberships/*`, `/api/booking/payment-status`),
   перечисленные в плане как мёртвые по той же причине, проверить не смог: они закрыты аутентификацией и
   анонимно отдают `401` до обращения к базе. Утверждать про них ничего не буду.
3. **Несовпадение класса контекста форсировать не стал** — вместо этого класс закрыт конструктивно:
   грант не даёт роли одного класса позвать дверь другого (доказано живьём в обе стороны), а подделать
   принятый контекст нужного класса нечем, потому что в каталоге способностей на каждый purpose ровно
   одна строка с фиксированным классом и идентичностью функции.
4. **Full CI не гонял** — это гейт ведущего. Прогнаны только адресные тесты, typecheck и три гейта прав.
5. **TEST не трогал** — по брифу и правилу только DEV.

## Что осталось на DEV после аудита

Фикстура (намеренно, это та самая недостающая тестовая клиника; всё в организации
`e0000000-0000-4000-8000-000000000001`, реальные клиники не тронуты, `dmitryberson` и `race-target-a`
как были опубликованы, так и остались):

- запись каталога `audit-unpublished-clinic`, `is_published = false`;
- филиал `e1000000-…-b1`, услуга `e1000000-…-c1`, специалист `e1000000-…-d1`, доступность `e1000000-…-e1`;
- 5 строк рабочих часов, 3 поля формы (`audit_patient_visible`, `audit_staff_only`, `audit_inactive`).

Снести одной командой, если мешает:

```sql
DELETE FROM be_working_hours WHERE organization_id='e0000000-0000-4000-8000-000000000001';
DELETE FROM be_booking_form_fields WHERE field_key LIKE 'audit_%';
DELETE FROM be_specialist_service_availability WHERE id='e1000000-0000-4000-8000-0000000000e1';
DELETE FROM be_specialists WHERE id='e1000000-0000-4000-8000-0000000000d1';
DELETE FROM be_clinic_services WHERE id='e1000000-0000-4000-8000-0000000000c1';
DELETE FROM be_branches WHERE id='e1000000-0000-4000-8000-0000000000b1';
DELETE FROM clinic_public_directory_entries WHERE slug='audit-unpublished-clinic';
```

Временная инъекция в `apps/webapp/src/modules/patient-booking/inPersonBookingResolve.ts` откачена,
рабочее дерево чистое; продуктовый код ветки не менялся.

## Наблюдения (НЕ findings — вне скоупа ветки, решает ведущий/владелец)

- Шаг `create` на DEV реально дёрнул внешнего SMS-провайдера (`phone_otp_delivery … httpStatus 403`).
  Отправка не прошла, номер был заведомо фиктивный, поведение существует ДО этой ветки — но §1b п.2
  говорит «dev никогда не инициирует реальную доставку». Стоит отдельного взгляда, не здесь.
- Признак публичной воронки завязан на закрытый список `source`-строк. Сегодня список полон, но новая
  публичная точка входа, забывшая свою строку, молча уедет на реляционный путь и отдаст «Каталог
  недоступен». Это риск сопровождения, а не достижимое нарушение — заводить работу по §24.6 не за что.
- Форма записи неопубликованной клиники (при обойдённой слаговой стене) отдаёт `200 {fields: []}`,
  а не отказ. Это заявленное поведение «снаружи такой клиники не существует», не дефект.

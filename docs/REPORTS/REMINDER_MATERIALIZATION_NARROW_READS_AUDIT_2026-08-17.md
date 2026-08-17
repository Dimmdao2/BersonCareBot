# Независимый аудит: сужение колоночных чтений в корнях материализации напоминаний

**Дата:** 2026-08-17
**Кандидат:** ветка `wt/reminder-snapshot-grant-20260817`, коммиты `7b1086a5f`, `6b186ef1d`, база `feat/doctor-ui-rebuild`
**Дерево аудитора:** `/home/dev/dev-projects/bcb-wt-reminder-narrow-audit-20260817` (`wt/reminder-narrow-audit-20260817`)
**Authority:** `AGENTS.md` (Маршрут, §24.4, §24.5, §24.6, §10a/§10b, §5), `docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/PLAN.md` — «Неизменяемый порядок владельца» п. 9

---

## ВЕРДИКТ: **PASS**

Правка ведёт себя ровно так, как заявлено. Три тела функций отличаются от `0019` только сужением чтений —
механический diff не нашёл ни одного другого различия. Сужённые списки колонок достаточны: ни один корень
не потребляет ниже по телу колонку, которой ему не назначили. Все три корня исполняются до конца на
задекларированной поверхности в одноразовом кластере PostgreSQL 16, а возврат исторической формы `alias.*`
возвращает громкий 42501 — то есть зелёный прогон не может означать «проверка перестала на что-либо смотреть».
Приватная граница удержана: seam-owner по-прежнему не имеет табличного SELECT и не имеет ни одной из
удержанных колонок; попытка «читерски» расширить грант делает набор приёмки красным.

Против кандидата findings **нет**.

Отдельно: тот же класс дефекта **живой** в трёх других местах (`0017`, программные элементы пациента) —
это не дефект этой ветки и не её работа, а вопрос владельцу о заведении отдельной работы. Подробности —
раздел «Класс `alias.*`».

---

## 1. Слепой kill-set (составлен ДО чтения тестов воркера, §24.5)

| # | Named fault | Как ловится | Итог |
|---|---|---|---|
| K1 | Внутри 627-строчной миграции спрятано изменение логики помимо сужения | механический diff тел `0019` ↔ `0020`, не глазами | не найдено |
| K2 | Сужённый список пропускает колонку, потребляемую ниже (поле `%ROWTYPE`, `WHERE`, `ORDER BY`, `jsonb_build_object`, поздняя ветка) → НОВЫЙ отказ на следующем тике | полная перепись обращений `alias.<col>` и `v_*.<field>` + прогон в одноразовом кластере | не найдено |
| K3 | Потребляемая колонка вне задекларированного гранта → отказ там же, но позже | сверка потребления с `function-census.ts` и со сгенерированным артефактом | не найдено |
| K4 | `SELECT … INTO v_row.f1, v_row.f2` меняет семантику `NOT FOUND`/`FOUND` или оставляет несброшенные поля между итерациями цикла | чтение тел: где объявлены, где присваиваются, есть ли циклы | не найдено |
| K5 | `FOR UPDATE` требует привилегии, которой у владельца нет (rowmark требует UPDATE хотя бы на одну колонку) | прогон commit-корня до `materialized` в кластере | не найдено |
| K6 | Приватная граница расширена (грант, декларация или миграция раздают удержанные колонки) вместо сужения чтения | `0020` не содержит ни одного `GRANT`/`REVOKE`/DDL; проверка `has_column_privilege` в кластере | не найдено |
| K7 | Тест зелёный только потому, что грант расширен | инъекция расширения гранта и повторный прогон приёмки | набор краснеет — держит |
| K8 | Миграция нелегитимна по B0-forward (журнал, нумерация, возврат replay/A0/disposable) | `check-b0-migration-baseline.mjs`, чтение журнала и файла | не найдено |
| K9 | Тот же `alias.*` в других миграциях — живой отказ, ждущий своего тика | сверка полного списка колонок отношения с объединением грантов владельца + прогон механизма | **НАЙДЕНО** (вне кандидата) |
| K10 | `CREATE OR REPLACE` теряет владельца/ACL, выданные в `0019` | `CREATE OR REPLACE` сохраняет владельца и ACL; заголовок миграции объявляет того же владельца | не найдено |

---

## 2. Механический diff тел (K1)

Тела извлечены из обеих миграций по имени функции, от `CREATE OR REPLACE FUNCTION` до следующего
`--> statement-breakpoint`, и сравнены `diff -u`. Скрипт извлечения — `extract.py` (см. команды ниже).

```
for f in read_patient_reminder_materialization_snapshot \
         read_patient_reminder_delivery_target_snapshot \
         commit_patient_reminder_materialization; do
  python3 extract.py apps/webapp/db/drizzle-migrations/0019_*.sql $f > 0019_$f.sql
  python3 extract.py apps/webapp/db/drizzle-migrations/0020_*.sql $f > 0020_$f.sql
  diff -u 0019_$f.sql 0020_$f.sql
done
```

**Результат — ровно три ханка, все три суживают чтение, и ничего больше:**

| Корень | Единственное изменение |
|---|---|
| `read_patient_reminder_materialization_snapshot` | `SELECT candidate.*` → `SELECT candidate.id, candidate.rule_id, candidate.occurrence_key, candidate.planned_at, candidate.delivery_generation` |
| `read_patient_reminder_delivery_target_snapshot` | `SELECT patient.* INTO v_patient` → `SELECT patient.integrator_user_id, patient.email, patient.email_verified_at, patient.reminder_muted_until INTO v_patient.integrator_user_id, …` |
| `commit_patient_reminder_materialization` | `SELECT candidate.* INTO v_existing` → семь именованных колонок в семь полей `v_existing` |

Сигнатуры, `SECURITY DEFINER`, `STABLE`/`VOLATILE`, `PARALLEL`, `SET search_path`, `require_accepted_context`,
все ветки, все `jsonb_build_object`, вся валидация конверта доставки — **байт в байт**.
Файл `0020` не содержит ни одного `GRANT`, `REVOKE`, `ALTER` или DDL: только три `CREATE OR REPLACE`.

---

## 3. Достаточность сужённых списков (K2, K3, K4)

### 3.1. Текстовая перепись потребления

Полная перепись всех обращений, а не выборочный взгляд:

```
grep -o 'v_patient\.[a-z_]*'  0020_read_patient_reminder_delivery_target_snapshot.sql | sort | uniq -c
grep -o 'v_existing\.[a-z_]*' 0020_commit_patient_reminder_materialization.sql        | sort | uniq -c
grep -o 'candidate\.[a-z_]*'  0020_*.sql | sort | uniq -c
grep -o 'patient\.[a-z_]*'    0020_read_patient_reminder_delivery_target_snapshot.sql | sort | uniq -c
```

| Корень | Присвоено | Потребляется ниже | Вердикт |
|---|---|---|---|
| target (`v_patient`) | `integrator_user_id, email, email_verified_at, reminder_muted_until` | ровно эти четыре (`integrator_user_id` ×2, `email` ×2, `email_verified_at` ×2, `reminder_muted_until` ×3) | достаточно |
| commit (`v_existing`) | `id, rule_id, organization_id, platform_user_id, planned_at, status, delivery_generation` | ровно эти семь (`id` ×9, `delivery_generation` ×8, `status` ×3, остальные ×2) | достаточно |
| snapshot (подзапрос) | `id, rule_id, occurrence_key, planned_at, delivery_generation` | внешний агрегат читает ровно эти пять | достаточно |

`v_existing.occurrence_key` не читается ниже — и правильно исключён. Обе переменные `%ROWTYPE` объявлены
свежими, присваиваются ровно один раз и вне циклов, поэтому переход с «целая строка» на «список полей» не
меняет ни `FOUND`/`NOT FOUND`, ни значения непроставленных полей (они и так были NULL) — K4 закрыт.

Колонки, названные в `WHERE`/`JOIN`/`ORDER BY`, тоже требуют привилегии SELECT, поэтому переписаны отдельно:
snapshot дополнительно опирается на `organization_id`, `status`, `platform_user_id`; commit — на
`occurrence_key`; target — на `id`, `merged_into_id`, `is_blocked`, `is_archived`.

### 3.2. Сверка с задекларированной поверхностью

Объединение потребляемого по каждому корню — **строгое подмножество** гранта из
`deploy/postgres/generated/privileges.bcb_webapp_dev.sql`:

- `integrator.user_reminder_occurrences` → seam-owner: `created_at, delivery_generation, id, occurrence_key,
  organization_id, planned_at, platform_user_id, queued_at, rule_id, status, updated_at` (SELECT),
  плюс INSERT/UPDATE на тот же набор. **Нет** `sent_at, failed_at, delivery_channel, delivery_job_id, error_code`.
- `public.platform_users` → seam-owner: `created_at, email, email_verified_at, id, integrator_user_id,
  is_archived, is_blocked, merged_into_id, reminder_muted_until, updated_at`. **Нет** `role, birth_date,
  gender, height_cm, weight_kg, session_epoch, blocked_reason`.

То есть заявление воркера подтверждается: декларация **не дефектна**, дефектным было чтение.
Расширять грант было бы нарушением п. 9 плана владельца — привилегия не PROVEN-NECESSARY, потому что
ни один из трёх корней этих колонок не читает.

### 3.3. Прогон в одноразовом кластере — закрытие пробела воркера

Воркер честно признал, что end-to-end доказан только snapshot-корень. Пробел закрыт: написан
`deploy/postgres/privileges/reminder-materialization-roots.acceptance.sh` (одноразовый кластер PostgreSQL 16
в `mktemp -d`, общая база не трогалась). Гранты **рендерятся из декларации**, тела — из самих миграций,
ни то ни другое не переписано руками.

```
bash deploy/postgres/privileges/reminder-materialization-roots.acceptance.sh
# → reminder materialization roots (delivery-target + commit): PASS
```

Что доказано прогоном:

- **target-корень** исполняется целиком под принципалом организации и отдаёт правильные значения именно тех
  полей, которые кормит сужённое чтение: `emailRecipient=patient@example.test`, `emailVerified=true`,
  `muted=false`, `bindings.telegram=tg-chat-1`, `topicMasterEnabled=true`, `smtpConfigured=true`.
- **commit-корень** доведён до `outcome = 'materialized'`, то есть отработали: сужённое чтение вхождения,
  `FOR UPDATE` (rowmark на колоночных грантах — K5), все семь полей `v_existing` ниже по телу, вставка в
  `outgoing_delivery_queue`, делегированный `app.patient_reminder_materialization_fingerprint`, простановка
  отпечатка и финальная отметка `status='queued'`. Проверено по факту в базе:
  вхождение `queued`, `payload_json->>'occurrenceId'='occ-c1'`, `deliveryGeneration='1'`,
  `materializationFingerprint ~ '^[0-9a-f]{32}$'`.
- **Fault injection (§10a)**: те же тела с возвращённым `SELECT patient.*` и `SELECT candidate.*` падают с
  `permission denied for table platform_users` и `permission denied for table user_reminder_occurrences`
  соответственно. Один раз на независимый класс поломки, как требует §24.5.

Существующий набор воркера тоже прогнан: `reminder-materialization-snapshot.acceptance.sh` → PASS;
`reminder-materialization-declaration.test.mjs` + `reminder-materialization-boundary.test.mjs` → 8/8.

---

## 4. Приватная граница и «читерский» тест (K6, K7)

Внутри одноразового кластера, на грантах, отрендеренных из декларации:

```
has_table_privilege('app_seam_reminder_materialization_owner','integrator.user_reminder_occurrences','SELECT') → f
has_table_privilege('app_seam_reminder_materialization_owner','public.platform_users','SELECT')                → f
has_column_privilege(…,'sent_at'|'failed_at'|'delivery_channel'|'delivery_job_id'|'error_code','SELECT')       → f (все пять)
has_column_privilege(…,'role'|'birth_date'|'gender'|'height_cm'|'weight_kg'|'session_epoch'|'blocked_reason')  → f (все семь)
```

**Читерский тест.** В `function-census.ts` поверхность snapshot-корня расширена пятью удержанными
delivery-outcome-колонками, после чего набор приёмки воркера прогнан заново:

```
reminder materialization snapshot proof: FAIL: expected [f], got [t]   [exit=1]
```

Набор краснеет ровно на том утверждении, которое для этого и написано. То есть зелёный результат не может
быть куплен расширением гранта. Правка `function-census.ts` откачена, `git status --porcelain` чист —
продуктовый код не мутирован (§24.3).

---

## 5. Легитимность по B0-forward (K8)

- `node scripts/check-b0-migration-baseline.mjs` → `OK (B0 roots + 20 webapp and 0 integrator forward migrations; no legacy chain)`.
- Запись журнала: `idx: 20`, `version: "7"`, `when: 1800000020000`, `tag` совпадает с именем файла; вставлена
  в конец, монотонно после `0019` (`1800000019000`). Столкновений номеров нет — `0020` в каталоге один.
- Исторический replay, A0 и disposable-путь не возвращены: диффа за пределами журнала, новой миграции и
  тестов нет; `0020` не содержит DDL.
- Сгенерированные артефакты привилегий сверены с выводом декларации побайтово:

```
node deploy/postgres/privileges/generate-cli.mjs --db bcb_webapp_dev   --stdout | diff - deploy/postgres/generated/privileges.bcb_webapp_dev.sql   → identical
node deploy/postgres/privileges/generate-cli.mjs --db bersoncarebot_test --stdout | diff - deploy/postgres/generated/privileges.bersoncarebot_test.sql → identical
```

Кандидат не менял ни `declaration.ts`, ни `function-census.ts`, ни артефакты — и это правильно: чинить надо
было чтение, а не декларацию.

---

## 6. Класс `alias.*` — непроверенная находка воркера (K9)

Воркер сообщил про «примерно десять» таких же мест и не проверил их. Проверено полностью — механически, а не
на глаз. Метод: полный список колонок отношения берётся из drizzle-схемы (`apps/webapp/db/schema/**`),
владелец функции — из `ALTER FUNCTION … OWNER TO` в сгенерированном артефакте, объединение колоночных грантов
этого владельца на это отношение — оттуда же. Членства в других ролях у владельцев нет (проверено), поэтому
объединение грантов и есть эффективная привилегия.

Найдено 11 площадок в `0003` (×4) и `0017` (×7).

**Безопасны 8 из 11** — их seam-owner имеет SELECT на **все** колонки отношения, поэтому `alias.*` ничего
лишнего не требует:

| Функция | Отношение | колонок / гранта |
|---|---|---|
| `mutate_current_patient_booking` | `public.patient_bookings` | 30 / 30 |
| `apply_current_patient_booking_reschedule` | `public.be_appointments` | 26 / 26 |
| `apply_current_patient_booking_cancellation` | `public.be_appointments` | 26 / 26 |
| `reserve_current_patient_booking_package` | `public.be_package_usages` | 11 / 11 |
| `ensure_current_patient_support_conversation` | `public.support_conversations` | 17 / 17 |
| `append_current_patient_support_message` | `public.support_conversation_messages` | 16 / 16 |
| `update_current_patient_symptom_entry` | `public.symptom_entries` | 12 / 12 |
| `ensure_current_patient_test_attempt` | `public.test_attempts` | 8 / 8 |

**Три площадки — живой отказ, ждущий своего вызова** (владелец `app_seam_patient_self_actions_owner`):

| Функция (`0017`) | Отношение | Недостающие колонки |
|---|---|---|
| `app.touch_current_patient_program_item` (`SELECT s.* INTO v_stage`, стр. 778; плюс `RETURNING * INTO v_stage`) | `public.treatment_program_instance_stages` | `description, expected_duration_days, expected_duration_text, goals, local_comment, objectives, skip_reason, source_stage_id, title` (9 из 15) |
| `app.complete_current_patient_program_item` (`SELECT si.* INTO v_item`, стр. 827) | `public.treatment_program_instance_stage_items` | `comment, created_at, group_id, local_comment, settings, sort_order` (6 из 16) |
| `app.complete_current_patient_program_item` (`SELECT s.* INTO STRICT v_stage`, стр. 841) | `public.treatment_program_instance_stages` | те же 9 из 15 |

Грант из артефакта, дословно:
`GRANT SELECT ("id","instance_id","organization_id","sort_order","started_at","status") ON TABLE
"public"."treatment_program_instance_stages" TO "app_seam_patient_self_actions_owner";` — шесть колонок из
пятнадцати.

**Достижимый сценарий (не гипотеза):** оба корня вызываются из живого кода —
`apps/webapp/src/infra/repos/pgTreatmentProgramInstance.ts:1840` и
`apps/webapp/src/infra/repos/pgProgramActionLog.ts:79`. Пациент открывает элемент своей программы
реабилитации или отмечает его выполненным → SECURITY DEFINER-корень читает целую строку этапа → PostgreSQL
отвечает `42501 permission denied for table treatment_program_instance_stages` → действие пациента не
проходит. Это ровно тот же класс, что и упавший wake, только на другой поверхности.

**Механизм подтверждён прогоном**, а не рассуждением: в одноразовом кластере создано реальное отношение
(15 колонок), выдан реальный грант из артефакта (6 колонок), созданы две SECURITY DEFINER-функции того же
владельца:

```
narrow_read()  (SELECT s.id, s.status INTO v.id, v.status)  → 'available'
star_read()    (SELECT s.* INTO v)                          → ERROR: permission denied for table
                                                               treatment_program_instance_stages
```

**Классификация по §24.6:** это НЕ finding против кандидата — дефект существовал до этой ветки, в её owner-scope
не входит, и аудит не источник scope. Это **вопрос владельцу**: заводить ли отдельную работу на три корня
программных элементов. Кандидат «починил один тик», класс целиком не починен — и не должен был.

---

## 7. Что я НЕ проверял

1. **Живой прогон трёх корней программных элементов** (`touch_current_patient_program_item`,
   `complete_current_patient_program_item`) с их настоящими телами из `0017` и port-context-обвязкой.
   Доказан механизм (реальное отношение + реальный грант + форма `alias.*`) и сверены артефакты, но сами
   функции целиком в кластере не поднимались.
2. **Применение миграции `0020` к какой-либо живой базе** — запрещено брифом. Прогон wake-эндпоинта
   `POST /api/integrator/patient-reminders/materialize-wake` на именованном DEV после применения не делался;
   доказательство ограничено одноразовыми кластерами.
3. **Полный `pnpm run ci`** — запрещён брифом (host lock). Прогнаны только затронутые тесты и оба набора приёмки.
4. **Прочие миграции integrator** (`apps/integrator/src/**/db/migrations/**`) на предмет `alias.*` — свип
   покрыл только `apps/webapp/db/drizzle-migrations/*.sql`.
5. **Формы чтения целой строки помимо `alias.*`**: `SELECT *` без алиаса, `RETURNING *` без алиаса,
   `to_jsonb(v_row)` целиком, `%ROWTYPE`-присваивания из других источников. Замечено попутно, что
   `app.update_current_patient_symptom_entry` возвращает наружу `to_jsonb(v_row)` целой строки, а
   `touch_current_patient_program_item` — `to_jsonb(v_stage)`; это вопрос объёма отдаваемых наружу данных,
   а не привилегий, и в этот аудит не входил.
6. **Поведение под RLS**: фикстуры одноразовых кластеров создают отношения без RLS-политик, поэтому
   взаимодействие сужённых чтений с FORCE RLS на живой базе не проверялось.
7. **Введение колонок в отношения после снятия схемы**: списки колонок взяты из drizzle-схемы репозитория,
   а не из интроспекции живой базы (подключение к DEV требует клиентского сертификата и брифом ограничено).

---

## 8. Артефакты аудита

| Файл | Назначение |
|---|---|
| `deploy/postgres/privileges/reminder-materialization-roots.acceptance.sh` | одноразовый real-SQL прогон двух непокрытых корней + fault injection |
| `deploy/postgres/privileges/fixtures/render-materialization-root-proof.mjs` | рендер грантов из декларации и тел из миграций для этого прогона |
| `docs/REPORTS/REMINDER_MATERIALIZATION_NARROW_READS_AUDIT_2026-08-17.md` | этот отчёт |

Временных правок продуктового кода не осталось: инъекция расширения гранта в `function-census.ts` откачена,
`git status --porcelain` по продуктовым путям чист.

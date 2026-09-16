# Повторный адверсарный аудит Э1 — гейт слияния после коррекции

- Кандидат: `07223d8f8` (`fix(merge): enforce canon org gate #1110`)
- Ветка: `wt/merge-org-gate`, клон `/home/dev/dev-projects/bcb-wt-merge-org-gate`
- Оракул: `docs/ARCHITECTURE/AUTH_AND_IDENTITY_CANON.md` §18, §18а; план — `docs/_TODO/MERGE_MECHANISM_REWRITE_2026-09-14.md`, Э1
- Первый аудит: `docs/audit/merge-org-gate-adversarial-audit-2026-09-14.md` (F1–F4)
- Роль: адверсарный аудитор, продуктовых правок не вносил
- Вердикт: **FAIL**

## Тест или взгляд (AGENTS.md §24.4)

- Пункты 1, 2, 3, 5 — **повторяемое поведение**: что гейт блокирует, что пропускает, что переносит.
  Доказывается вызовом настоящей `mergePlatformUsersInTransaction` против живой `bcb_webapp_dev`
  внутри одной транзакции с `ROLLBACK`.
- Пункт 4 — **качество разового действия**: невыразима ли поломка на уровне типов. Доказывается
  компилятором и чтением, тестом не проверяется.

Живое доказательство: `docs/audit/merge-org-gate-recheck-live-proof-2026-09-14.mjs`. Оно **не
перепечатывает SQL гейта** (в отличие от `docs/_TODO/runs/merge-org-gate-correction-live-proof-2026-09-14.sql`,
который выполняет рукописную копию запроса, а не продуктовый код), а импортирует собранный
`packages/platform-merge/dist/pgPlatformUserMerge.js` и вызывает настоящую функцию.

```
pnpm --dir packages/platform-merge run build
sudo -n $(which node) docs/audit/merge-org-gate-recheck-live-proof-2026-09-14.mjs
```

(`sudo` + `process.setuid('postgres')` нужны только чтобы пройти `local all postgres peer` —
runtime-логины DEV требуют клиентских сертификатов. База проверяется в скрипте: не `bcb_webapp_dev` —
отказ. Все строки создаются и откатываются в одной транзакции, остаток после отката печатается.)

## Находки

### Д1 — слияние не работает ни одно: запрос блокировки — невалидный SQL (CONFIRMED)

`packages/platform-merge/src/pgPlatformUserMerge.ts:398` — `SELECT … FROM platform_users pu LEFT JOIN
user_contacts phone … LEFT JOIN user_contacts email … FOR UPDATE`. PostgreSQL запрещает `FOR UPDATE`
без списка таблиц, когда в запросе есть внешнее соединение.

Ввод: любая пара учёток, любой `reason`. Неправильный результат: `error: FOR UPDATE cannot be applied
to the nullable side of an outer join` — функция падает **до** гейта, до переносов, до всего.

```
sudo -n $(which node) docs/audit/merge-org-gate-recheck-live-proof-2026-09-14.mjs
FAIL  1_appointments_only_same_org_must_merge  expected=merge actual=CRASH
        error: FOR UPDATE cannot be applied to the nullable side of an outer join
… (то же во всех 11 сценариях)
0/11 scenarios matched the canon
```

Тот же запрос отдельно:

```
sudo -n -u postgres psql -X -P pager=off -d bcb_webapp_dev -c "BEGIN; SELECT pu.id, … FOR UPDATE; ROLLBACK;"
BEGIN
ERROR:  FOR UPDATE cannot be applied to the nullable side of an outer join
```

Появилось не в этом коммите: `git log -L 397,412:…` → `31e5a01c8` (#987, cutover канонических
контактов), и то же самое лежит в `origin/main`. Но именно из-за него **живого доказательства Э1 не
существует**: ни один вызов настоящей функции не мог пройти, а «зелёный» DEV-прогон кандидата зелен
потому, что выполнял рукописную копию SQL, а не код.

Достижимость: `apps/webapp/src/infra/repos/pgChannelLinkClaim.ts:148`,
`pgEmailPasswordLookup.ts:122`, `pgUserByPhone.ts`, `apps/webapp/src/infra/manualPlatformUserMerge.ts:35`.

### Д2 — сам гейт падает SQL-ошибкой: массив в `ANY(...)` собран через drizzle-шаблон (CONFIRMED)

`pgPlatformUserMerge.ts:69–145` — все десять проб вида `ANY(${ids}::uuid[])`. В drizzle-шаблоне
массив раскрывается **в список параметров**, а не в один параметр-массив:

```
node -e "… sqlToQuery(sql`SELECT 1 WHERE x = ANY(${ids}::uuid[])`)"
{"sql":"SELECT 1 WHERE x = ANY(($1)::uuid[])","params":["aaaaaaaa-0000-4000-8000-000000000001"]}
```

`probesFor` передаёт `[id]` — один элемент, значит `ANY(($1)::uuid[])` с текстовым `$1`.

Ввод: любое автоматическое слияние. Неправильный результат (после снятия Д1, живой прогон):

```
FAIL  1_appointments_only_same_org_must_merge  expected=merge actual=block
        malformed array literal: "9e100000-0000-4000-8000-000000000101"
```

То есть `assertAutomaticMergeHasNoMedicalHistory` не блокирует и не пропускает — он **валится
SQL-ошибкой**, и наружу уходит не `MergeDependentConflictError`, а сырая ошибка драйвера (в
`pgChannelLinkClaim` она не попадёт в `classifyMergeFailure` как конфликт).

Тот же дефект ещё в трёх местах, они бьют по **ручному пути техподдержки**:
`pgPlatformUserMerge.ts:813` (`mergeChannelBindingsManual`), `:874` (`mergeOauthBindingsManual`),
`:1579` (`enrichPickMergeCandidatesWithBookingCounts`) — там массив из двух элементов, и ошибка
другая: `cannot cast type record to uuid[]`.

Форма `ANY(${ids}::uuid[])` пришла не с этим коммитом (она есть и до Э1), но коррекция переписала
каждую пробу и сохранила её. Рабочая форма в этом же файле есть — `runMergePgText(client, '… ANY($1::uuid[])', [ids])`
(строки 637, 690, 1171 в версии `origin/main`); она передаёт массив одним параметром.

### Д3 — записи на приём всё ещё блокируют слияние, только через другую дверь (CONFIRMED)

Канон §18 дословно: «**Не блокеры ничего и никогда:** история записей на приём…». F1 закрыт только в
`assertAutomaticMergeHasNoMedicalHistory`. Рядом живёт `assertPatientBookingsSafeToMerge`
(`pgPlatformUserMerge.ts:1043`), который блокирует автоматическое слияние при пересечении активных
слотов.

Ввод: две учётки одного человека, у обеих только записи на приём в одной организации, слоты
пересекаются, статусы `confirmed`. Неправильный результат:

```
FAIL  10_appointment_overlap_same_org_canon_says_merge  expected=merge actual=block
        MergeDependentConflictError: patient_bookings: overlapping active slots between merge candidates
```

Это ровно тот же класс, что F1: канон говорит «переносится», код говорит «нужна техподдержка».
Предохранитель существовал до Э1 и в диффе коррекции не тронут — но он достижим и противоречит
процитированной строке канона, поэтому это находка, а не вопрос владельцу.

### Д4 — коммитнутый набор тестов не ловит 4 поломки гейта из 5 (CONFIRMED)

`apps/webapp/src/infra/accountMergeMedicalHistory.unit.test.ts` работает на подделке клиента, которая
сама решает исход гейта по подстроке `query.includes('AS conflict_organization_id')`. Оракулом
осталась форма SQL — её просто перенесли из `expect` внутрь фейка. F4 снят по букве, F2 — нет.

Слепые инъекции (каждая: правка исходника → `pnpm --dir packages/platform-merge run build` → живой
прогон + `pnpm exec vitest run src/infra/accountMergeMedicalHistory.unit.test.ts`):

| Инъекция | живой прогон | коммитнутый vitest |
|---|---|---|
| `I1` убрать разрез по организации (`ON true`) | КРАСНЫЙ — сц. 4 и 11 | **8 passed** |
| `I2` вернуть `=` вместо `IS NOT DISTINCT FROM` | КРАСНЫЙ — сц. 5 | **8 passed** |
| `I3` включить гейт в ручной путь | КРАСНЫЙ — сц. 7 | 1 failed \| 7 passed |
| `I4` обезвредить пробу `doctor_notes` (`WHERE false AND …`) | КРАСНЫЙ — сц. 2 и 5 | **8 passed** |
| `I5` вернуть `patient_bookings` в блокирующий список | КРАСНЫЙ — сц. 1 | **8 passed** |

Названная дорогая молчаливая поломка: разрез по организации или проба ломаются, две медицинские
истории одной клиники молча сливаются (или две учётки в разных клиниках молча перестают сливаться), а
CI зелёный.

## Доказательства по пунктам брифа

Базовый прогон ниже сделан при **временно снятых Д1 и Д2** (иначе функция не запускается):
`FOR UPDATE` → `FOR UPDATE OF pu`, `ANY(${ids}::uuid[])` → `ANY(${sql.param(ids)}::uuid[])` в 13
местах. Все временные правки продуктового кода откачены; `git diff -- packages apps deploy` пуст.

```
PASS  1_appointments_only_same_org_must_merge  expected=merge actual=merge
        {"bookings_on_target":2,"appointments_on_target":2,"want":2}
PASS  2_notes_vs_visit_same_org_must_block  expected=block actual=block
        MergeDependentConflictError: medical_history: automatic merge requires support (conflict inside one organization)
PASS  3_program_vs_symptom_same_org_must_block  expected=block actual=block
        MergeDependentConflictError: medical_history: automatic merge requires support (conflict inside one organization)
PASS  4_medical_in_different_orgs_must_merge  expected=merge actual=merge
        {"visits_on_target":1,"want":1}
PASS  5_null_org_on_both_sides_must_block  expected=block actual=block
        MergeDependentConflictError: medical_history: automatic merge requires support (conflict inside one organization)
PASS  6_non_blocking_categories_transfer  expected=merge actual=merge
        {"on_target":{"patient_bookings":1,"be_appointments":1,"online_intake_requests":1,"support_conversations":1,"symptom_trackings":2,"message_log":1},
         "left_on_duplicate":{"patient_bookings":0,"be_appointments":0,"online_intake_requests":0,"support_conversations":0,"symptom_trackings":0,"message_log":0}}
PASS  7_manual_support_path_is_not_gated  expected=merge actual=merge
        {"notes_on_target":1,"visits_on_target":2,"want":"notes 1, visits 2"}
PASS  8_promo_programs_same_org_must_merge  expected=merge actual=merge
PASS  9_wellbeing_and_warmup_same_org_must_merge  expected=merge actual=merge
        {"entries_on_target":4,"entries_left_on_duplicate":0,"live_trackings":[{"symptom_key":"general_wellbeing","c":1},{"symptom_key":"warmup_feeling","c":1}]}
FAIL  10_appointment_overlap_same_org_canon_says_merge  expected=merge actual=block
        MergeDependentConflictError: patient_bookings: overlapping active slots between merge candidates
PASS  11_cross_org_same_author_same_day_notes_must_merge  expected=merge actual=merge
        {"notes_on_target":2,"want":2}
residual_rows_after_rollback = {"users":0,"orgs":0}
10/11 scenarios matched the canon
```

### 1. F1 закрыт? — ЧАСТИЧНО, итог FAIL

Сценарий 1: у обеих учёток из квалифицирующего только `patient_bookings` и `be_appointments` в ОДНОЙ
организации — слияние проходит, обе записи и оба приёма переезжают на целевую (`bookings_on_target: 2`,
`appointments_on_target: 2`). В самом гейте F1 закрыт. Но сценарий 10 показывает, что записи на приём
всё ещё блокируют слияние через `assertPatientBookingsSafeToMerge` — см. Д3. И до кучи: на
коммитнутом коде ни один из этих сценариев не выполняется вовсе (Д1, Д2).

### 2. Гейт не ослаб — PASS

Четыре разные таблицы, не одна:

- `doctor_notes` (цель) × `clinical_visit` (дубль), одна организация → блок (сц. 2);
- `treatment_program_instances` с `assignment_source='doctor'` (цель) × `symptom_trackings`
  с `symptom_key='knee_pain'` (дубль), одна организация → блок (сц. 3);
- те же `doctor_notes` × `clinical_visit`, но организации разные → слияние (сц. 4);
- `doctor_notes` с `organization_id IS NULL` с обеих сторон → блок (сц. 5).

Инъекции I1, I2, I4 краснят ровно эти сценарии — гейт держит то, что заявлено.

Промо-программы (`assignment_source='promo'`) и отметки самочувствия/разминок с обеих сторон в одной
организации не блокируют (сц. 8, 9) — это соответствует §18.

### 3. Перенос не потерян — PASS

Сценарий 6: все квалифицирующие данные лежат на дубле — запись на приём, приём, заявка
(`online_intake_requests`), переписка (`support_conversations`), отметки самочувствия и разминок
(`symptom_trackings`), полученная рассылка (`message_log`). После слияния всё на целевой учётке, на
дубле ноль по каждой из шести таблиц.

Сценарий 9 отдельно проверяет, что перестановка переноса симптомов в `prepareTransfer` ничего не
теряет: 4 записи дневника (`symptom_entries`) с обеих сторон живы на целевой учётке, дубли
синглтон-трекингов схлопнуты до одного живого на ключ.

Сценарий 11: заметки одного врача за один день в РАЗНЫХ организациях — слияние проходит, обе заметки
на целевой учётке.

### 4. Конструкция реальна — PASS, с одной оговоркой

`pnpm --dir packages/platform-merge run typecheck` после инъекции:

- убрать `automaticProbe` у записи `doctor_notes` в `MEDICAL_HISTORY_RECORDS`:
  `src/pgPlatformUserMerge.ts(109,3): error TS2322: Type '{ transfer: … }' is not assignable to type 'BlockingMedicalHistoryRecord'.`
- добавить `automaticProbe` записи `patient_bookings` в `NON_BLOCKING_MERGE_RECORDS`:
  `src/pgPlatformUserMerge.ts(154,5): error TS2322: Type '(ids: any) => SQL<unknown>' is not assignable to type 'undefined'.`

Обе стороны невыразимы. Приведений типа нет: `grep -nE " as any| as unknown|@ts-(expect-error|ignore)"`
по файлу пуст.

Оговорка (не дефект, а граница конструкции): **типы охраняют только то, что уже попало в один из двух
списков.** В теле `mergePlatformUsersInTransaction` двенадцать таблиц переносятся отдельными
`runMergeSql` мимо обеих категорий: `channel_link_secrets`, `content_access_grants_webapp`,
`email_challenges`, `lfk_complexes`, `lfk_sessions`, `message_log`, `online_intake_requests`,
`reminder_rules`, `user_channel_bindings`, `user_oauth_bindings`, `user_password_credentials`,
`user_phone_history`. Новая медицинская таблица, добавленная так же, компилируется и остаётся вне
гейта. Это не гипотеза: именно так до `07223d8f8` лежал `patient_lfk_assignments` — настоящие
назначения врача вне гейта, — и коррекция перенесла его в `MEDICAL_HISTORY_RECORDS` вручную.

### 5. Зубы того, что осталось — см. таблицу Д4

Живой прогон краснеет на всех пяти инъекциях. Коммитнутый vitest — только на одной (`I3`).

## Наблюдения (не находки, строки канона нет)

- Ручное слияние двух учёток, у которых есть заметки **одного врача за одну дату**, падает на
  `duplicate key value violates unique constraint "uq_doctor_notes_daily_author"` — воспроизведено
  живым прогоном при подготовке сценария 7. Канон §18а говорит, что техподдержка «может перенести
  любые данные», но правила разрешения такой коллизии в каноне нет.
- Проба `symptom_trackings` исключает `general_wellbeing` и `warmup_feeling`, но считает блокирующими
  строки с `symptom_key IS NULL` (на DEV их 23 из 293:
  `sudo -n -u postgres psql … -c "SELECT symptom_key, count(*) FROM symptom_trackings GROUP BY 1"`).
  Решения владельца про такие строки в каноне нет.
- Блокировка пары с `organization_id IS NULL` с обеих сторон — решение кандидата, а не строка канона;
  в §18 сказано только про «одну организацию».

## Чего не делал

Продуктовый код не чинил. Временные инъекции и обходы Д1/Д2 откачены полностью — `git diff` по
`packages`, `apps`, `deploy` пуст. Прод не трогал, миграций не накатывал, на DEV после отката строк не
осталось (`residual_rows_after_rollback = {"users":0,"orgs":0}` в каждом прогоне).

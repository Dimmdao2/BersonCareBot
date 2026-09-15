# Адверсарный аудит Э1: organization-aware merge gate

Дата: 2026-09-15

Candidate: `wt/merge-org-gate` @ `8701f729b`

Authority: `docs/ARCHITECTURE/AUTH_AND_IDENTITY_CANON.md` §18

Классификация по `AGENTS.md` §24.4: повторяемое DB-поведение; очистка после `ROLLBACK` — разовая DB-интроспекция.

## Вердикт

**FAIL.** Десять заявленных медицинских категорий, разрез по организации, `NULL = NULL`, двоичность двух
исторических сценариев и обход гейта ручным путём доказаны. Но смешанная пара «легаси-медицина с
`organization_id IS NULL` + медицина той же фактической клиники с заполненным `organization_id`» проходит
автоматическое слияние. Это нарушает §18: обе стороны имеют медицинские данные внутри одной организации.

Конкретный вход: target имеет `doctor_notes(user_id=target, organization_id=NULL)` — легаси-строку клиники A;
duplicate имеет `doctor_notes(user_id=duplicate, organization_id=ORG_A)`. Неверный исход:
`mergePlatformUsersInTransaction(..., 'phone_bind')` сливает пару. Живой прогон ниже получил
`'merge' !== 'block'`.

Строку вердикта в план не добавлял. Продуктовый код и существующий тест после всех инъекций возвращены побайтно;
в репозитории остаются только audit-report и два его raw evidence-файла.

## 1. Базовый живой прогон и ROLLBACK

Команда:

```bash
/home/dev/brain/host-orch/run-tests.sh "sudo -n bash -lc 'cd /home/dev/dev-projects/bcb-wt-merge-org-gate && RUN_PLATFORM_USER_MERGE_DB=1 exec apps/webapp/node_modules/.bin/tsx --test deploy/postgres/privileges/platform-user-merge.devDbProof.test.mjs'"
```

Полный необрезанный stdout финального прогона сохранён рядом:
`docs/REPORTS/MERGE_ORG_GATE_E1_BASELINE_2026-09-15.txt`. Ниже — содержательный TAP-итог; structured merge
logger blocks из девяти успешных слияний находятся в полном логе.

```text
[2026-09-15T05:23:15+03:00] pid=1952212 WAITING for test lock :: sudo -n bash -lc 'cd /home/dev/dev-projects/bcb-wt-merge-org-gate && RUN_PLATFORM_USER_MERGE_DB=1 exec apps/webapp/node_modules/.bin/tsx --test deploy/postgres/privileges/platform-user-merge.devDbProof.test.mjs'
[2026-09-15T05:23:15+03:00] pid=1952212 ACQUIRED test lock :: sudo -n bash -lc 'cd /home/dev/dev-projects/bcb-wt-merge-org-gate && RUN_PLATFORM_USER_MERGE_DB=1 exec apps/webapp/node_modules/.bin/tsx --test deploy/postgres/privileges/platform-user-merge.devDbProof.test.mjs'
TAP version 13
# Subtest: the proof stays bound to the live merge engine export
ok 1 - the proof stays bound to the live merge engine export
# PASS same-organization clinical_visit blocks automatic merge
# PASS same-organization clinical_complaint blocks automatic merge
# PASS same-organization clinical_diagnosis blocks automatic merge
# PASS same-organization clinical_anamnesis_trauma blocks automatic merge
# PASS same-organization clinical_anamnesis_illness blocks automatic merge
# PASS same-organization clinical_anamnesis_lifestyle blocks automatic merge
# PASS same-organization doctor_notes blocks automatic merge
# PASS same-organization symptom_trackings blocks automatic merge
# PASS same-organization patient_lfk_assignments blocks automatic merge
# PASS same-organization treatment_program_instances blocks automatic merge
# PASS different-organization doctor notes merge
# PASS two unattributed medical histories block automatic merge
# PASS manual merge consolidates same-author same-day doctor notes
# PASS cross-organization active programs keep their organization boundary
# PASS canonical cross-organization notes merge with two active phone histories
# PASS manual merge keeps one preferred auth channel across different channels
# PASS manual merge deduplicates the same native push token
# PASS manual merge consolidates colliding open test attempts without losing results
# PASS manual merge reconciles same-organization active doctor programs
# PASS wellbeing diary entries stay visible after singleton tracking dedup
# proof_status=PASS scenarios=20 rollback=complete residual_rows=0
# Subtest: live PostgreSQL enforces the organization merge gate and completes collision-prone transfers
ok 2 - live PostgreSQL enforces the organization merge gate and completes collision-prone transfers
1..2
# tests 2
# suites 0
# pass 2
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 1854.045374
[2026-09-15T05:23:17+03:00] pid=1952212 RELEASED test lock (rc=0, 2s)
```

Итог команды: `20` сценариев; число получено строкой этой же команды
`proof_status=PASS scenarios=20 rollback=complete residual_rows=0`. Node test runner: `2/2`, exit `0`.

Независимый census после финального прогона выполнен через тот же host-lock: один точный `SELECT` с
`UNION ALL` по 22 таблицам фикстур и предикатом UUID-префикса
`LIKE 'a5e10000-0000-4000-8000-%'`. Полная точная команда без плейсхолдеров и её вывод сохранены в
`docs/REPORTS/MERGE_ORG_GATE_E1_DB_CENSUS_2026-09-15.txt`.

Вывод:

```text
               table_name               | proof_rows
----------------------------------------+------------
 be_organizations                       |          0
 clinical_anamnesis_illness             |          0
 clinical_anamnesis_lifestyle           |          0
 clinical_anamnesis_trauma              |          0
 clinical_complaint                     |          0
 clinical_diagnosis                     |          0
 clinical_visit                         |          0
 doctor_notes                           |          0
 lfk_complex_templates                  |          0
 native_push_targets                    |          0
 patient_lfk_assignments                |          0
 platform_users                         |          0
 symptom_entries                        |          0
 symptom_trackings                      |          0
 test_attempts                          |          0
 test_results                           |          0
 tests                                  |          0
 treatment_program_instance_stage_items |          0
 treatment_program_instance_stages      |          0
 treatment_program_instances            |          0
 user_channel_preferences               |          0
 user_phone_history                     |          0
(22 rows)
```

## 2. Зубы десяти категорий

Для каждой инъекции только её `automaticProbe` временно заменялся на
`sql\`SELECT NULL::uuid AS organization_id WHERE FALSE\``; transfer оставался на месте. Это эквивалентно снятию
категории именно с автоматического гейта и не создаёт постороннего падения при переносе. После каждого прогона
предыдущий probe возвращался. Команда живого теста во всех десяти строках — команда из §1 через host-lock.

| Снятый probe | Вывод целевого сценария | Остальные категории | Exit |
|---|---|---|---:|
| `clinical_visit` | `FAIL same-organization clinical_visit ... 'merge' !== 'block'` | 9 `PASS` | 1 |
| `clinical_complaint` | `FAIL same-organization clinical_complaint ... 'merge' !== 'block'` | 9 `PASS` | 1 |
| `clinical_diagnosis` | `FAIL same-organization clinical_diagnosis ... 'merge' !== 'block'` | 9 `PASS` | 1 |
| `clinical_anamnesis_trauma` | `FAIL same-organization clinical_anamnesis_trauma ... 'merge' !== 'block'` | 9 `PASS` | 1 |
| `clinical_anamnesis_illness` | `FAIL same-organization clinical_anamnesis_illness ... 'merge' !== 'block'` | 9 `PASS` | 1 |
| `clinical_anamnesis_lifestyle` | `FAIL same-organization clinical_anamnesis_lifestyle ... 'merge' !== 'block'` | 9 `PASS` | 1 |
| `doctor_notes` | `FAIL same-organization doctor_notes ...`; `FAIL two unattributed medical histories ...` | остальные 9 категорий `PASS` | 1 |
| `symptom_trackings` | `FAIL same-organization symptom_trackings ... 'merge' !== 'block'` | 9 `PASS` | 1 |
| `patient_lfk_assignments` | `FAIL same-organization patient_lfk_assignments ... 'merge' !== 'block'` | 9 `PASS` | 1 |
| `treatment_program_instances` | `FAIL same-organization treatment_program_instances ... 'merge' !== 'block'` | 9 `PASS` | 1 |

`doctor_notes` закономерно красит два сценария одной и той же категории: основной same-org и отдельный `NULL/NULL`.
Непойманных категорий: `0`; число получено десятью перечисленными запусками, не чтением registry.

## 3. Две инъекции формы гейта

### `IS NOT DISTINCT FROM` → `=`

Инъекция:

```diff
- ON duplicate.organization_id IS NOT DISTINCT FROM target.organization_id
+ ON duplicate.organization_id = target.organization_id
```

Команда — живой тест из §1. Вывод:

```text
# PASS same-organization clinical_visit blocks automatic merge
...
# PASS same-organization treatment_program_instances blocks automatic merge
# FAIL two unattributed medical histories block automatic merge: two unattributed medical histories block automatic merge
# 'merge' !== 'block'
# tests 2
# pass 1
# fail 1
TEST_RC=1
```

### Два независимых `EXISTS` без пересечения организаций

Инъекция заменила join двух наборов организаций на `target_has && duplicate_has`. Команда — живой тест из §1.
Вывод:

```text
# FAIL different-organization doctor notes merge: MergeDependentConflictError: medical_history: automatic merge requires support (conflict inside one organization)
# FAIL canonical cross-organization notes merge with two active phone histories: MergeDependentConflictError: medical_history: automatic merge requires support (conflict inside one organization)
# tests 2
# pass 1
# fail 1
TEST_RC=1
```

Обе поломки пойманы.

## 4. Двоичность исторических сценариев

Инъекция: вызов `assertAutomaticMergeHasNoMedicalHistory(...)` полностью снят из автоматического пути; вся
последующая reconcile/transfer-механика сохранена. Команда — живой тест из §1. Вывод по блокирующим сценариям:

```text
# FAIL same-organization clinical_visit blocks automatic merge: 'merge' !== 'block'
# FAIL same-organization clinical_complaint blocks automatic merge: 'merge' !== 'block'
# FAIL same-organization clinical_diagnosis blocks automatic merge: 'merge' !== 'block'
# FAIL same-organization clinical_anamnesis_trauma blocks automatic merge: 'merge' !== 'block'
# FAIL same-organization clinical_anamnesis_illness blocks automatic merge: 'merge' !== 'block'
# FAIL same-organization clinical_anamnesis_lifestyle blocks automatic merge: 'merge' !== 'block'
# FAIL same-organization doctor_notes blocks automatic merge: 'merge' !== 'block'
# FAIL same-organization symptom_trackings blocks automatic merge: 'merge' !== 'block'
# FAIL same-organization patient_lfk_assignments blocks automatic merge: 'merge' !== 'block'
# FAIL same-organization treatment_program_instances blocks automatic merge: 'merge' !== 'block'
# FAIL two unattributed medical histories block automatic merge: 'merge' !== 'block'
# PASS different-organization doctor notes merge
# PASS manual merge consolidates same-author same-day doctor notes
# PASS cross-organization active programs keep their organization boundary
# PASS canonical cross-organization notes merge with two active phone histories
# tests 2
# pass 1
# fail 1
```

Оба специально исторических сценария краснеют именно при снятии гейта:

- `patient_lfk_assignments` с разными шаблонами — `merge !== block`;
- `treatment_program_instances` с `status='completed'` — `merge !== block`.

Ни один из десяти блокирующих сценариев не остаётся зелёным за счёт reconcile. Значит все десять проверяют гейт,
а не соседнюю дверь.

## 5. `NULL` как организация

### `NULL/NULL`

Базовый сценарий блокируется; мутация `IS NOT DISTINCT FROM` → `=` красит ровно этот сценарий. Реального
ложного блокирования двух разных организаций на DEV не предъявлено: census текущей именованной DEV показал ноль
NULL-строк во всех десяти категориях. Полная точная команда без плейсхолдеров и её вывод сохранены в
`docs/REPORTS/MERGE_ORG_GATE_E1_DB_CENSUS_2026-09-15.txt`.

Вывод: все десять категорий — `null_rows = 0` (`10 rows`). Репозиторий при этом подтверждает допустимость
легаси-состояния: колонки nullable, а миграция
`20260908T104500_clinical_complaint_links_patient_symptom_tracking.sql` прямо называет строки без организации
«доSaaS-остатками». Доказательства, что такие остатки могли принадлежать двум разным организациям, нет: это не
finding.

### `NULL/UUID` — finding

В существующем NULL-сценарии временно заменена только duplicate-фикстура:

```diff
  nullOrgNote(targetId, DOCTOR),
- nullOrgNote(duplicateId, uid('4')),
+ note(duplicateId, ORG_A, uid('4')),
```

Семантика входа: первая строка — легаси-запись той же клиники A, вторая уже атрибутирована `ORG_A`. Команда —
живой тест из §1. Вывод:

```text
# PASS same-organization doctor_notes blocks automatic merge
# FAIL two unattributed medical histories block automatic merge: two unattributed medical histories block automatic merge
# 'merge' !== 'block'
# tests 2
# pass 1
# fail 1
```

Фактический исход — автоматическое слияние. Это достижимый класс легаси-данных и прямое нарушение §18. Текущая
проба его не держит: она проверяет `NULL/NULL`, но не смешанную старую/атрибутированную пару.

## 6. Ручной путь поддержки

Базовая проба исполняет две стороны одного входа:

```text
# PASS same-organization doctor_notes blocks automatic merge
# [platform-merge] [merge] merged duplicate into target {
#   targetId: 'a5e10000-0000-4000-8000-000000000107',
#   duplicateId: 'a5e10000-0000-4000-8000-000000000108',
#   reason: 'manual',
#   ...
# }
# PASS manual merge consolidates same-author same-day doctor notes
```

Автоматический путь для пары с `doctor_notes` в одной организации блокируется, а `reason='manual'` с явным
`resolution` сливает такую пару и сохраняет обе заметки. Ручной путь медицинским гейтом не закрыт.

## Итог инъекций

| Инъекция | Поймана |
|---|---|
| 10 снятых category probe | 10/10, непойманных 0 |
| `IS NOT DISTINCT FROM` → `=` | да |
| organization join → два независимых `EXISTS` | да |
| снять гейт целиком | да; все 10 категорий зависят от гейта |
| `NULL/NULL` → `NULL/ORG_A` при одной фактической клинике | **нет в постоянной пробе; найден дефект** |

Полный CI не запускался по запрету brief. Все живые команды шли через
`/home/dev/brain/host-orch/run-tests.sh`.

# Независимый адверсарный аудит Э4a после слияния с Э1

Кандидат: `wt/merge-conflict-doctor`, исходный `HEAD`
`c50fa21ab34421632ea638c61a89b4bd35cd326f`.

**ВЕРДИКТ: PASS. MUST FIX: 0. Непойманных инъекций: 0.**

Authority: `docs/_TODO/MERGE_MECHANISM_REWRITE_2026-09-14.md`, Э4a и явное решение
«столкновение версий разрешает ведущий при приземлении, побеждает типизированная версия Э1»;
`docs/ARCHITECTURE/AUTH_AND_IDENTITY_CANON.md` §18 и §18б; `AGENTS.md` §1, §5, §10a,
§10b, §24.4–§24.7.

Audit-artifact был промежуточно сохранён коммитом `51e3854d6` до временных инъекций. Все инъекции
после прогона сняты побайтно. В очередь `feat` строка вердикта не внесена: это делает ведущий.

## Классификация до чтения тестов

| Проверка | Тип | Почему |
|---|---|---|
| Сохранность обеих сторон merge и точная форма гейта Э1 | **ВЗГЛЯД** | Итоговое состояние и происхождение строк доказываются diff/сравнением committed-версий. |
| Гейт Э1 на 21 сценарии | **ПОВЕДЕНИЕ** | Нужен живой вызов движка против PostgreSQL, чтения кода недостаточно. |
| Дверь врача и честные исходы | **ПОВЕДЕНИЕ** | Нужен вызов под настоящей runtime-ролью врача. |
| Минимальность `SELECT` на `system_settings` и tenant-wall | **ПОВЕДЕНИЕ** + **ВЗГЛЯД** | Необходимость колонок доказывается PostgreSQL; адресат и отсутствие расширения `app_staff` — декларацией и catalog introspection. |
| Обход `reconcileOpenTestAttemptsForMerge` | **ПОВЕДЕНИЕ** | Нужно увидеть фактическое перемещение попытки definer-функцией и отсутствие строки дубликата. |
| Два открытых черновика одного пункта | **ВОПРОС ВЛАДЕЛЬЦУ** | Требования в Э4a/каноне нет; даже воспроизведённый `23505` не даёт authority на fix. |

## Слепой kill-set

Составлен по authority до чтения тестов:

1. NULL-организация перестаёт совпадать с произвольной известной организацией.
2. UUID-массивы/`ANY(...::uuid[])` или разделение блокирующих и переносимых записей теряются при merge.
3. Дверь врача не вызывает `app.transfer_staff_approved_platform_user_merge_data` либо скрывает её
   честный исход.
4. За дверью повторно выполняется обычный перенос зависимых строк либо не переводятся контакты.
5. Триггер создания клиники не работает без минимального `SELECT` арбитра или грант расширяет
   `app_staff`/значения настроек.
6. Definer-функция оставляет `test_attempts.patient_user_id = duplicateId`, а обход сверки молча
   пропускает незавершённый перенос.

## Уже полученные доказательства

### 1. Обе стороны слияния сохранены — **ВЗГЛЯД**, PASS

- `git show --no-patch --pretty=raw d9d68368b` подтвердил родителей merge:
  Э4a `8bc6b263d77fa1fde9d9bee6102ae308791fb779` и `feat`
  `0398e2495678a422a3b9396e1f9be53cfc0b17a8`.
- Команда сравнения блока от `type MergeTransferRecord` до
  `assertAutomaticMergeHasNoMedicalHistory` дала одинаковый SHA-256 для `0398e2495` и `HEAD`:
  `4aababc97cb08bdbfcb284617dc55620ade1afb254b2762ccb9922bde3f9f808`.
- Та же команда насчитала по `10` `automaticProbe` в обоих состояниях. Условие соединения в обоих:
  `duplicate.organization_id IS NULL OR target.organization_id IS NULL OR
  duplicate.organization_id = target.organization_id`; в текущей версии поверх него только
  фильтр одобренной врачом организации Э4a.
- `git diff 0398e2495..HEAD -- packages/platform-merge/src/pgPlatformUserMerge.ts` показывает
  добавления Э4a поверх Э1: `MergePlatformUsersOutcome`, опции двери, честный возврат
  `awaiting_other_organization`/`conflict_not_found`, вызов definer-двери, отдельный перенос
  контактов и обход обычного переноса.
- `git diff 8bc6b263d..HEAD` и поиск E4a-символов в обеих версиях подтвердили, что все перечисленные
  входы/исходы Э4a сохранились; изменения относительно `8bc6b263d` — типизированный гейт и
  collision-reconciliation Э1 плюс исправление `f9bb0a32c`.

### 2. Постоянная проба Э1 — **ПОВЕДЕНИЕ**, PASS

Команда (заголовок пробы, текущий клон, обязательный host lock):

```bash
/home/dev/brain/host-orch/run-tests.sh "sudo -n bash -lc 'cd /home/dev/dev-projects/bcb-wt-merge-conflict && RUN_PLATFORM_USER_MERGE_DB=1 exec apps/webapp/node_modules/.bin/tsx --test deploy/postgres/privileges/platform-user-merge.devDbProof.test.mjs'"
```

Дословная итоговая строка:

```text
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
# PASS legacy unattributed history blocks merge against an attributed organization
# PASS manual merge consolidates same-author same-day doctor notes
# PASS cross-organization active programs keep their organization boundary
# PASS canonical cross-organization notes merge with two active phone histories
# PASS manual merge keeps one preferred auth channel across different channels
# PASS manual merge deduplicates the same native push token
# PASS manual merge consolidates colliding open test attempts without losing results
# PASS manual merge reconciles same-organization active doctor programs
# PASS wellbeing diary entries stay visible after singleton tracking dedup
# proof_status=PASS scenarios=21 rollback=complete residual_rows=0
# tests 2
# pass 2
# fail 0
```

Итог TAP: `# tests 2`, `# pass 2`, `# fail 0`.

### 3. `system_settings` — **ПОВЕДЕНИЕ** + **ВЗГЛЯД**, PASS на текущем объёме

Живая транзакционная матрица через host lock дала:

```text
NOTICE:  no_select=BLOCKED sqlstate=42501
NOTICE:  key_scope=BLOCKED sqlstate=42501
NOTICE:  key_organization=BLOCKED sqlstate=42501
NOTICE:  scope_organization=BLOCKED sqlstate=42501
full_three=PASS seeded_rows=1
residual_orgs=0
residual_settings=0
```

То есть нужны именно все три колонки арбитра `key`, `scope`, `organization_id`; любая пара
недостаточна. Candidate-style reconcile (`REVOKE ALL PRIVILEGES ON TABLE`, затем колоночный grant)
оставляет `SELECT` только на этих трёх колонках; отдельный `SELECT value_json` после него отвечает
`ERROR: permission denied for table system_settings`.

Catalog introspection: `app_seam_specialist_provision_owner` и `app_staff` — `NOLOGIN`,
`NOSUPERUSER`, `NOBYPASSRLS`, взаимного membership нет; `system_settings` имеет `RLS=true`,
`FORCE=true`; обе seed-функции — `SECURITY DEFINER` и принадлежат seam-owner; `app_staff` не имеет
`EXECUTE` на них и не имеет `INSERT` в `be_organizations`. Diff `f9bb0a32c^..f9bb0a32c` меняет только
grant seam-owner; строки `app_staff` до/после идентичны (`SELECT, DELETE`, колоночные
`INSERT`/`UPDATE`).

### 4. Дверь врача — **ПОВЕДЕНИЕ**, PASS

Команда:

```bash
/home/dev/brain/host-orch/run-tests.sh "cd /home/dev/dev-projects/bcb-wt-merge-conflict && RUN_DOCTOR_MEDICAL_MERGE_DOOR_DB=1 DOCTOR_MEDICAL_MERGE_DOOR_ECHO=1 node --test deploy/postgres/privileges/doctor-medical-merge-door.devDbProof.test.mjs"
```

Дословные итоговые строки:

```text
# merge returned: {"targetId":"00000000-0000-4000-8000-00000000e1a1","duplicateId":"00000000-0000-4000-8000-00000000e1a2","mergeContactsSaved":[],"mergeOutcome":"merged"}
# doctor A merge returned: {"targetId":"00000000-0000-4000-8000-00000000d1a1","duplicateId":"00000000-0000-4000-8000-00000000d1a2","mergeContactsSaved":[],"mergeOutcome":"awaiting_other_organization"}
# doctor B merge returned: {"targetId":"00000000-0000-4000-8000-00000000d1a1","duplicateId":"00000000-0000-4000-8000-00000000d1a2","mergeContactsSaved":[],"mergeOutcome":"merged"}
# forgery refused: 42501 permission denied for table patient_merge_candidates
# RESULT: PASS — a doctor of another organization is refused and clinic A's conflict is untouched
# tests 4
# pass 4
# fail 0
```

Кандидатная миграция исполнялась как `9 owner-ordered blocks`, кандидатные права — `423 generated
statements`; всё внутри транзакций с `ROLLBACK`, в каждом proof `fixture rows left in the database: 0`.

### 5. Обход `reconcileOpenTestAttemptsForMerge` — **ПОВЕДЕНИЕ**, PASS

Во временную фикстуру честной двери добавлена одна открытая попытка только у дубликата и один
`test_results`. После вызова продуктового движка под настоящей `app_staff` получено:

```text
# merge returned: {"targetId":"00000000-0000-4000-8000-00000000e1a1","duplicateId":"00000000-0000-4000-8000-00000000e1a2","mergeContactsSaved":[],"mergeOutcome":"merged"}
# after merge: {"duplicate_merged_into":"00000000-0000-4000-8000-00000000e1a1","duplicate_credentials":0,"target_visits":2,"conflict_status":"resolved","duplicate_attempts":0,"target_attempts":1,"retained_results":1}
# tests 4
# pass 4
# fail 0
```

Следовательно, definer-функция действительно переводит каждую попытку дубликата; `test_results`
остаётся связан с тем же `attempt_id`. Обход повторной сверки в TypeScript не теряет строку. При
инъекции `WHERE false` в definer-`UPDATE test_attempts` то же acceptance-утверждение покраснело:
`duplicate_attempts:1`, `target_attempts:0`, `retained_results:1`, TAP `3 pass / 1 fail`.

## Инъекции

| № | Поломка | Чем поймана | Сделано | Убито | Непойманных |
|---:|---|---|---:|---:|---:|
| 1 | У seam-owner нет `SELECT` на `system_settings` | `INSERT be_organizations` → `42501` | 1 | 1 | 0 |
| 2 | Только `key,scope` | `42501` | 1 | 1 | 0 |
| 3 | Только `key,organization_id` | `42501` | 1 | 1 | 0 |
| 4 | Только `scope,organization_id` | `42501` | 1 | 1 | 0 |
| 5 | У двери отобрана `user_password_credentials` | `RESULT: FAIL — 42501`; harness ожидаемо зелёный | 1 | 1 | 0 |
| 6 | Дверь перестала видеть блокер второй клиники | первый врач получил ложный `merged`; harness ожидаемо зелёный | 1 | 1 | 0 |
| 7 | `app_staff` возвращён `INSERT patient_merge_candidates` | поддельная строка прошла и слияние состоялось; harness ожидаемо зелёный | 1 | 1 | 0 |
| 8 | Убрана сверка организации конфликта | настоящий TAP `3 pass / 1 fail` | 1 | 1 | 0 |
| 9 | NULL-join возвращён к `IS NOT DISTINCT FROM` | Э1: legacy NULL↔known-org дал `merge !== block`, TAP `1 pass / 1 fail` | 1 | 1 | 0 |
| 10 | Проба `clinical_visit` принудительно пуста | Э1: одноимённый сценарий дал `merge !== block`, TAP `1 pass / 1 fail` | 1 | 1 | 0 |
| 11 | Definer-`UPDATE test_attempts` отключён | acceptance: `duplicate=1/target=0`, TAP `3 pass / 1 fail` | 1 | 1 | 0 |
| **ИТОГО** |  |  | **11** | **11** | **0** |

После инъекций команда
`git diff --exit-code -- packages/platform-merge/src/pgPlatformUserMerge.ts
apps/webapp/db/drizzle-migrations/20260914T220000_doctor_resolves_medical_merge_conflict.sql
deploy/postgres/privileges/doctor-medical-merge-door.proofBody.mjs
deploy/postgres/privileges/doctor-medical-merge-door.devDbProof.test.mjs` дала
`ALL_INJECTION_TARGETS_RESTORED_BYTEWISE`.

## Вопрос владельцу — не finding и не правка

**ПОВЕДЕНИЕ подтверждено:** если у цели и дубликата есть по открытому черновику одного пункта,
дверь возвращает:

```text
RESULT: FAIL — 23505 duplicate key value violates unique constraint "idx_test_attempts_one_open_per_item_patient"
where: SQL statement "UPDATE public.test_attempts SET patient_user_id = p_target_user_id
 WHERE patient_user_id = p_duplicate_user_id"
```

Транзакция откатилась, `fixture rows left in the database: 0`. Э4a и канон не задают требуемый
исход для этой пары, поэтому по §24.6 это только owner-question; код не менялся.

## Остальная валидация

- `apps/webapp/node_modules/.bin/tsc -p apps/webapp/tsconfig.json --noEmit` → exit `0`.
- Через host lock: `generate-cli.mjs --check` → все шесть privilege/allowlist-артефактов трёх
  окружений совпадают побайтно.
- Через host lock: `generate-cli.mjs --all --port-context-only --check` → три port-context
  артефакта совпадают побайтно.
- Через host lock: `generate-cli.mjs --census` → для каждого из трёх окружений `221 ACTIVE
  relations across 3598 source files`; `408 patient-only modules` достигают только `120 relations`
  с patient-door; exit `0`.
- Полный CI не запускался по прямому запрету брифа.
- Известный чужой красный `definer-tenant-predicate.test.mjs` не запускался, не чинился и census не
  регенерировался.
- PROD, TEST, общий Next-сервер и постоянное состояние DEV не затронуты.

## Итог

**PASS.** Решение owner-плана о победе типизированного гейта Э1 выполнено; механика Э4a при merge
не потеряна; дверь врача зелёная под runtime-ролью; минимальный трёхколоночный `SELECT` нужен и не
расширяет `app_staff`/доступ к `value_json`; обход сверки открытых попыток честен для случая, где
попытка есть только у дубликата. MUST FIX отсутствуют.

Текст строки вердикта для ведущего (сам аудитор в очередь её не пишет):

> Э4a после разведения с Э1 — PASS: типизированный гейт Э1 сохранён побуквенно, постоянная проба
> `proof_status=PASS scenarios=21 residual_rows=0`; дверь врача `4 pass / 0 fail`; минимальный
> `SELECT system_settings(key,scope,organization_id)` подтверждён матрицей 0/2/3 колонок,
> `app_staff` не расширен; definer-перенос открытой попытки дал `duplicate=0`, `target=1`,
> `retained_results=1`; инъекции `11/11`, непойманных `0`. Финальный audit commit указан в
> отчёте исполнителя этого хода.

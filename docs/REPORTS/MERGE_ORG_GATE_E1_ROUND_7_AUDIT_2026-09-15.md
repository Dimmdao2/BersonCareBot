# Независимая проверка Э1, круг 7: legacy `NULL` в organization-aware merge gate

Дата: 2026-09-15

Candidate: `wt/merge-org-gate` @ `f6ca09321`

Authority: `docs/ARCHITECTURE/AUTH_AND_IDENTITY_CANON.md` §18; этап Э1
`docs/_TODO/MERGE_MECHANISM_REWRITE_2026-09-14.md`.

Классификация по `AGENTS.md` §24.4: повторяемое поведение живого PostgreSQL; отсутствие остаточных строк после
`ROLLBACK` — разовая DB-интроспекция. Автоматический UI не применим и не запускался.

## Вердикт

**PASS.** Найденный в прошлом круге вход `NULL/ORG_A` теперь блокируется. Обратный вход `NULL/нет медицины`,
четыре штатных состояния §18 и известные разные организации не переблокированы. Новый сценарий краснеет при
возврате прежнего join; прежний сценарий `clinical_visit` краснеет при снятии своей категории. После всех
инъекций product-файл и постоянная proof-проба побайтно возвращены к candidate, финальный прогон зелёный,
во всех 22 таблицах фикстур остаточных строк нет.

Строку вердикта в план не добавлял: автор проверки свою работу в `feat` не подписывает.

## Проверки

### 1. Полная постоянная proof-проба и очистка

Команда из шапки proof-файла, обёрнутая обязательным host-lock:

```bash
/home/dev/brain/host-orch/run-tests.sh "sudo -n bash -lc 'cd /home/dev/dev-projects/bcb-wt-merge-org-gate && RUN_PLATFORM_USER_MERGE_DB=1 exec apps/webapp/node_modules/.bin/tsx --test deploy/postgres/privileges/platform-user-merge.devDbProof.test.mjs'"
```

Первый неизменённый прогон, содержательный вывод:

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
1..2
# tests 2
# pass 2
# fail 0
[2026-09-15T05:43:55+03:00] pid=2008049 RELEASED test lock (rc=0, 1s)
```

После восстановления всех инъекций та же точная команда выполнена ещё раз. Вывод:

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
1..2
# tests 2
# pass 2
# fail 0
[2026-09-15T05:45:44+03:00] pid=2010829 RELEASED test lock (rc=0, 2s)
```

Итог измерен этой командой, не чтением массива: `proof_status=PASS`, `scenarios=21`,
`rollback=complete`, `residual_rows=0`, node runner `2/2`, exit `0`.

Отдельный census после финального прогона выполнен через тот же lock. Точная команда:

```bash
/home/dev/brain/host-orch/run-tests.sh "sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -v ON_ERROR_STOP=1 -P pager=off -c \"SELECT * FROM (SELECT 'platform_users' AS table_name, count(*)::int AS proof_rows FROM platform_users WHERE id::text LIKE 'a5e10000-0000-4000-8000-%' UNION ALL SELECT 'be_organizations', count(*)::int FROM be_organizations WHERE id::text LIKE 'a5e10000-0000-4000-8000-%' UNION ALL SELECT 'doctor_notes', count(*)::int FROM doctor_notes WHERE user_id::text LIKE 'a5e10000-0000-4000-8000-%' UNION ALL SELECT 'user_phone_history', count(*)::int FROM user_phone_history WHERE platform_user_id::text LIKE 'a5e10000-0000-4000-8000-%' UNION ALL SELECT 'treatment_program_instances', count(*)::int FROM treatment_program_instances WHERE patient_user_id::text LIKE 'a5e10000-0000-4000-8000-%' UNION ALL SELECT 'treatment_program_instance_stages', count(*)::int FROM treatment_program_instance_stages WHERE id::text LIKE 'a5e10000-0000-4000-8000-%' UNION ALL SELECT 'treatment_program_instance_stage_items', count(*)::int FROM treatment_program_instance_stage_items WHERE id::text LIKE 'a5e10000-0000-4000-8000-%' UNION ALL SELECT 'tests', count(*)::int FROM tests WHERE id::text LIKE 'a5e10000-0000-4000-8000-%' UNION ALL SELECT 'test_attempts', count(*)::int FROM test_attempts WHERE id::text LIKE 'a5e10000-0000-4000-8000-%' OR patient_user_id::text LIKE 'a5e10000-0000-4000-8000-%' UNION ALL SELECT 'test_results', count(*)::int FROM test_results WHERE attempt_id::text LIKE 'a5e10000-0000-4000-8000-%' OR test_id::text LIKE 'a5e10000-0000-4000-8000-%' UNION ALL SELECT 'clinical_visit', count(*)::int FROM clinical_visit WHERE patient_user_id::text LIKE 'a5e10000-0000-4000-8000-%' UNION ALL SELECT 'clinical_complaint', count(*)::int FROM clinical_complaint WHERE patient_user_id::text LIKE 'a5e10000-0000-4000-8000-%' UNION ALL SELECT 'clinical_diagnosis', count(*)::int FROM clinical_diagnosis WHERE patient_user_id::text LIKE 'a5e10000-0000-4000-8000-%' UNION ALL SELECT 'clinical_anamnesis_trauma', count(*)::int FROM clinical_anamnesis_trauma WHERE patient_user_id::text LIKE 'a5e10000-0000-4000-8000-%' UNION ALL SELECT 'clinical_anamnesis_illness', count(*)::int FROM clinical_anamnesis_illness WHERE patient_user_id::text LIKE 'a5e10000-0000-4000-8000-%' UNION ALL SELECT 'clinical_anamnesis_lifestyle', count(*)::int FROM clinical_anamnesis_lifestyle WHERE patient_user_id::text LIKE 'a5e10000-0000-4000-8000-%' UNION ALL SELECT 'patient_lfk_assignments', count(*)::int FROM patient_lfk_assignments WHERE patient_user_id::text LIKE 'a5e10000-0000-4000-8000-%' UNION ALL SELECT 'lfk_complex_templates', count(*)::int FROM lfk_complex_templates WHERE id::text LIKE 'a5e10000-0000-4000-8000-%' UNION ALL SELECT 'symptom_trackings', count(*)::int FROM symptom_trackings WHERE platform_user_id::text LIKE 'a5e10000-0000-4000-8000-%' UNION ALL SELECT 'symptom_entries', count(*)::int FROM symptom_entries WHERE platform_user_id::text LIKE 'a5e10000-0000-4000-8000-%' UNION ALL SELECT 'user_channel_preferences', count(*)::int FROM user_channel_preferences WHERE platform_user_id::text LIKE 'a5e10000-0000-4000-8000-%' UNION ALL SELECT 'native_push_targets', count(*)::int FROM native_push_targets WHERE user_id::text LIKE 'a5e10000-0000-4000-8000-%') residual ORDER BY table_name;\""
```

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
[2026-09-15T05:46:05+03:00] pid=2011465 RELEASED test lock (rc=0, 0s)
```

### 2. Найденный вход и обратная сторона `NULL`

Постоянный вход из прошлого finding уже входит в 21 сценарий:

- target: `doctor_notes(user_id=target, organization_id=NULL)`;
- duplicate: `doctor_notes(user_id=duplicate, organization_id=ORG_A)`;
- фактический вывод полной команды §1:
  `PASS legacy unattributed history blocks merge against an attributed organization`.

Для обратной стороны временно добавлен вход `NULL/нет медицины`, а также четыре штатных состояния §18 на
публичной границе Э1. Команда — та же полная host-lock команда из §1. Вывод временного прогона:

```text
# PASS audit-only legacy unattributed history on one side does not block an empty account
# PASS audit-only routine case 1 clean accounts merge
# PASS audit-only routine case 2 existing medical account merges with an empty account
# PASS audit-only routine case 3 empty account merges with an existing medical account
# PASS audit-only routine case 4 known different organizations merge
# proof_status=PASS scenarios=26 rollback=complete residual_rows=0
1..2
# tests 2
# pass 2
# fail 0
[2026-09-15T05:44:38+03:00] pid=2008883 RELEASED test lock (rc=0, 2s)
```

Соответствие четырём штатным случаям проверялось только в границе Э1: чистые стороны; существующая сторона с
медициной и пустая новая; та же одно-sided ситуация при обратном направлении пары; медицина с обеих сторон в
разных известных организациях. Это проверка merge gate, не утверждение о ещё не реализованных дверях Э3/Э5.
Временные сценарии после прогона удалены.

### 3. Не переблокированы известные разные организации

Команда — полная host-lock команда §1. Постоянный и временный прогоны дали:

```text
# PASS different-organization doctor notes merge
# PASS cross-organization active programs keep their organization boundary
# PASS canonical cross-organization notes merge with two active phone histories
# PASS audit-only routine case 4 known different organizations merge
```

То есть `ORG_A/ORG_B` по-прежнему сливается как в простом сценарии заметок, так и при активных программах и
коллизии истории телефонов.

### 4. Зубы нового сценария

Временная инъекция в движок:

```diff
-            ON (duplicate.organization_id IS NULL
-                OR target.organization_id IS NULL
-                OR duplicate.organization_id = target.organization_id)
+            ON duplicate.organization_id IS NOT DISTINCT FROM target.organization_id
```

Команда — полная host-lock команда §1. Вывод:

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
# FAIL legacy unattributed history blocks merge against an attributed organization: legacy unattributed history blocks merge against an attributed organization
# 'merge' !== 'block'
# tests 2
# pass 1
# fail 1
[2026-09-15T05:45:04+03:00] pid=2009727 RELEASED test lock (rc=1, 2s)
```

Новый сценарий имеет зубы: старая логика воспроизводит прежний дефект, при этом `ORG_A/ORG_B` и `NULL/NULL`
остаются зелёными. Инъекция восстановлена.

### 5. Зубы прежней категории

Временно снят только `clinical_visit.automaticProbe`; transfer оставлен на месте:

```diff
-      sql`SELECT organization_id FROM clinical_visit WHERE patient_user_id = ANY(${sql.param(ids)}::uuid[])`,
+      sql`SELECT NULL::uuid AS organization_id WHERE FALSE`,
```

Команда — полная host-lock команда §1. Вывод:

```text
# FAIL same-organization clinical_visit blocks automatic merge: same-organization clinical_visit blocks automatic merge
# 'merge' !== 'block'
# PASS same-organization clinical_complaint blocks automatic merge
# PASS same-organization clinical_diagnosis blocks automatic merge
# PASS same-organization clinical_anamnesis_trauma blocks automatic merge
# PASS same-organization clinical_anamnesis_illness blocks automatic merge
# PASS same-organization clinical_anamnesis_lifestyle blocks automatic merge
# PASS same-organization doctor_notes blocks automatic merge
# PASS same-organization symptom_trackings blocks automatic merge
# PASS same-organization patient_lfk_assignments blocks automatic merge
# PASS same-organization treatment_program_instances blocks automatic merge
# PASS legacy unattributed history blocks merge against an attributed organization
# tests 2
# pass 1
# fail 1
[2026-09-15T05:45:22+03:00] pid=2010257 RELEASED test lock (rc=1, 2s)
```

Прежний класс не ослаблен: снятая категория красит свой сценарий; остальные девять категорий остаются зелёными.
Инъекция восстановлена.

## Таблица fault injection

| Что ломал | Какой observable outcome ожидался | Покраснело |
|---|---|---|
| Join возвращён к `IS NOT DISTINCT FROM` | `NULL/ORG_A` ошибочно сливается | Да: только новый сценарий, `'merge' !== 'block'` |
| Снят `clinical_visit.automaticProbe` | одинаковая организация с визитами ошибочно сливается | Да: `same-organization clinical_visit`, `'merge' !== 'block'` |

Непойманных named faults: `0`; число получено двумя перечисленными fault-injection прогонами.

## Восстановление дерева

Команда:

```bash
git diff --exit-code f6ca09321 -- packages/platform-merge/src/pgPlatformUserMerge.ts deploy/postgres/privileges/platform-user-merge.devDbProof.test.mjs; git status --short --branch
```

Вывод до финального редактирования этого отчёта:

```text
## wt/merge-org-gate
```

Exit `0`; product-код и proof-файл совпадают с `f6ca09321`, временных изменений нет. Полный CI по запрету brief
не запускался; миграции не применялись; PROD не затрагивался.

# Третий адверсарный аудит Э1 — гейт слияния по организации

**Предмет:** ветка `wt/merge-org-gate`, коммит `77894c3a7` («fix(merge): make org gate executable»).
**Оракул:** `docs/ARCHITECTURE/AUTH_AND_IDENTITY_CANON.md` §18/§18а; план `docs/_TODO/MERGE_MECHANISM_REWRITE_2026-09-14.md`, этап Э1.
**Артефакты прогона:** `docs/audit/merge-org-gate-third-audit-live-proof-2026-09-15.mjs` (14/15 сценариев),
`docs/audit/merge-org-gate-third-audit-lock-proof-2026-09-15.mjs` (доказательство блокировки строк).
Всё живое — против `bcb_webapp_dev` в транзакции с `ROLLBACK`; остаточных строк 0.

## Вердикт: **FAIL** — 2 дефекта

Гейт, который переписан в Э1, сам по себе работает правильно и режет по организации. Но требование Э1
дословно — «две учётки **с назначениями** в разных клиниках сливаются» — на живом продукте **не
выполняется**: пару режет другой блокер, до которого коррекция не дошла. Плюс коррекция развела движок и
превью: экран техподдержки по-прежнему отказывает там, где движок уже сливает.

---

## Д1. Активные назначения в РАЗНЫХ организациях по-прежнему блокируют слияние

**Строка канона.** §18: «медицинские данные человека в РАЗНЫХ организациях слиянию **не мешают вовсе** — у
одного человека спокойно живут две организации, каждая со своими назначениями, и это нормальное состояние,
а не конфликт». План Э1, критерий приёмки дословно: «две учётки с назначениями в разных клиниках сливаются».

**Где.** `packages/platform-merge/src/pgPlatformUserMerge.ts:1196` —
`reconcileActiveTreatmentProgramInstancesForMerge`. Её `INNER JOIN` соединяет
`treatment_program_instances` обеих сторон по `status = 'active'` **без условия на `organization_id`**, и при
двух не-promo активных программах бросает `MergeDependentConflictError`. Вызывается на строке 457 — **вне**
ветки `if (reason !== 'manual')`, то есть режет и автоматический путь, и ручной путь техподдержки (§18а:
«техподдержка… перенести любые данные между аккаунтами в любом направлении»).

**Ввод и неправильный результат.**

```
target:    treatment_program_instances(assignment_source='doctor', status='active', organization_id=ORG_X)
duplicate: treatment_program_instances(assignment_source='doctor', status='active', organization_id=ORG_Y)
reason:    phone_bind
```

```
$ sudo -n node docs/audit/merge-org-gate-third-audit-live-proof-2026-09-15.mjs p2_active_doctor_programs
FAIL    p2_active_doctor_programs_different_orgs_canon_says_merge  expected=merge actual=block
         oracle: §18 «у одного человека спокойно живут две организации, каждая со СВОИМИ НАЗНАЧЕНИЯМИ» + план Э1
         MergeDependentConflictError: treatment_program_instances: active program on both merge candidates
PASS    p2_active_doctor_programs_same_org_must_block  expected=block actual=block
```

Человек лечится в клинике А и в клинике Б; в обеих ему назначена программа. Он привязывает телефон — и
слияние отказывает, хотя канон называет ровно этот случай «нормальным состоянием». Новый гейт Э1 такую пару
пропускает корректно (проверено: `p2_diagnosis_orgX_vs_trauma_orgY_must_merge` и
`p2_notes_orgX_vs_notes_orgY_must_merge` — PASS), но следующая проверка в той же функции её всё равно роняет.

Это тот же класс, что F1 первого аудита: правило живёт за несколькими дверьми, переучили одну.

## Д2. Превью слияния (экран техподдержки) по-прежнему считает записи на приём жёстким блокером

**Строка канона.** §18: «Не блокеры ничего и никогда: **история записей на приём**…».

**Где.** Коррекция удалила `assertPatientBookingsSafeToMerge` из движка, но её SQL слово в слово остался в
`apps/webapp/src/infra/platformUserMergePreview.ts:833` (`countActiveBookingOverlap`) и на строке 445
превращается в hard blocker `active_bookings_time_overlap` с комментарием «same cooperator snapshot rule as
merge guard» — guard'а, которого больше нет. Дальше `mergeAllowed = hardBlockers.length === 0` (строка 606),
а `apps/webapp/src/app/app/admin/account-merge/accountMergeLogic.ts:283` гасит кнопку применения:
`if (!preview.mergeAllowed || preview.hardBlockers.length > 0) return false;`. Маршрут живой —
`apps/webapp/src/app/api/admin/account-merge/preview/route.ts:104`.

**Ввод и неправильный результат.** Две учётки, у каждой по одной `confirmed`-записи на пересекающийся слот:

```
preview countActiveBookingOverlap = 1  -> hardBlocker 'active_bookings_time_overlap' pushed: true
preview mergeAllowed (= hardBlockers.length === 0) -> false
admin UI canApplyMerge (accountMergeLogic.ts:283) -> false
engine mergePlatformUsersInTransaction -> MERGED
residual_rows_after_rollback = 0
```

Движок сливает, экран отказывает. Ложная блокировка, ради снятия которой затевался Э1, на поверхности,
которой пользуется человек, осталась на месте — и теперь ещё и расходится с движком.

---

## Что проверено и держится

### 1. F1 закрыт на движке — ДА

| сценарий | оракул | результат |
|---|---|---|
| `p1_bookings_only_same_org_must_merge` | §18 «история записей на приём» | merge ✔ |
| `p1_overlapping_bookings_same_org_must_merge` | то же, пересекающиеся слоты | merge ✔ |
| `p1_intake_requests_only_same_org_must_merge` | §18 «заявки… сливается штатно» | merge ✔ |

### 2. Гейт не ослаб — ДА, проверено на семи разных таблицах

| сценарий | таблицы | ожидание | результат |
|---|---|---|---|
| `p2_diagnosis_vs_trauma_same_org_must_block` | `clinical_diagnosis` / `clinical_anamnesis_trauma` | block | ✔ |
| `p2_lfk_vs_notes_same_org_must_block` | `patient_lfk_assignments` / `doctor_notes` | block | ✔ |
| `p2_symptom_vs_complaint_same_org_must_block` | `symptom_trackings` / `clinical_complaint` | block | ✔ |
| `p2_doctor_program_vs_diagnosis_same_org_must_block` | `treatment_program_instances(doctor)` / `clinical_diagnosis` | block | ✔ |
| `p2_diagnosis_orgX_vs_trauma_orgY_must_merge` | разные организации | merge | ✔ |
| `p2_notes_orgX_vs_notes_orgY_must_merge` | разные организации | merge | ✔ |
| `p2_null_org_both_sides_must_block` | `organization_id IS NULL` с обеих сторон | block | ✔ |

### 3. Перенос не потерян — ДА

`p3_non_blocking_categories_all_transfer`: у дубликата были `patient_bookings`, `be_appointments`,
`online_intake_requests` (заявки), `support_conversations` (переписка), `symptom_trackings`
(`general_wellbeing` + `warmup_feeling`) с `symptom_entries`, `message_log` (рассылка), promo-программа.
После слияния:

```
on_target = {"patient_bookings":1,"be_appointments":1,"online_intake_requests":1,"support_conversations":1,
             "symptom_trackings":2,"symptom_entries":2,"message_log":1,"treatment_program_instances":1}
left_on_duplicate = все нули
```

`p3_cross_org_medical_transfers_too`: медицина чужой организации тоже переезжает на целевую учётку и
сохраняет свою `organization_id` (`symptom_orgs_on_target = [ORG_Y]`), ничего не осталось на дубликате.

### 4. Конструкция реальна — ДА, обе стороны проверены компилятором

Медицинская запись без пробы:

```
src/pgPlatformUserMerge.ts(149,3): error TS2322: Type '{ transfer: ... }' is not assignable to type
  'BlockingMedicalHistoryRecord'. Property 'automaticProbe' is missing ... but required
```

Неблокирующая запись с пробой:

```
src/pgPlatformUserMerge.ts(154,5): error TS2322: Type '(ids: any) => SQL<unknown>' is not assignable to type 'undefined'.
```

Обхода через `as`/приведение типа в файле нет (проверено grep'ом по `as `, `as unknown`, `@ts-ignore`,
`: any` — совпадения только `as const` и импорт-алиас). Оба временных изменения отката́ны, чистый
`tsc --noEmit` проходит, `md5sum` исходника совпадает с исходным.

### 5. Зубы — все три инъекции покраснели

| инъекция | что покраснело |
|---|---|
| убрать разрез по организации (`ON true = true`) | `p2_diagnosis_orgX_vs_trauma_orgY` → block, `p2_notes_orgX_vs_notes_orgY` → block |
| `=` вместо `IS NOT DISTINCT FROM` | `p2_null_org_both_sides_must_block` → CRASH (`duplicate key value violates unique constraint "uq_doctor_notes_daily_author"`) — пара перестала блокироваться и развалилась на переносе |
| включить гейт в ручной путь | `p5_manual_support_path_not_gated_same_org_medical` → block |

### 6. Блокировка строк осталась НАСТОЯЩЕЙ

`FOR UPDATE OF pu` не «исчезло ради того, чтобы запрос перестал падать». Проверено двумя соединениями:
первое открывает транзакцию и зовёт настоящий merge на паре не-`client` строк (гейт роли бросает сразу
**после** блокирующего SELECT, то есть в транзакции выполнен ровно он), второе пробует взять те же строки
`FOR UPDATE NOWAIT`:

```
conn1 stopped at: MergeConflictError: merge: only role=client users can be merged
conn2 probes platform_users with FOR UPDATE NOWAIT:
  merge target row                   BLOCKED 55P03 — could not obtain lock on row in relation "platform_users"
  merge duplicate row                BLOCKED 55P03 — could not obtain lock on row in relation "platform_users"
  unrelated control row              ACQUIRED (row is NOT locked)
  joined user_contacts row           ACQUIRED (user_contacts row is NOT locked — expected with `OF pu`)
```

Обе строки `platform_users` заблокированы по-настоящему, конкурент ждёт. `OF pu` сузило замок до
`platform_users` — строки `user_contacts` из `LEFT JOIN` больше не блокируются; merge правит их своими
отдельными операторами, так что это осознанное сужение, а не потеря.

---

## Факты в отчёт (не дефекты, работы из них не заводить)

1. **Unit-тесты этой поверхности не видят Э1.** `apps/webapp/src/infra/accountMergeMedicalHistory.unit.test.ts`
   — 8/8 зелёные. С полностью убранным разрезом по организации (`ON true = true` в JOIN гейта) они
   **остаются 8/8 зелёными**: фейковый клиент маршрутизирует по подстроке запроса и никогда не исполняет SQL,
   а весь предмет Э1 живёт именно в SQL. Тот же механизм уже дал ложный зелёный во втором аудите, когда
   слияние падало целиком. §10b: fake-тест не заявляет DB-гарантию. Доказательство Э1 — живой прогон, не этот файл.
2. **`assertSharedPhoneGuard` (строка 988) недостижим.** Он считает «meaningful data» по `patient_bookings` и
   `online_intake_requests` — то есть по категориям, которые §18 называет «не блокеры никогда», — но срабатывает
   только при одинаковом non-null первичном телефоне с обеих сторон, а `uq_user_contacts_phone`
   (`UNIQUE (value_normalized) WHERE contact_kind='phone'`) делает это состояние невозможным. Мёртвый код,
   не достижимое нарушение.
3. **`assertOpenTestAttemptsSafe` (строка 1275)** режет по общему `instance_stage_item_id`, а он принадлежит
   одному инстансу одного пациента — на корректных данных пара не собирается.
4. **Категории — не единственная дверь.** Помимо двух типизированных списков, merge перецеливает ~38 таблиц
   отдельными `UPDATE` в теле функции (`lfk_complexes`, `lfk_sessions`, `patient_practice_completions`,
   `patient_diary_day_snapshots`, `program_action_log` и далее). Конструкция гарантирует «медицинская запись
   обязана иметь пробу» только для тех таблиц, которые кто-то положил в список; новая таблица может приехать
   мимо обеих категорий и не быть классифицированной вовсе. Ни одна из этих 38 не входит в перечень блокеров
   §18 от 14.09, так что сегодня неправильного результата это не даёт.

## Вопрос владельцу (строки канона нет)

`IS NOT DISTINCT FROM` считает NULL совпадающим с NULL, поэтому две неатрибутированные истории блокируются
(`p2_null_org_both_sides_must_block` — block). Но пара «NULL с одной стороны, ORG_X с другой» сливается
(`p2_null_org_vs_orgX__observed_only` — merge). Канон про строки одноарендной эпохи ничего не говорит; это
решение исполнителя, записанное комментарием в коде. На DEV таких строк сейчас нет ни в одной
квалифицирующей таблице (`clinical_visit` 0/17, `doctor_notes` 0/1, `clinical_diagnosis` 0/14,
`symptom_trackings` 0/293, `treatment_program_instances` 0/97), то есть живого риска сегодня нет.

## НЕ СДЕЛАНО

- Дефекты не чинил (аудитор не принимает собственный фикс, §24.6).
- Строка вердикта в `docs/_TODO/NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md` — за ведущим и **в главном дереве**,
  не в ветке: внутри ветки она делает её неприземляемой. Коммит этого аудита несёт `.mjs`, поэтому гейт
  `orch-launch.sh land` потребует его SHA в очереди.
- Full CI не гонял: предмет аудита — поведение гейта против живой DEV, не интеграционный риск сборки.

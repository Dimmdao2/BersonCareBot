# Э4a, четвёртый круг — коррекция по Д1 и Д2

Ветка `wt/merge-conflict-doctor`, вход `ccfe2b4b7`. Вход аудита —
`docs/_TODO/AUDIT_E4a_MERGE_CONFLICT_DOCTOR_ROUND3_2026-09-15.md` (вердикт FAIL: F1 и F2).
Оракул — `docs/ARCHITECTURE/AUTH_AND_IDENTITY_CANON.md` §18/§18б. План —
`docs/_TODO/MERGE_MECHANISM_REWRITE_2026-09-14.md`, этап Э4a.

Коммиты: `e7087be8c` (Д1+Д2), `34ae9e564` (живые прогоны + найденный ими дефект read_),
`5079d2ca4` (route-тест исхода).

---

## Д1 — «слить» больше не отвечает успехом, не слив

### Что решено (и почему именно так)

Канон §18б знает два действия врача и молчит про ожидание второй клиники — значит режим
«одобрил, но слияния ещё нет» из канона не выводится, и **это вопрос владельцу** (ниже, «Развилки»).
Реализован безопасный минимум, который брифом назван обязательным: человек не остаётся молча с
двумя учётками и без конфликта на индикаторе, а несостоявшееся слияние не выдаётся за успех.

1. **Дверь возвращает причину словом, а не `boolean`.**
   `app.transfer_staff_approved_platform_user_merge_data` → `RETURNS text` со значениями
   `merged` / `awaiting_other_organization` / `conflict_not_found`.
2. **Одобрение врача пишется в его СТРОКУ, и строка остаётся `pending`.** Раньше дверь помечала
   её `resolved` — конфликт исчезал с индикатора врача, хотя ничего не произошло. Теперь в
   `payload` ложатся `doctorApproved`/`doctorApprovedAt`/`doctorApprovedBy`, а статус не меняется:
   на индикаторе конфликт виден, пока слияние не состоялось.
3. **Проверка одобрения ДРУГОЙ клиники** сменилась с `status = 'resolved'` на
   `status IN ('pending','resolved')` — иначе ожидающее одобрение перестало бы считаться. Отказ
   врача (`escalated`) в это множество не входит: передумавший врач одобрения не оставляет.
4. **Состоявшееся слияние закрывает строки ВСЕХ клиник этой пары.** Учётка стала одна — блокера
   нет нигде; иначе строка клиники, которая одобрила и ждала, висела бы на её индикаторе вечно.
5. **Сигнал доходит до врача.** `mergeCompleted: boolean` (у которого не было ни одного потребителя)
   заменён на `mergeOutcome` — тип `MergePlatformUsersOutcome` в `packages/platform-merge`.
   `pgPatientMergeCandidate.mergeMedicalConflict` возвращает исход вместо `true`, маршрут
   `POST /api/doctor/account-merge-conflicts/[conflictId]` отвечает:
   `merged` → `200 {ok:true}`; `awaiting_other_organization` → `409 {ok:false,
   error:'awaiting_other_organization'}`; `conflict_not_found` → `403 {ok:false,error:'forbidden'}`.
6. **Модалка врача видит состояние.** `read_staff_patient_medical_merge_conflict` отдаёт
   `doctorApproved`; поле добавлено в `PatientMergeConflictDetails` и в zod-схему снимка.

Найдено собственным живым прогоном и починено там же: `read_…` выбирала `SELECT c.*`, а владелец
шва имеет КОЛОНОЧНЫЕ гранты — модалка врача отказывала бы `42501` на первом же живом вызове
(`trigger_appointment_id` двери не нужен и не объявлен). Столбцы перечислены поимённо.

### Живой прогон

```
RUN_DOCTOR_MEDICAL_MERGE_DOOR_DB=1 node --test \
  deploy/postgres/privileges/doctor-medical-merge-door.devDbProof.test.mjs
→ 3 pass / 0 fail

clinic A=a0000000-…-000000000001   clinic B=00000000-…-0000000c1001 (заведена в той же транзакции)
fixture inserted (2 accounts, clinical history in BOTH clinics, one pending row per clinic)
doctor A merge returned: {… "mergeOutcome":"awaiting_other_organization"}
doctor A indicator still shows pending medical conflicts: 1
doctor A still sees his conflict: yes, doctorApproved=true
after doctor A pressed merge: {"duplicate_merged_into":null,"duplicate_credentials":1,
                               "target_credentials":1,"clinic_a_row":"pending/true",
                               "clinic_b_row":"pending/null"}
doctor B merge returned: {… "mergeOutcome":"merged"}
after doctor B pressed merge: {"duplicate_merged_into":"…d1a1","duplicate_credentials":0,
                               "clinic_a_row":"resolved","clinic_b_row":"resolved","target_visits":4}
RESULT: PASS — the first clinic got a truthful refusal, the second one completed the merge
rolled back; fixture rows left in the database: 0
```

Слепая поломка (дверь перестаёт видеть блокер чужой клиники) — прогон краснеет:

```
DOCTOR_MEDICAL_MERGE_DOOR_FAULT=two-clinic-blindness …
FAULT INJECTED: the door no longer sees another clinic's blocker
doctor A merge returned: {… "mergeOutcome":"merged"}
RESULT: FAIL — doctor A got 'merged', expected 'awaiting_other_organization'
```

Ответ маршрута проверен отдельно на HTTP-границе (`mergeConflictOutcome.route.test.ts`, 3 pass).
Слепая поломка — убрать ветку `awaiting_other_organization` из маршрута:
`AssertionError: expected true not to be true`, 1 failed | 2 passed. Автоматических UI-тестов нет (§10a).

---

## Д2 — доверенность двери больше не выписывает та же роль

**Решение: снят колоночный `INSERT` роли `app_staff` на `patient_merge_candidates`** — не проверка
происхождения строки. Проверять происхождение нечем: при полном колоночном `INSERT` подделывается
и `payload`, то есть любая метка внутри строки forgeable. Снятие гранта убирает саму возможность.

Грант снят ТОЛЬКО в `deploy/postgres/privileges/declaration.ts` (§1: в миграции нет ни `GRANT`, ни
`REVOKE`, ни `POLICY` — проверено грепом, exit 1). Артефакты перегенерированы:

```
node deploy/postgres/privileges/generate-cli.mjs --all && … --all --port-context-only
pnpm run check:db-privileges-generated → артефакты соответствуют декларации побайтно, EXIT=0
diff артефактов (3 базы, 11 строк): снят
  GRANT INSERT (…) ON TABLE public.patient_merge_candidates TO "app_staff";
  добавлен payload владельцу шва; returns двери boolean → text.
```

Вместе с грантом убран `upsertPendingCandidate` — единственный код, которому этот `INSERT` был
нужен, и без единого вызывающего (`grep -rn "upsertPendingCandidate\|upsertPending("` по всему
репозиторию — только порт, сервис-обёртка и сам метод). Иначе следующий агент вернул бы грант по
`codePaths` декларации. `SELECT` и `UPDATE (status, resolved_at, resolved_by)` роли врача остались:
на них живут список конфликтов и закрытие пары.

### Живой прогон

```
clinic=a0000000-…-000000000001
fixture inserted (2 outsiders: no enrollment in this clinic, no medical history)
runtime role installed: session_user=bcb_dev_webapp_staff current_user=app_staff org=a0000000-…001
forgery refused: 42501 permission denied for table patient_merge_candidates
after: {"tgt_creds":1,"dup_creds":1,"forged_rows":0}
RESULT: PASS — app_staff cannot write the row the door trusts, and nothing moved
```

Слепая поломка (грант возвращают) воспроизводит находку аудита дословно:

```
DOCTOR_MEDICAL_MERGE_DOOR_FAULT=staff-insert …
FAULT INJECTED: app_staff column INSERT on patient_merge_candidates granted back
FORGED ROW: app_staff inserted its own pending medical_history conflict — INSERT SUCCEEDED
door returned: merged
after: {"tgt_creds":1,"dup_creds":0,"forged_rows":1}
RESULT: FAIL — app_staff still writes its own door authorization; door answered 'merged'
```

**Честный путь врача при этом не сломался:** оба прогона «слить» (одна клиника — E1, две клиники —
Д1) идут в той же транзакции, где кандидатные права таблицы переиграны целиком, то есть УЖЕ без
снятого гранта, и оба зелёные.

Оснастка прогонов доработана под это: раньше она переигрывала только `GRANT`-ы владельца шва,
поэтому СНЯТЫЙ грант до прогона не доезжал и проверялось старое состояние базы. Теперь права самой
`patient_merge_candidates` переигрываются целиком (`REVOKE` + `GRANT`-ы артефакта, в порядке файла).

---

## Гейты

```
pnpm run check:db-privileges-generated                        EXIT=0 (3 базы + port-context, побайтно)
pnpm run check:db-privileges-census                           EXIT=0
node --test definer-tenant-predicate.test.mjs function-census.test.mjs   29 pass / 0 fail
pnpm run test:db-privileges                                   385 tests: 187 pass / 0 fail / 198 skip
pnpm --filter @bersoncare/webapp typecheck                    чисто
pnpm --filter @bersoncare/platform-merge typecheck / build    чисто
eslint по всем изменённым файлам                              EXIT=0
vitest --project=route mergeConflictOutcome.route.test.ts     3 pass
```

Миграция на DEV НЕ применена — интроспекция после всех прогонов:

```
new_functions_present=0
status_check=CHECK (status = ANY (ARRAY['pending','resolved','dismissed']))   ← без 'escalated'
uq_unordered=NULL
ledger_rows=0
dev_app_staff_insert_still_live=true   ← грант снят в декларации, на DEV он уедет reconcile'ом при приземлении
proof_leftovers=0                      ← ни одной строки от прогонов не осталось
```

---

## 🔴 Развилки владельцу (работой не делал)

1. **Третий исход «ждём вторую клинику» — режим, которого в §18б нет.** Канон даёт врачу два
   действия и ничего не говорит про пару, у которой конфликт сразу в двух клиниках. Сделан
   безопасный минимум: врач получает отдельный код (не успех), конфликт остаётся на его индикаторе
   с пометкой «уже одобрено». **Вопрос:** что врач должен видеть и мочь дальше — строка остаётся
   с обеими кнопками (можно передумать и отказать) или превращается в «ждём вторую клинику» без
   действий? Текст для экрана — Э4b, но поведение решает владелец.
2. **Врач одобрил, потом отказал.** Сейчас отказ (`escalated`) отменяет одобрение: вторая клиника
   слить уже не сможет, пара уходит к администраторам платформы. Считаю это верным по §18б
   («отказать — отправить на разбор админов»), но это моё решение, а не строка канона.

## НЕ СДЕЛАНО

- **Пять вопросов ведущему из отчёта аудита третьего круга** (ориентация пары, «отказ не держится»,
  поверхность владельца шва, `patient_bookings` против §18) — по брифу работой не делал.
- **Сквозной HTTP-прогон** обеих дверей врача — невозможен: миграция ветки на DEV не применена и
  применять её запрещено. Поведение доказано настоящим движком и настоящими функциями под настоящей
  рантайм-ролью внутри транзакции с `ROLLBACK`, плюс маршрут проверен на своей HTTP-границе.
- **Экраны Э4b (Р4)** — следующий этап, вне скоупа.
- **Full CI по ветке не гонялся** — гонялись затронутые гейты (список выше).
- **Наблюдение, не чинил:** у `app_staff` остаётся `UPDATE (status, resolved_at, resolved_by)`, то
  есть врач может вернуть свою же `dismissed`/`escalated` строку в `pending`. Это в пределах его
  собственных полномочий (он мог нажать «слить» вместо «отказать») и стену клиники не пробивает,
  но если владелец захочет запретить и это — грант сузится тем же способом.

## Строка вердикта для накопителя ветки (в `feat` не пишу — ветка закрыта владельцем)

`Д1/Д2 закрыты (5079d2ca4): «слить» при конфликте в двух клиниках отвечает 409 awaiting_other_organization вместо ok:true, конфликт остаётся на индикаторе врача с пометкой doctorApproved, состоявшееся слияние закрывает строки всех клиник пары; колоночный INSERT app_staff на patient_merge_candidates снят в declaration.ts вместе с мёртвым upsertPendingCandidate — подделка основания двери отказывает 42501. Живые прогоны против bcb_webapp_dev: 3 pass, три слепые поломки краснеют. Попутно: read_ выбирала SELECT c.* и отказала бы 42501 на первом живом вызове — столбцы перечислены.`

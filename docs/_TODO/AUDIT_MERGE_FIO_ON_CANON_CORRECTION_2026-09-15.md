FAIL

# Аудит коррекции Э3 по F1: ответ человека про ФИО за дверью врача

**Кандидат:** `aa41f2af123a2f8ec0dc982f6dc523e3c53487e1`.

**Authority:** `docs/ARCHITECTURE/AUTH_AND_IDENTITY_CANON.md` §18, §18а, §18б; прямой
критерий брифа: старые pending-строки без ответа не должны становиться вечными.

## Блокирующая находка

### F1. Медицинская pending-строка с обратной ориентацией навсегда отвергает свежий ответ человека

Достижимая последовательность:

1. Для пары уже существует обычная pending-строка `target → duplicate`. Это штатное состояние
   старого механизма кандидатов, которое новая SQL-дверь прямо сохраняет.
2. `app.record_patient_medical_merge_conflict` не может занять ту же ordered-пару из-за
   `uq_patient_merge_candidates_org_pending_pair` и намеренно создаёт медицинскую строку наоборот:
   `duplicate → target`.
3. Старой медицинской строке без `humanFioDecision` врач честно получает
   `fio_decision_required`.
4. На следующем входе человек снова отвечает на вопрос §18а. SQL-дверь находит медицинскую строку
   по unordered-паре и обновляет именно её `payload`; `conflictId` остаётся тем же.
5. `pgPatientMergeCandidate.mergeMedicalConflict` вызывает движок в порядке полей строки, то есть
   `duplicate → target`, а сохранённый `HumanMergeDecision` привязан к показанному человеку порядку
   `target → duplicate`. Проверка пары в движке объявляет свежий ответ негодным и снова возвращает
   `fio_decision_required`. Повторный вход обновляет тот же ответ, но ориентацию не меняет — петля
   бесконечна.

Это нарушает §18а и критерий брифа о проходимости отказа. Последствие наблюдаемое и дорогое:
человек отвечает, врач повторно одобряет, но учётки никогда не сливаются и выбранное ФИО никогда не
становится каноническим.

Падающий acceptance-сценарий добавлен в
`deploy/postgres/privileges/doctor-medical-merge-fio.proofBody.mjs`. Он использует настоящую
именованную DEV, кандидатные функции/права внутри транзакции и обязательный `ROLLBACK`; UI не
автоматизирует. Вызов врача теперь берёт `anchor_user_id`/`candidate_user_id` из реальной строки —
ровно как репозиторий продукта, а не из первоначальной пары фикстуры.

```text
/home/dev/brain/host-orch/run-tests.sh "cd /home/dev/dev-projects/bcb-wt-conflict-screens && RUN_DOCTOR_MEDICAL_MERGE_DOOR_DB=1 DOCTOR_MEDICAL_MERGE_DOOR_ECHO=1 apps/webapp/node_modules/.bin/tsx --test deploy/postgres/privileges/doctor-medical-merge-door.devDbProof.test.mjs"

medical conflict orientation beside the legacy row:
  {"anchor":"...f2b2","candidate":"...f2b1"}
doctor merge WITHOUT a stored answer returned: ... "mergeOutcome":"fio_decision_required"
next entry updated the same pending conflict: yes
stored human FIO answer = yes
doctor merge after the person's new answer returned: ... "mergeOutcome":"fio_decision_required"
FIO after the recovered loop:
  {"users_last_name":"Иванов","identity_last_name":null,"duplicate_merged_into":null}
# tests 5
# pass 4
# fail 1
rolled back; fixture rows left in the database: 0
```

## Проверка пунктов брифа

1. **Ответ действительно доезжает — ЦЕЛО для обычной ориентации пары.** До добавления сценария F1
   та же обязательная команда дала `# tests 5`, `# pass 5`, `# fail 0`. Целевая учётка была
   «Иванов», человек выбрал «Сидоров»; после врача `platform_users.last_name = 'Сидоров'`,
   `user_identity.last_name = 'Сидоров'`, дубликат получил `merged_into_id` цели. Финальный прогон
   сохраняет этот сценарий зелёным; красный только сценарий обратной pending-строки.

2. **Отказ не стал новым тупиком — НЕТ.** Обычная старая строка без ответа проходит цикл после
   следующего ответа, это отдельно было получено зелёным прогоном. Но штатная коллизия ordered-пары
   разворачивает медицинскую строку и делает тот же цикл вечным — падающий прогон F1 выше.

3. **Э1, Э4a и причины исходов двери — ЦЕЛО в проверенной границе.** В финальном прогоне первые
   четыре поднабора зелёные: обычная дверь врача, две организации (`awaiting_other_organization` →
   `merged`), запрет врачу создать основание двери, чужая организация (`conflict_not_found`, обе
   строки нетронуты). HTTP-маршрут отдельно проверен командой:

   ```text
   /home/dev/brain/host-orch/run-tests.sh "cd /home/dev/dev-projects/bcb-wt-conflict-screens && pnpm --dir apps/webapp exec vitest run --project route 'src/app/api/doctor/account-merge-conflicts/[conflictId]/mergeConflictOutcome.route.test.ts'"
   Test Files 1 passed; Tests 4 passed.
   ```

4. **Инъекции — ЦЕЛО для двух обязательных классов, непойманных 0 из 2.** Подробности в таблице
   ниже. Временная продуктовая поломка после прогона откатена; `git diff` по
   `packages/platform-merge/src/pgPlatformUserMerge.ts` был пуст.

5. **Обёртка Э3 от чужого клона — ЦЕЛО.** При временной замене source-root на
   `/home/dev/dev-projects/bcb-wt-fio-dialog/packages/platform-merge/src` команда через host-lock
   получила `wrapper_rc=1` и
   `AssertionError: engine would come from another clone: .../bcb-wt-fio-dialog/packages/platform-merge/src`.
   Положительный запуск:

   ```text
   /home/dev/brain/host-orch/run-tests.sh "cd /home/dev/dev-projects/bcb-wt-conflict-screens && bash docs/audit/evidence/merge-fio-on-canon-fix-2026-09-15/e3-rerun.sh docs/audit/evidence/merge-fio-on-canon-2026-09-15/e3-live-fio-scenarios.rerun.mts AUDIT_PGHOST"
   engine bundled from: /home/dev/dev-projects/bcb-wt-conflict-screens/packages/platform-merge/src
   PASS 1a ... PASS 3b; RESIDUE {"platform_users":0,"user_identity":0}
   ```

## Инъекции аудитора

| Поломка | Точный прогон и красный результат | Непоймано |
|---|---|---:|
| Дверь записи не кладёт ответ в `payload`: `DOCTOR_MEDICAL_MERGE_DOOR_FAULT=fio-decision-not-persisted` | `/home/dev/brain/host-orch/run-tests.sh "cd /home/dev/dev-projects/bcb-wt-conflict-screens && RUN_DOCTOR_MEDICAL_MERGE_DOOR_DB=1 DOCTOR_MEDICAL_MERGE_DOOR_ECHO=1 DOCTOR_MEDICAL_MERGE_DOOR_FAULT=fio-decision-not-persisted apps/webapp/node_modules/.bin/tsx --test --test-name-pattern='выбранное человеком ФИО' deploy/postgres/privileges/doctor-medical-merge-door.devDbProof.test.mjs"` → `# tests 1`, `# pass 0`, `# fail 1`; `stored human FIO answer = NO`, выбранное ФИО не применено, `ROLLBACK`, остаток 0 | 0 |
| Движок вопреки ответу возвращает target: временно `if (selection.source === 'duplicate') return target` | `/home/dev/brain/host-orch/run-tests.sh "cd /home/dev/dev-projects/bcb-wt-conflict-screens && RUN_DOCTOR_MEDICAL_MERGE_DOOR_DB=1 DOCTOR_MEDICAL_MERGE_DOOR_ECHO=1 apps/webapp/node_modules/.bin/tsx --test --test-name-pattern='выбранное человеком ФИО' deploy/postgres/privileges/doctor-medical-merge-door.devDbProof.test.mjs"` → `# tests 1`, `# pass 0`, `# fail 1`; обе таблицы вернули «Иванов» вместо «Сидоров», `ROLLBACK`, остаток 0 | 0 |

## Остальные проверки

```text
/home/dev/brain/host-orch/run-tests.sh "cd /home/dev/dev-projects/bcb-wt-conflict-screens && bash deploy/host/migrate-dev.sh --preflight --runtime-env-root /home/dev/dev-projects/BersonCareBot"
Drizzle owner-ordered migration validated and rolled back: pending=1 total=224 unapplied=0
migrate-dev preflight: PASS

/home/dev/brain/host-orch/run-tests.sh "cd /home/dev/dev-projects/bcb-wt-conflict-screens && pnpm run check:db-privileges-generated && node --test deploy/postgres/privileges/migration-order.test.mjs"
generated privileges + port-context: совпадают побайтно
# tests 29; # pass 29; # fail 0

pnpm --filter @bersoncare/platform-merge exec tsc --noEmit -p tsconfig.json && pnpm --dir apps/webapp exec tsc --noEmit -p tsconfig.json
exit 0
```

Миграция создаёт/заменяет только `app.record_patient_medical_merge_conflict`; права остаются в
`deploy/postgres/privileges/declaration.ts`, в SQL-миграции `GRANT`/`REVOKE`/`CREATE POLICY` нет.

## Строка вердикта для ведущего

```text
Э3/F1, коррекция aa41f2af1 — FAIL: обычный путь сохраняет и применяет ответ человека, но при уже
существующей ordered pending-строке медицинская строка создаётся в обратной ориентации; следующий
ответ обновляет ту же строку, а дверь врача отвергает его как относящийся к другой паре и навсегда
возвращает fio_decision_required. Падающий живой DB acceptance: 5 тестов, 4 pass, 1 fail, ROLLBACK,
остаток 0. Две обязательные инъекции красные, непойманных 0; preflight PASS; полный CI не гонялся.
```

## НЕ СДЕЛАНО

- Продуктовый fix F1 не делался: аудитор оставил падающий acceptance-test и отчёт.
- Полный CI (`pnpm run ci`, `scripts/ci-record.mjs`) не запускался — запрещён брифом.
- Миграция на DEV не применялась; выполнен только owner-aware preflight с `ROLLBACK`. TEST и оба
  PROD не трогались.
- Второй Next-сервер и автоматические UI-тесты не запускались. Живой UI до landing не принимался.
- Строка вердикта в `docs/_TODO/NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md` не добавлялась.
- Три остальные заявленные автором инъекции повторно не гонялись; их базовые наблюдаемые сценарии
  остались зелёными в финальном прогоне.

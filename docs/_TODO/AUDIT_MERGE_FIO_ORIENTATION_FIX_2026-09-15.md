PASS

# Аудит коррекции Э3: ориентация пары берётся из ответа человека

**Кандидат:** `cb17938e5117b502e9dbcbc5eb9f439d84671b4e`.
**Отчёт автора:** `3e54dcf9e` — заявка, не доказательство.
**Authority:** `docs/ARCHITECTURE/AUTH_AND_IDENTITY_CANON.md` §18, §18а, §18б и
`docs/_TODO/MERGE_MECHANISM_REWRITE_2026-09-14.md`, Э3.
**Finding:** MUST FIX 0.

## Вердикт по diff живого сценария

Проверено построчно:

```text
git diff --unified=0 9cb655e87..cb17938e5 -- \
  deploy/postgres/privileges/doctor-medical-merge-fio.proofBody.mjs
```

Результат `git diff --numstat ...` — `9` добавленных и `2` удалённых строки. Изменения ровно такие:

1. импортирован `mergeOrientationForStoredDecision`;
2. после прежнего разбора сохранённого ответа вызван этот общий продуктовый helper с парой из строки;
3. прежние аргументы движка `candidate.target_id` / `candidate.duplicate_id` заменены на полученные
   `targetId` / `duplicateId`.

**Ни одна проверка, ветка отказа, порог, ожидаемое значение, фикстура или итоговое утверждение не
изменены. Сценарий не ослаблен.** Изменён только выбор ориентации пары. Вызов общего helper не создаёт
самостоятельный oracle: oracle сценария остаётся конечным состоянием живой PostgreSQL по §18а.

## Живой DEV-прогон точного кандидата

Исходный кандидат проверен на detached `cb17938e5`:

```text
/home/dev/brain/host-orch/run-tests.sh "cd /home/dev/dev-projects/bcb-wt-conflict-screens && RUN_DOCTOR_MEDICAL_MERGE_DOOR_DB=1 DOCTOR_MEDICAL_MERGE_DOOR_ECHO=1 apps/webapp/node_modules/.bin/tsx --test deploy/postgres/privileges/doctor-medical-merge-door.devDbProof.test.mjs"
```

Результат: `# tests 5`, `# pass 5`, `# fail 0`. Все пять тел завершились
`rolled back; fixture rows left in the database: 0`.

Аудитор добавил в тот же существующий DB-proof два недостающих конечных наблюдения: `{source:'target'}`
на перевёрнутой строке и ответ от другой пары. Чтобы исключить влияние более позднего merge-HEAD ветки,
коммит теста `d611326fb` был временно наложен поверх точного кандидата; проверенный detached SHA —
`2bba27970` (`cb17938e5` + только два audit-test файла). Та же точная команда получила:

```text
source target on reversed row returned: ... "targetId":"...f2d1","duplicateId":"...f2d2","mergeOutcome":"merged"
source target FIO after merge: ... "users_last_name":"Иванов","identity_last_name":"Иванов","duplicate_merged_into":"...f2d1"
foreign-pair answer returned: ... "mergeOutcome":"fio_decision_required"
foreign-pair accounts unchanged: yes
# tests 5
# pass 5
# fail 0
rolled back; fixture rows left in the database: 0
```

Это доказывает смысл обеих ролевых ссылок. На перевёрнутой строке `{source:'duplicate'}` оставил
«Сидоров» из показанной duplicate-учётки и слил `...f2b2` в показанную target `...f2b1`;
`{source:'target'}` оставил «Иванов» из показанной target-учётки и слил `...f2d2` в `...f2d1`.
Роль трактуется относительно prompt человека, не относительно `anchor`/`candidate` строки.

## Fail-closed и обычные пути

Ответ с prompt другой пары был сохранён в настоящую pending-строку. Дверь вернула
`fio_decision_required`; JSON-снимки обеих строк `platform_users` и всех относящихся строк
`user_identity` до и после совпали; слияния не было. Весь probe шёл против именованной
`bcb_webapp_dev` внутри `BEGIN`/`ROLLBACK`, остаток — `0`.

Та же команда одновременно оставила зелёными:

- Э4a: обычное одобрение врача завершило `merged` под `app_staff`;
- Э1/две клиники: первый врач получил `awaiting_other_organization`, второй завершил `merged`;
- врач не смог подделать основание двери: `42501`, `forged_rows=0`;
- чужая организация получила `conflict_not_found`, обе учётки и обе pending-строки остались нетронуты;
- перевёрнутая legacy-строка без ответа сначала вернула `fio_decision_required`, следующий ответ обновил
  ту же строку и завершил `merged`.

Бесконфликтные и обычные Э3-пути отдельно прошли существующей обёрткой:

```text
/home/dev/brain/host-orch/run-tests.sh "cd /home/dev/dev-projects/bcb-wt-conflict-screens && bash docs/audit/evidence/merge-fio-on-canon-fix-2026-09-15/e3-rerun.sh docs/audit/evidence/merge-fio-on-canon-2026-09-15/e3-live-fio-scenarios.rerun.mts AUDIT_PGHOST"
```

Результат: `engine bundled from: /home/dev/dev-projects/bcb-wt-conflict-screens/packages/platform-merge/src`,
`PASS 1a`–`PASS 3b`, `RESIDUE {"platform_users":0,"user_identity":0}`.

При временной замене `sourceRoot` сценария на
`/home/dev/dev-projects/BersonCareBot/packages/platform-merge/src` та же команда получила
`AssertionError: engine would come from another clone` и `wrapper_rc=1`. Временная замена откатена;
`git diff --exit-code` по файлу после проверки — `0`.

HTTP-семантика причины отказа проверена:

```text
/home/dev/brain/host-orch/run-tests.sh "cd /home/dev/dev-projects/bcb-wt-conflict-screens && pnpm --dir apps/webapp exec vitest run --project route 'src/app/api/doctor/account-merge-conflicts/[conflictId]/mergeConflictOutcome.route.test.ts'"
```

Результат: `Test Files 1 passed (1)`, `Tests 4 passed (4)`.

Статическая проверка:

```text
pnpm --filter @bersoncare/platform-merge exec tsc --noEmit -p tsconfig.json && pnpm --dir apps/webapp exec tsc --noEmit -p tsconfig.json
```

Результат: exit `0`.

## Инъекции аудитора

Обе временные поломки внесены в production-код по очереди, не ломали сборку, прогнаны одной и той же
живой командой и полностью откатены. После отката `git diff --exit-code` по двум production-файлам — `0`.

| Поломка | Точная команда и красный результат | Непоймано |
|---|---|---:|
| `mergeOrientationForStoredDecision` при совпавшей неупорядоченной паре возвращает порядок строки (`return fromRow`) — восстановлено старое поведение F1 | `/home/dev/brain/host-orch/run-tests.sh "cd /home/dev/dev-projects/bcb-wt-conflict-screens && RUN_DOCTOR_MEDICAL_MERGE_DOOR_DB=1 DOCTOR_MEDICAL_MERGE_DOOR_ECHO=1 apps/webapp/node_modules/.bin/tsx --test deploy/postgres/privileges/doctor-medical-merge-door.devDbProof.test.mjs"` → `# tests 5`, `# pass 4`, `# fail 1`; recovered merge и оба утверждения перевёрнутой строки покраснели; `ROLLBACK`, остаток `0` | 0 |
| За дверью врача чужой/stale ответ объявляется пригодным (`const usableHumanDecision = humanDecision`) — снята сверка пары и snapshot | та же точная команда → `# tests 5`, `# pass 4`, `# fail 1`; ответ чужой пары дал `mergeOutcome:"merged"`, `foreign-pair accounts unchanged: NO`; `ROLLBACK`, остаток `0` | 0 |

## Строка вердикта для ведущего

```text
Э3/F1, коррекция cb17938e5 — PASS: построчный diff живого сценария не ослабил ни одной проверки,
порога или ожидания; изменён только выбор пары через общий helper. Точный кандидат с усиленным
rollback-only DEV acceptance: 5 тестов, 5 pass, 0 fail, остаток 0. Обе роли ответа человека
сохраняют смысл на перевёрнутой строке; чужая пара получает fio_decision_required без изменения
учёток. Э1, Э4a, две клиники, чужая организация и бесконфликтные пути зелёные. Две поведенческие
инъекции красные, непойманных 0; wrapper чужого checkout отказал. Полный CI не запускался.
```

## НЕ СДЕЛАНО

- Продуктовый код не исправлялся: blocking findings нет.
- Наблюдение о направлении слияния при отсутствии конфликта ФИО не повторялось finding и не
  исправлялось: authority для такой работы нет.
- Полный CI (`pnpm run ci`, `scripts/ci-record.mjs`) не запускался — запрещён брифом.
- Миграция на DEV не применялась; кандидатные SQL и права существовали только внутри откатываемых
  proof-транзакций. TEST и оба PROD не трогались.
- Второй Next-сервер, автоматические UI-тесты и живая UI-приёмка не запускались.
- Строка вердикта в очередь не добавлялась.

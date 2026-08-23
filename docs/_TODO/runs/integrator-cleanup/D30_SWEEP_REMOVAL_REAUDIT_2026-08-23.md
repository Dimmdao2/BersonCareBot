# D30 Ш3 — повторный независимый аудит снятия legacy-sweep, круг 2, 2026-08-23

**Вердикт: PASS, FOR LAND. Блокеров нет.**

Ветка `wt/d30-sweep-removal-20260823`, аудируемый коммит `fc86fd727`; дерево на `139e5887e`
(merge из `feat/doctor-ui-rebuild`, приносит только доки — 7 файлов, все `docs/**`, кода не трогает).
Authority — `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`, D30 (3).
Отчёт исполнителя `D30_SWEEP_REMOVAL_FIX2_2026-08-23.md` доказательством не считался: всё ниже
перемерено своим прогоном. Предыдущий вердикт — `D30_SWEEP_REMOVAL_AUDIT_2026-08-23.md` (`FAIL`, Б1–Б3).

Аудитор продуктовый код не правил. Инъекции отказа откачены, дерево чистое (`git status --porcelain`
пуст), `--execute`/TEST/PROD/push не выполнялись.

## Б1 — ЗАКРЫТ. Сторож не бумажный, проверено пятью инъекциями

Появился `apps/webapp/src/infra/repos/pgSpecialistTasks.writeTimeProducer.unit.test.ts` (138 строк):
мокает `pgOutgoingDeliveryQueue`, `drizzleMutationTx`, `db-principal`, `drizzle`, зовёт живой
`createPgSpecialistTasksPort` и проверяет по одному вызову корня на каждом из четырёх путей — с той же
транзакцией, той же причиной и фактическим набором доставок, а для `delete` — порядок вызова до `tx.delete`.

Базовый прогон — 4/4 PASS. Дальше я сам снимал вызов `queueWriter.replaceSpecialistTaskReminderGeneration`
из `pgSpecialistTasks.ts` (скриптом, с ассертом, что вырезается именно этот блок) и гнал тест:

| Снятый вызов | Строка в `pgSpecialistTasks.ts` | Результат |
| --- | --- | --- |
| `create` | 119–123 | `1 failed / 3 passed`, красный `…unit.test.ts:93` |
| `update` | 159–163 | `1 failed / 3 passed`, красный `…unit.test.ts:106` |
| `complete` | 191–195 | `1 failed / 3 passed`, красный `…unit.test.ts:117` |
| `delete` | 207–211 | `1 failed / 3 passed`, красный `…unit.test.ts:128` |
| **все четыре сразу** | — | **`4 failed (4)`** |

Последняя строка — ровно та инъекция, которая в круге 1 оставляла зелёными 430 файлов / 1990 тестов.
Теперь она краснеет полностью. Каждая инъекция бьёт **только** свой тест — сторож адресный, не «всё
падает от всего».

Отдельно проверено, что сторож попадает в **штатный** набор, а не только в ручной вызов файла:
`pnpm exec vitest list` без фильтра перечисляет все четыре его теста как `[unit] …writeTimeProducer…`.
То есть завтрашняя регрессия покраснеет в обычном прогоне.

Сторож ловит не только удаление вызова: `create`/`update` ассертят непустой `deliveries: [DELIVERY]`,
`complete`/`delete` — пустое поколение с их причинами, `delete` — порядок относительно удаления строки.
Подмена причины или молчаливое обнуление доставок тоже краснеют.

## Б2 — ЗАКРЫТ. Тело sweep снято, кросс-арендного скана не осталось

Своя перепись по всему дереву (не по отчёту):

```bash
grep -rn "enqueueDueReminders\|listDueReminders" . \
  --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=dist
```

14 совпадений, **все до одного — документы** (`docs/_TODO/**`: очередь аудитов, план Ш3, брифы, прошлые
отчёты — исторические записи, правке не подлежат). В `apps/**`, `deploy/**`, `packages/**` — **ноль**.
Оба метода сняты из `SpecialistTasksPort`, `service.ts`, `pgSpecialistTasks.ts`, `inMemorySpecialistTasks.ts`
и из мока `service.mechanicWriteClearance.test.ts`.

Кросс-арендный скан ушёл вместе с телом. Единственный читатель таблицы — `pgSpecialistTasks.ts`
(`grep` по импортам `db/schema/specialistTasks`: один файл). Оставшиеся его методы скана без организации
не дают: `listForOwner` — по `ownerUserId` плюс `organizationId` принципала, когда он есть;
`getByIdForOwner`, `markReminderSent`, `create/update/complete/delete` — по идентификатору задачи и владельцу.
Заряженного ружья в порту больше нет.

## Б3 — ЗАКРЫТ по существу блокера; в записи остался один долг, старше ветки

Блокер был про путь, удалённый **тем же коммитом**. Он снят: в `REV10_CLINICAL_ACCESS['public.specialist_tasks'].codePaths`
больше нет ни `dispatchDueReminders.ts`, ни семантически устаревшего `reconcileJobKeys.ts`
(проверил сам: в живом `reconcileJobKeys.ts`, 22 строки, ни одного упоминания задач специалиста).

Я проверил не отчёт, а весь файл — своим скриптом сверил **каждый** `codePath` с диском:
**1542 записи, 32 указывают на несуществующие файлы**, в 12 отношениях. Одна из них — в затронутой записи:

- `relation-access.ts:8194` → `apps/integrator/src/infra/scripts/check-d30-outgoing-delivery-claim-concurrency.ts`.

**Это не блокер, и вот доказательство.** Файл удалён коммитом `bfe6b48f0` (17.08, «fix(salvage): remove
alternate B0 paths…»), который является предком состояния **до** работы D30: `git cat-file -e 3f4378d62^:<путь>`
→ `does not exist`, а сама строка в декларации лежит там же с тех пор (`git show 3f4378d62^:relation-access.ts`
даёт её на строке 8194 и ещё в пяти отношениях). Ветка не добавила ни одного висячего пути и убрала один.
Мой собственный прошлый аудит эту строку пропустил — смотрел диффом, а не по всему массиву; отмечаю как
свою неточность, а не как новый долг ветки.

**Практическое следствие для рекомендации исполнителя.** Он написал, что гейт существования путей «дёшево»
включить. Замер говорит иначе: включённый сегодня, он краснеет на 32 записях в 12 отношениях —
`be_branches`, `be_organization_members`, `media_files`, `org_enrollments`, `platform_users`,
`reminder_rules`, `specialist_tasks`, `support_conversation_messages`, `support_conversations`, `tests`,
`user_channel_bindings`, `user_channel_preferences`, `user_notification_topic_channels`,
`user_web_push_subscriptions`. Гейт правильный, но перед ним нужен отдельный проход чистки — это
самостоятельный пункт скоупа для владельца, а не хвост Ш3. В этом круге гейт и не трогали, и правильно.

## Долг strict-typecheck (пункт 4 брифа) — ПОДТВЕРЖДЁН как внешний

Исполнитель назвал его существовавшим до ветки. Проверил прямым замером, а не рассуждением: временно
подложил в дерево версии `declaration.ts` и `types.ts` из `3f4378d62^` (состояние до работы D30) и прогнал
тот же строгий typecheck.

```bash
git checkout 3f4378d62^ -- deploy/postgres/privileges/declaration.ts deploy/postgres/privileges/types.ts
./node_modules/.bin/tsc --noEmit --strict -p deploy/postgres/privileges   # rc=2
# declaration.ts(3982,9) TS2322: "D20 enqueue root inserts idempotently and prunes expired sent rows"
# declaration.ts(7148,9) TS2322: "exact UPDATE in migration 0050"
git checkout HEAD -- deploy/postgres/privileges/declaration.ts deploy/postgres/privileges/types.ts
```

Те же два литерала, те же коды ошибок; строки 3982/7148 против нынешних 3981/7147 — сдвиг ровно на одну
строку, которую ветка из файла убрала. Источники литералов тоже вне ветки: `ece43484f` (21.08) и
`566a7935f` (20.08), оба — предки состояния до D30. Долг существовал ДО ветки, блокером не является.

Единственная правка `declaration.ts` в ветке — снятие `'api/internal/specialist-task-reminders/tick:POST'`
из `WEBAPP_WORKER_SOURCES` (в круге 1, `3f4378d62`). Она обязательная: роут удалён. Круг 2 (`fc86fd727`)
`declaration.ts` не трогал вовсе.

## Ничего лишнего не удалено — разбор диффа

`fc86fd727` трогает 8 файлов, из них 2 — доки. Построчно:

- `pgSpecialistTasks.ts` −45: два метода плюс осиротевшие импорты `isNotNull`, `lte`. `asc`/`desc`/`and`/`eq`/`isNull`
  остались и используются (`listForOwner` 78–83). `mapRow`, `prepareReminderDeliveries`, `queueWriter` живы,
  четыре вызова корня на месте (119, 159, 191, 207).
- `inMemorySpecialistTasks.ts` −11, `ports.ts` −2, `service.ts` −8, мок в `service.mechanicWriteClearance.test.ts` −2 —
  ровно эти два метода, симметрично порту.
- `relation-access.ts` −2 — два `codePaths` из Б3.
- новый файл сторожа +138.

Write-time producer, `pgOutgoingDeliveryQueue`, `prepareReminderDeliveries`, `buildAppDeps`, очередь и
интегратор не тронуты. Миграций в коммите нет, строк `GRANT/REVOKE/CREATE ROLE/POLICY` не добавлено.

## Свои прогоны гейтов

```bash
node deploy/postgres/privileges/generate-cli.mjs --all --check
# 4/4 артефакта совпадают побайтно (privileges|org-allowlist × bcb_webapp_dev|bersoncarebot_test), rc=0
node --test deploy/postgres/privileges/relation-access.test.mjs      # 43/43 PASS
node deploy/postgres/privileges/generate-cli.mjs --census            # обе базы: 217 ACTIVE / 3298 файлов, ok
node deploy/postgres/privileges/generate-cli.mjs --gaps              # обе базы: unresolved=0 gaps=0
pnpm --dir apps/webapp exec vitest --run src/infra/repos src/modules/specialist-tasks
# 67 файлов PASS / 4 skipped; 267 тестов PASS / 12 skipped
pnpm --dir apps/webapp run typecheck                                 # rc=0
pnpm --dir apps/webapp exec eslint <шесть затронутых файлов>          # rc=0
node /home/dev/brain/tools/cronport.mjs list | grep -i specialist    # пусто
```

## Замечания без блокировки

1. **32 висячих `codePath` по всему `relation-access.ts`** (см. Б3). Ветка их не создавала и не обязана
   чистить; но пока они есть, гейт существования путей включить нельзя — это отдельный пункт владельцу.
2. **`markReminderSent` — та же мёртвая поверхность, что снятая пара, но старше ветки.** У него тоже нет
   нетестового вызывающего ни в порту, ни в сервисе, ни в обеих реализациях. Проверил происхождение:
   на `3f4378d62^` набор файлов с этим именем ровно тот же — сирота уже тогда. Фактический mark-sent давно
   живёт в интеграторе (`apps/integrator/src/infra/db/writePort.ts:218`, исход `specialistTask.reminder.markSent`).
   Снимать в этой ветке НЕ надо: в плане Ш3 его нет, а в отличие от `listDueReminders` он не скан —
   пишет по идентификатору задачи. Кандидат в следующую чистку, вопрос владельцу, не работа из находки.
3. **Пустые каталоги `apps/webapp/src/app/api/internal/specialist-task-reminders/tick`** остались на диске
   этого worktree после `git rm`. В коммите их нет (`git ls-files` по пути пуст), пустых каталогов git не
   хранит, на свежем клоне их не будет, роут App Router из пустого каталога не появляется. Приземлению
   не мешает.
4. **PROD-хвост из прошлого аудита в силе и не измерен.** Сверка 21.08 закрывала `bcb_webapp_dev` и
   `bersoncarebot_test`; задачи с будущим `remind_at`, проставленным на проде до появления write-time
   producer, материализовать после снятия sweep будет некому. По `D30_SCHEDULER_REVERSAL_PLAN.md`
   («PROD не блокирует и не открывает Ш3») это вне гейта — но при выкатке на прод это отдельный шаг,
   а не «уже сделано».
5. **`api.md` по-прежнему не описывает write-time producer** (замечание 2 прошлого аудита не закрывалось
   и в брифе круга 2 не стояло). Одна фраза в §96 — вне этого гейта.

## Итог

Три блокера круга 1 закрыты по существу и проверены своим прогоном, а не по отчёту. Долг strict-typecheck
подтверждён внешним прямым замером. Лишнего не удалено, гейты прав зелёные, дерево чистое.

**PASS, FOR LAND.**

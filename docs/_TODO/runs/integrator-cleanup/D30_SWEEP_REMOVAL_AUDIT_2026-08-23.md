# D30 Ш3 (3) — независимый аудит снятия legacy-sweep задач специалиста, 2026-08-23

**Вердикт: FAIL, NOT FOR LAND.**

Ветка `wt/d30-sweep-removal-20260823`, аудируемый коммит `3f4378d62` (дерево на `fa8c0d4ed`).
Authority — `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` D30, пункт (3);
детализация — `D30_SCHEDULER_REVERSAL_PLAN.md` Ш3. Отчёт исполнителя
(`D30_SWEEP_REMOVAL_2026-08-23.md`) доказательством не считался: всё ниже перепроверено своим прогоном.

Аудитор код не правил. Временные поломки (инъекция отказа) откачены, дерево чистое
(`git status --porcelain` пуст), `--execute`/TEST/PROD/push не выполнялись.

## Блокеры

### Б1. Покрытие write-time пути мнимое: снят страховочный тик, а сторожа взамен нет

Инъекция отказа (обязательная по брифу) проведена дважды.

1. Убран вызов `queueWriter.replaceSpecialistTaskReminderGeneration` из `create`
   (`apps/webapp/src/infra/repos/pgSpecialistTasks.ts:118`) — набор, который исполнитель приводит
   как доказательство (`pgSpecialistTaskReminderGenerationDoor.unit.test.ts` + `src/modules/specialist-tasks`),
   остался **зелёным: 3 файла / 9 тестов**.
2. Нейтрализованы **все четыре** места записи (`create`, `update`, `complete`, `delete`) —
   **полный набор вебаппа остался зелёным: 430 файлов, 1990 тестов** (`pnpm exec vitest --run`,
   после сборки `packages/{db-principal,operator-db-schema,error-tracking,platform-merge}`;
   без сборки пакетов 83–127 файлов падают на резолве, это не связано с коммитом).

То есть после снятия sweep поведение «create/update кладут строку в
`public.outgoing_delivery_queue`, complete/delete её терминализуют» **не стережёт ни один тест**.
Цитируемый door-тест 4/4 проверяет другое — что сам корень записи едет объявленной функцией
(`app.replace_specialist_task_reminder_generation`), а не DML по очереди; он ничего не знает о том,
зовут ли этот корень `create`/`update`/`complete`/`delete`. Тик, который до сегодняшнего дня
подхватывал непроматериализованные задачи, снят — краснеть завтра нечему.

**Положительная сторона проверена отдельно и она в порядке.** Аудитор написал временный прогон
(в дереве не оставлен, текст — приложение А): на коммите `3f4378d62` все четыре пути зовут корень
ровно один раз, на той же транзакции, с правильными причинами —
`create`/`update` → `SPECIALIST_TASK_REMINDER_SUPERSEDED` с непустым набором доставок,
`complete` → `SPECIALIST_TASK_REMINDER_CANCELLED` с `deliveries: []`,
`delete` → `SPECIALIST_TASK_REMINDER_DELETED` с `deliveries: []` **до** удаления строки задачи.
**4/4 зелёные.** Под той же инъекцией (сломан `create`) этот прогон краснеет ровно одним тестом —
то есть сторож такого класса возможен и стоит ~80 строк.

Итог Б1: снятие ничего не потеряло **сегодня**, но защиты от потери **завтра** нет. Ровно этот
класс регрессии тик и закрывал. Закрывается тестом уровня call-site (приложение А — готовый черновик).

### Б2. Сам sweep не снят — снята только его дверь

Плановый кандидат Ш3 назван дословно: route, его тик `enqueueDueReminders`
(`pgSpecialistTasks.ts:266`), запись в `cronJobRegistry.ts`, абзацы `HOST_DEPLOY_README.md`.
Сняты route, диспетчер `dispatchDueReminders.ts` и запись реестра. **Тело sweep осталось:**

- `apps/webapp/src/infra/repos/pgSpecialistTasks.ts:236` `listDueReminders` и `:271` `enqueueDueReminders`;
- `apps/webapp/src/modules/specialist-tasks/ports.ts:43-45` (оба метода в интерфейсе порта);
- `apps/webapp/src/modules/specialist-tasks/service.ts:90-99` (оба метода в сервисе);
- `apps/webapp/src/infra/repos/inMemorySpecialistTasks.ts:87,98`.

Ни одного нетестового вызова у них больше нет (перепись: `grep -rn "enqueueDueReminders\|listDueReminders" apps`).
Это не безобидный хвост: `listDueReminders` (`:238-250`) фильтрует только по
`completed_at IS NULL AND remind_at <= now AND reminder_sent_at IS NULL` — **без организации**,
то есть это ровно тот кросс-арендный скан по всем врачам и всем клиникам, который зафиксирован в
`DOCTOR_TASK_COMPLETE_ENQUEUE_2026-08-22.md` §В2. Оставлять его в публичной поверхности порта и
сервиса после снятия единственного вызывающего — заряженное ружьё в ящике: один вызов возвращает
кросс-арендный sweep, и ни один тест этого не заметит (см. Б1).

### Б3. Декларация прав ссылается на файл, удалённый этим же коммитом

`deploy/postgres/privileges/relation-access.ts`, запись `public.specialist_tasks`, массив `codePaths`:

- `:8210` `apps/webapp/src/modules/specialist-tasks/dispatchDueReminders.ts` — **файл удалён этим коммитом**;
- `:8209` `apps/webapp/src/modules/operator-health/reconcileJobKeys.ts` — файл жив, но после правки
  в нём не осталось ни одного упоминания задач специалиста (константы семейства/ключа сняты).

Коммит правил именно этот массив (убрал строку с route), но две другие строки не выправил.
Гейты этого не ловят и поймать не могут: `access-census.mjs:98` проверяет только непустоту
`codePaths`, существование путей и их соответствие фактическим callsite не сверяется нигде.
Поэтому «зелёный `--check`» здесь ничего не доказывает — правится глазами, одна строка на удаление,
вторая на решение (оставить/снять).

## Что проверено и подтверждено (пункты брифа 2–5)

**Права (пункт 3) — чисто.**

- В коммите нет ни одной миграции (`git show --stat`: `.sql` файлов нет) и ни одной добавленной
  строки `GRANT`/`REVOKE`/`CREATE ROLE`/`CREATE POLICY`/`ALTER ROLE` (`git show | grep -nE '^\+.*(GRANT|REVOKE|...)'` — пусто).
- `node deploy/postgres/privileges/generate-cli.mjs --all --check` → все четыре артефакта
  (`privileges`/`org-allowlist` × `bcb_webapp_dev`/`bersoncarebot_test`) **совпадают побайтно**.
- `--all --port-context-only` перегенерировано заново → `git status --porcelain` пуст, дрейфа нет.
- `--census`: 217 ACTIVE отношений по 3298 исходникам, ok на обеих базах. `--gaps`: `unresolved=0 gaps=0`.
- `relation-access.ts` — рукописная декларация (источник, не артефакт): правка руками здесь
  законна, генерации она не подлежит. Замечание к её содержимому — Б3.
- `node --test` по 12 не-DB тестам каталога прав: **162/162 PASS**
  (включая `relation-access.test.mjs` + `function-census.test.mjs` 57/57, которые цитировал исполнитель).
- `pnpm --dir packages/db-principal run test` — build + type-tests + **31/31 PASS**.
- `pnpm --dir apps/webapp run typecheck` — PASS.

**Write-time producer и очередь не тронуты (пункт 4) — подтверждено.**
Коммит трогает 15 файлов; среди них НЕТ `pgSpecialistTasks.ts`, `pgOutgoingDeliveryQueue.ts`,
`outgoingDeliveryQueuePort.ts`, `prepareReminderDeliveries.ts`, `buildAppDeps.ts`, ни одной миграции
очереди, ни одного файла интегратора. Единая `public.outgoing_delivery_queue` и резидентный
исполнитель не задеты. Прогон приложения А это подтверждает поведением, а не только диффом.

Отдельно в пользу решения: отказ материализации на write-time пути **громкий** —
`pgOutgoingDeliveryQueue.ts:70-73` бросает `specialist_task_reminder_materialization_refresh_failed`
внутри той же транзакции, что и запись задачи. Тихо «потерять» напоминание при живом write-time
пути нельзя: упадёт сама операция над задачей. Это снимает главный аргумент в пользу сохранения
sweep как страховки и делает снятие архитектурно верным — вопрос только в покрытии (Б1).

**Операторское здоровье (пункт 2) — пустого места не появилось.**
`collectCronJobsHealth.ts` строит карточки строго из `CRON_JOB_REGISTRY`; удалённая запись просто
исчезает с экрана, «пустой» или `no_data` карточки не остаётся. Сняты и оба ключа
(`OPERATOR_SPECIALIST_TASKS_JOB_FAMILY`, `OPERATOR_SPECIALIST_TASK_REMINDERS_TICK_JOB_KEY`) —
других потребителей у них не было (перепись по дереву). Правильно **оставлены** (снимать нельзя):
`recordOperatorCronJobTick.ts:26` (`specialist_tasks → cron_specialist_tasks`) и
`saasIsolationDiagnostics.ts:54,82` — это значение закреплено CHECK-ограничением
`saas_isolation_events_source_operation_check` в живой базе, снятие требовало бы миграции и в скоуп
Ш3 не входит. Ярлык экрана `SystemHealthSection.tsx:780` — из той же пары, тоже верно оставлен.

**Host-cron (пункт 5) — снятие действительно no-op, проверено двумя независимыми способами.**
`node /home/dev/brain/tools/cronport.mjs list` — ни одной строки задач специалиста (8 строк,
все посторонние: brain/backup/hygiene/lead). Сверх того прямой read-only взгляд мимо порта:
`crontab -l` — совпадений нет; `/etc/cron.d` содержит `bersoncarebot-test-media-preview`,
`bersoncarebot-test-operator-health-critical`, `certbot`, `e2scrub_all`, `sysstat` — и ни одной
строки `specialist-task-reminders`; `grep` по `/etc/cron.d` и `/etc/crontab` пуст. Шаблона в
`deploy/host/cron.d/` для этой задачи нет и не было. `cronport disable/remove` не требовался и не звался.

**Документы (пункт 4) не врут.** В `deploy/HOST_DEPLOY_README.md` не осталось ни абзаца §463, ни
примера cron-строки, ни строки в таблице именованных задач, ни упоминания роута в перечне
`INTERNAL_JOB_SECRET`. В `apps/webapp/src/app/api/api.md` буллет роута снят целиком. Инструкции
заводить cron на несуществующий путь не осталось нигде в `deploy/`.

## Замечания без блокировки

1. **Перепись исполнителя была уже́ реальности.** Его grep шёл по двум образцам
   (`specialist-task-reminders`, `specialist_task_reminders_tick`) и поэтому не увидел написание через
   точку. Полная перепись даёт ещё два места: `docs/_TODO/OUTBOUND_DELIVERY_ALERTING_PLAN.md:280`
   (описывает тик `specialist_task_reminders.tick` в `reconcileJobKeys.ts`/`cronJobRegistry.ts` как
   действующий — теперь это неправда, документ стоит пометить, а не переписывать) и
   `deploy/postgres/generated/prod-to-target/schema-pre.sql:11784` (внутри исторической
   `app.read_curated_system_health_pre_0196()` — это дамп прода, трогать НЕЛЬЗЯ и правильно не тронут;
   действующий `deploy/postgres/saas-system-health-diagnostics.sql` ключей джоб не хардкодит).
   Вывод отчёта «остались только `docs/_TODO/runs/` и `docs/archive/`» — неточен.
2. **`api.md` потерял единственное место, где был описан write-time producer.** Снятый буллет
   объяснял, что канонические `create`/`update` материализуют строку очереди в той же транзакции.
   Оставшийся §96 про `doctor/tasks` этого не говорит. Механизм стал недокументированным —
   одна фраза в §96 закрывает.
3. **PROD-хвост назван, но не измерен, и это осознанное решение владельца.** Сверка (1) 21.08
   закрывала `bcb_webapp_dev` и `bersoncarebot_test` (`future without queue=0`); прода она не
   касалась. После снятия sweep задачи с будущим `remind_at`, проставленным на проде до появления
   write-time producer, материализовать будет некому — человек не получит напоминание, и никто об
   этом не узнает. По плану (`D30_SCHEDULER_REVERSAL_PLAN.md` §«PROD не блокирует и не открывает Ш3»)
   это вне гейта, поэтому не блокер; но при будущей выкатке на прод это отдельный шаг, а не «уже сделано».

## Приложение А — прогон аудитора (черновик сторожа под Б1)

Временный файл `apps/webapp/src/infra/repos/__audit_writeTimeProducer.audit.test.ts`, в дереве не
оставлен. Мокает `@/infra/repos/pgOutgoingDeliveryQueue` (шпион на
`replaceSpecialistTaskReminderGeneration`), `@/infra/db/drizzleMutationTx` (прогоняет коллбэк на
поддельной транзакции с живыми `insert/update/delete/query`), `@bersoncare/db-principal`
(`getCurrentDbPrincipalOrganizationId`) и `@/app-layer/db/drizzle`; затем зовёт
`createPgSpecialistTasksPort(...)` и проверяет по одному вызову корня на каждый из четырёх путей —
`taskId`, `reason` и длину `deliveries`, а для `delete` — что корень зван до удаления строки.
На `3f4378d62` — 4/4 PASS; при снятом вызове в `create` — 1 failed / 3 passed. Полный текст
восстанавливается из этого описания за один проход; исполнителю Б1 закрывать именно так, а не
расширением door-теста.

## Команды (воспроизведение)

```
git show --stat 3f4378d62
node deploy/postgres/privileges/generate-cli.mjs --all --check
node deploy/postgres/privileges/generate-cli.mjs --all --port-context-only && git status --porcelain
node deploy/postgres/privileges/generate-cli.mjs --census ; node deploy/postgres/privileges/generate-cli.mjs --gaps
node --test $(ls deploy/postgres/privileges/*.test.mjs | grep -v devDbProof)
pnpm install --frozen-lockfile --prefer-offline
for p in db-principal operator-db-schema error-tracking platform-merge; do pnpm --dir packages/$p run build; done
pnpm --dir packages/db-principal run test
pnpm --dir apps/webapp run typecheck
cd apps/webapp && pnpm exec vitest --run --reporter=dot          # 430 файлов / 1990 тестов
node /home/dev/brain/tools/cronport.mjs list ; crontab -l | grep -i specialist ; ls /etc/cron.d
```

## Что нужно для PASS

1. Тест уровня call-site на `create`/`update`/`complete`/`delete` → корень очереди (приложение А),
   краснеющий при снятом вызове.
2. Снять тело sweep: `enqueueDueReminders` + `listDueReminders` из `pgSpecialistTasks.ts`,
   `ports.ts`, `service.ts`, `inMemorySpecialistTasks.ts` (и мок в
   `service.mechanicWriteClearance.test.ts`) — либо явное решение владельца оставить их и почему.
3. Выправить `codePaths` у `public.specialist_tasks` в `relation-access.ts`.

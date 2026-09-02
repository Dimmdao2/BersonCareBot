# Глубокий аудит кода — неподключённое и избыточное

Заказ владельца, 19.08, дословно: «надо будет сделать глубокий аудит кода. Во-первых, нужно будет найти
неподключенные участки кода. Во-вторых, нужно будет пройти и посмотреть, где у нас идет избыточное написание
каких-либо функций, которые можно было бы свести в одну».

Старт разрешён владельцем 02.09.2026. N1/N2 выполнены одним repository-wide проходом; N3 не запускался и
остаётся отдельным owner-вопросом.

Исполнитель выбран по `/home/dev/brain/docs/MODEL_TIERS.md`: Codex Sol/high для большого графа связей и
разделения настоящих дублей от обязательных process/role adapters.

## Почему это отдельная работа, а не «сходить посмотреть»

19.08 живой агент прошёл три модуля (запись, абонементы, настройки) и нашёл **26 разрывов** «код есть, экрана
нет» — `rg '^\| [0-9]+ \|' docs/_TODO/SILENT_CODE_CENSUS_2026-08-19.md | wc -l` → `26`;
источник — `docs/_TODO/SILENT_CODE_CENSUS_2026-08-19.md`. Ни один из них не поймало CI, потому что автоматической
проверки этого класса в репозитории нет. Единственный близкий гейт —
`apps/webapp/scripts/check-s4-entitlement-coverage.ts`: он сопоставляет каждую тарифную механику с защищённым
действием и падает на незарегистрированной поверхности, а намеренно безэкранное обязано быть объявлено в
`DECLARED_NO_SURFACE` с письменной причиной. На текущей ветке это **6** записей —
`sed -n '/export const DECLARED_NO_SURFACE = {/,/^} as const satisfies/p' apps/webapp/src/app-layer/entitlements/protectedActionRegistry.ts | rg '^  [a-z][a-z_]+:' | wc -l`;
сам registry содержит **29** механик —
`sed -n '/export const MECHANIC_REGISTRY = {/,/^} as const satisfies/p' apps/webapp/src/modules/org-entitlements/types.ts | rg '^  [a-z][a-z_]+:' | wc -l`.
Форма правильная, но покрывает только тарифные механики — ни маршруты, ни сервисы, ни колонки.

## Направления

- [x] **Н1. Неподключённый код.** Маршруты без вызывающего, экспорты сервисов без маршрута и экрана, колонки,
      которые API принимает, а интерфейс не задаёт. Три модуля уже пройдены руками — начинать с остальных, а
      переписью 19.08 пользоваться как образцом формы доказательства («что есть» + «искал, не нашёл» +
      «последствие для человека»). **Census закрыт 02.09.2026:** покрытие и результаты — ниже; продуктовый код
      не менялся.
- [x] **Н2. Избыточность.** Места, где одно и то же написано несколькими функциями, которые сводятся в одну.
      Владелец про это спрашивал отдельно; ср. решение «ОДИН chokepoint, минимум кода». **Census закрыт
      02.09.2026:** текущий дедуплицированный реестр и план границ исправления — ниже; исправления не начинались.
- [ ] **Н3. Открытый пункт.** Владелец: «Может быть, что-то еще поищем?» — третий вопрос аудита формулируется
      перед запуском, вместе с ним.

## Реестр находок Н2 — «две копии одного действия», пополняется по ходу работы

Владелец, 20.08: «Свести их в одну дверь надо, но можно пока просто вписать в план по этой работе (и все что
будем находить такого - туда писать чтобы потом не забыть)». Порядок: нашёл такое по ходу другой задачи —
**записал сюда строкой и пошёл дальше**, чинить в чужой задаче не начинаем.

| # | что раздвоено | где | почему всплыло | состояние |
|---|---|---|---|---|
| Р1 | запись часового пояса человека | `syncCalendarTimezoneFromDevice` (пациент, через definer-функцию `app.set_current_patient_calendar_timezone`) и `syncPlatformUserCalendarTimezoneFromDevice` (сотрудник, обычный `UPDATE`) | 20.08: условие «пиши только если отличается» стояло лишь в одной из двух веток — аудит поймал лишнюю запись у пациента (`3474b3a84`) | обе двери чинены по отдельности; свести в одну — не начато |
| Р2 | «получить превью» медиа | `mediaThumbState.ts` у пациента и побайтно такой же двойник у доктора; ни один не знает ни про статус пересборки видео, ни про внешний хост | 19.08: догадка владельца про единую дверь подтверждена замером — экран говорит «видео готовится» про файл, о котором функция не умеет спросить. 20.08: добавился третий источник — ролик по ссылке на YouTube/VK | **в работе:** задача #1092, план — `OWNER_PATIENT_WALKTHROUGH_BUGS_2026-08-19.md` §«Превью для видео по ссылке» |
| Р3 | ответ на комментарий к упражнению | рабочий путь из кабинета (`sendProgramNoteReply`) и недостижимая ветка входа из бота | 20.08: у bot-ветки не было отправителя | **закрыто 02.09:** bot callback/state/M2M удалены; врач отвечает только в кабинете |

⚠️ Р1 и Р2 — один класс: действие раздвоено по «кто это делает» (пациент/доктор), хотя правило одно. Именно
так и появляется расхождение — правку вносят в одну копию.

## N1/N2 — единый evidence census, 02.09.2026

### Метод и фактически просмотренные поверхности

Это один read-only проход по текущей ветке `wt/deep-code-audit-20260902`. Сначала выполнялся `code-search`, затем
точный `rg` по уже найденным именам. Для каждого кандидата проверялись не только имя/один импорт, а входы Next,
Fastify registration, RSC/client caller, DI `buildAppDeps`, порт и repo, SECURITY DEFINER вызов, внешний M2M/
webhook контракт, scheduler/worker/cron manifest и активные owner-регистры. Booking, memberships и settings не
переписывались заново: прежняя перепись использована как baseline, а затронутые поздними изменениями пути
перетрассированы (карточка пациента, платежи, analytics, media, delivery).

Пути в реестре без начального root указаны относительно `apps/webapp/src`; пути других приложений и packages
даны от корня репозитория.

Измеренный объём production-исходников:

| Поверхность | Результат и точная команда |
|---|---|
| Production TypeScript/TSX (`apps` + `packages`, без test/spec/migrations) | **3349** — `rg --files apps packages -g '*.ts' -g '*.tsx' -g '!**/*.test.*' -g '!**/*.spec.*' -g '!**/migrations/**' \| wc -l` |
| Next route handlers | **459** — `rg --files apps/webapp/src/app -g 'route.ts' \| wc -l` |
| Next page entries | **149** — `rg --files apps/webapp/src/app -g 'page.tsx' \| wc -l` |
| Webapp domain modules | **104** — `find apps/webapp/src/modules -mindepth 1 -maxdepth 1 -type d \| wc -l` |
| Integrator production TS | **246** — `rg --files apps/integrator/src -g '*.ts' -g '!**/*.test.ts' -g '!**/*.spec.ts' \| wc -l` |
| Media-worker production TS | **22** — `rg --files apps/media-worker/src -g '*.ts' -g '!**/*.test.ts' -g '!**/*.spec.ts' \| wc -l` |
| Webapp schema files | **52** — `rg --files apps/webapp/db/schema -g '*.ts' \| wc -l` |
| Drizzle table declarations | **203** — `rg -n 'pgTable\(' apps/webapp/db/schema -g '*.ts' \| wc -l` |
| Shipped cron templates, PROD + TEST | **22** — `rg --files deploy/host/cron.d -g '*.cron.template' \| wc -l` |
| Internal webapp job/control routes | **15** — `rg --files apps/webapp/src/app/api/internal -g 'route.ts' \| wc -l` |

Маршруты проверены отдельным literal-caller scan: для каждого `route.ts` брался самый длинный непрерывный
статический фрагмент URL и искался во всех production `.ts/.tsx`, после чего каждый нулевой результат проверялся
по символам сервиса, RSC-вызовам и внешним consumers. Дополнительно точный поиск выполнялся по всему дереву, а не
только TypeScript: так, например, `/api/patient/analytics/push-open` правильно исключён из находок по реальному
consumer `apps/webapp/public/sw.js:95`.

Отдельный static-import reachability scan шёл от всех Next entry files, `apps/integrator/src/main.ts`, resident
`scheduler/main.ts`, `apps/media-worker/src/main.ts` и package entrypoints. Он учитывал `@/`, относительные
imports, dynamic `import()` и integrator `.js` specifiers. Нулевой inbound не считался доказательством: список
перепроверен по framework conventions, package scripts, deploy manifests, tests-as-pointers и owner docs. Именно
этот проход нашёл недостижимые UI `DiaryDataPurgeSection`, `PatientTabFinances`/`PatientTabComms`, прежний
`DoctorAnalyticsShell`, CMS-компоненты и сохранённые diary forms; только первый дал реальное незамещённое
последствие, остальные классифицированы ниже.

По схеме для каждой из **203** деклараций (команда подсчёта в таблице выше) искались и TS-identifier, и физическое
имя relation во всех production sources. Нулевые результаты затем проверялись в migrations, SECURITY DEFINER
функциях, privilege registries, deploy scripts и owner/back-reference документах. Поэтому passkey/password
protection, `saas_isolation_*` и migration ledger не объявлены мёртвыми только из-за отсутствия прямого Drizzle
import; действительно неразрешённые legacy/data-retention кандидаты вынесены в `N1-Q3`.

### Дедуплицированный реестр

`REAL GAP` ниже означает достижимое последствие, а не пожелание рефакторинга. `OWNER QUESTION` не является
автоматически разрешённой работой.

| ID | Направление / классификация | Код | Доказательство | Достижимое последствие | Системная граница исправления |
|---|---|---|---|---|---|
| `N1-001` | N1 · **REAL GAP** | `app/app/patient/profile/DiaryDataPurgeSection.tsx`; `app/api/patient/diary/purge*/route.ts`; `app/app/patient/profile/page.tsx` | Компонент содержит полный OTP flow и вызывает оба route; `rg -n 'DiaryDataPurgeSection' apps/webapp/src -g '*.ts' -g '*.tsx' -g '!**/*.test.*'` находит только его декларацию. Текущий profile page не импортирует его. `PR-03` отдельно сохраняет resource-specific cleanup и запрещает лишь account/org hard purge. | Пациент не может из продукта удалить собственные symptom/LFK diary data: рабочие destructive endpoints достижимы только ручным HTTP. | Одна privacy/data-control секция профиля должна монтировать существующий resource-specific flow; не смешивать его с отключённым account purge и не делать второй purge service. |
| `N1-002` | N1 · **REAL GAP** | `app/api/doctor/patients/[userId]/email-change/route.ts`; `app/api/patient/email-change/confirm/route.ts`; `tabs/PatientTabAccount.tsx`; `shared/ui/patient/EmailAccountPanel.tsx` | Doctor account UI реально вызывает admin start и создаёт challenge purpose `patient_email_change`. Точный `rg -n -F '/api/patient/email-change/confirm' . -g '!docs/archive/**' -g '!**/*.test.*' -g '!**/*.spec.*'` не находит UI-caller. Patient profile использует другой pair `/api/auth/email/start` → `/api/auth/email/confirm`, требует `challengeId` и purpose `email_verify`; он не завершает admin-started challenge. | Администратор отправляет пациенту код смены email, но получателю негде его ввести; pending address не становится canonical email. | Параметризовать существующий authenticated email panel/confirmation door по purpose и challenge shape; не заводить третий OTP consumer. |
| `N2-001` | N2 · **REAL GAP** | `webapp/src/shared/phone/normalizeRuPhoneE164.ts`; `integrator/src/infra/phone/normalizeRuPhoneE164.ts`; `packages/platform-merge/src/supplementaryContactNormalize.ts` | Три handwritten реализации выполняют один алгоритм (`00`, local 10 digits, `8→7`, `+7`); integrator-комментарий требует вручную “Keep in sync”. `rg -n 'normalizeRuPhoneE164|phone.*sync|sync.*phone' package.json apps/*/package.json scripts apps/*/scripts` не находит sync gate. Все три имеют production callers: auth/booking/identity merge, booking lifecycle и Google Calendar. | После правки одной копии один человек может нормализоваться в разные identity/contact keys в webapp, integrator и merge, что ломает lookup, bind либо calendar description для той же записи. | Один dependency-neutral shared package export; все process adapters только вызывают его. |
| `N2-002` | N2 · **REAL GAP** | `webapp/src/shared/lib/hlsStorageLayout.ts`, `hlsMasterPlaylist.ts`; `media-worker/src/hlsStorageLayout.ts`, `hlsMasterPlaylist.ts` | Обе пары — handwritten copies одного key/layout и playlist rule. Комментарии обещают `pnpm run check:hls-helpers-sync`, но `rg -n 'check:hls-helpers-sync|hls-helpers-sync' package.json apps/*/package.json scripts apps -g '*.json' -g '*.mjs' -g '*.ts'` находит только эти комментарии, executable gate отсутствует. | Worker может записать master/poster/variant key или playlist, который webapp proxy/playback/cleanup сочтёт недоверенным либо не найдёт; видео готово физически, но не проигрывается/не удаляется корректно. | Один shared media-contract package (или generated copy из одного source с настоящим gate); S3/FFmpeg process adapters остаются раздельными. |
| `N2-003` | N2 · **REAL GAP** | `webapp/src/modules/system-settings/platformIntegrationAvailability.ts`; `integrator/src/infra/db/platformIntegrationAvailability.ts` | Дважды объявлены те же integration IDs и дважды написаны version/envelope/per-id boolean validation. Webapp принимает/показывает persisted registry, integrator независимо парсит его перед delivery. Точный `rg -n 'PLATFORM_INTEGRATION_IDS|normalizePlatformIntegrationAvailability|parsePlatformIntegrationAvailability' apps/webapp/src apps/integrator/src` подтверждает две реализации; общего contract import нет. | После добавления/переименования канала admin UI может принять и показать настройку, которую delivery runtime отвергнет либо не применит; оператор видит «включено», доставка fail-closed. | Общие IDs, schema/parser и typed envelope — один shared contract; DB read и UI catalog остаются process/role adapters. |
| `N2-R1` | N2 · **CLOSED** (сохранённый `Р1`) | `app-layer/platform-user/syncCalendarTimezoneFromDevice.ts`; patient/staff DB adapters | Одна параметризованная дверь теперь валидирует пояс, сравнивает с текущим и вызывает ролевой адаптер записи; обе прежние функции только делегируют ей. Доказательство этапа: `calendarTimezoneNoWriteOnMatch.unit.test.ts` — 3/3; webapp typecheck после сборки shared packages — exit 0. | Правило устройства больше нельзя исправить только для пациента или только для сотрудника; различается только допустимая DB-дверь роли. | Закрыто единым identity-timezone service с role/principal adapters; не возвращать две реализации правила. |
| `N2-R2` | N2 · **REAL GAP**, уже в workstream `#1092` (сохранённый `Р2`) | patient/doctor `mediaThumbState.ts` + external-host preview source | Побайтный двойник и третий provider source зафиксированы в `Р2`; текущая отдельная работа уже имеет owner authority. | Разные кабинеты показывают разные ready/rebuild/external-preview состояния одного media. | Один preview-state resolver; UI adapters только рендерят общий model. Здесь не чинить и не дублировать `#1092`. |
| `N2-R3` | N2 · **STALE TEXT ONLY** (сохранённый `Р3`) | строка `Р3` выше | Исполняемая bot callback/state/M2M ветка удалена 02.09; рабочим остался один cabinet reply path. | Текущего продуктового разрыва нет. | Не восстанавливать bot-вариант; строка остаётся историей найденного и закрытого дубля. |
| `N1-Q1` | N1 · **OWNER QUESTION** | Не имеющие internal consumer HTTP adapters: `/api/account/security/status`, `/api/auth/email-password/lookup`, `/api/auth/messenger/start`, `/api/doctor/workspace/directory`, `/api/doctor/material-ratings/summary`, `/api/patient/mood/{today,week}`, `/api/patient/practice/progress`, `/api/patient/reminders/mark-seen`, `/api/patient/notifications/inbox/read` | Для каждого выполнены exact endpoint search, service-symbol search и проверка RSC/UI. Текущие экраны либо вызывают тот же service прямо (security, directory, ratings, mood, progress, notifications), либо используют новый flow (auth phone/email). Docs всё ещё называют часть endpoints публичным UI contract. | Сейчас человек получает функцию через другой путь; удалить route можно только зная, обещан ли он native/external клиенту. | Владелец решает: это поддерживаемый HTTP contract или retired compatibility. До решения не называть product defect и не удалять. |
| `N1-Q2` | N1 · **OWNER QUESTION** | `patient/diary/QuickAddPopup.tsx`, symptom/LFK clients, `api/patient/diary/quick-add-context/route.ts` | Компоненты и route не смонтированы, но `diary/diary.md` прямо говорит: symptom tracking на MVP не показывать, manual LFK скрыта и ждёт отдельного product decision; `page.tsx` содержит restore TODO. | Ручной quick-add отсутствует намеренно до решения; автоматика плана/разминок продолжает работать. | Решить судьбу manual input, затем либо подключить существующий один flow, либо удалить сохранённую ветку; сейчас не чинить. |
| `N1-Q3` | N1 · **OWNER QUESTION** | Декларации `online_intake_answers`, `online_intake_status_history`, `message_drafts`, `user_questions`, `telegram_users`, `reference_catalog_baselines`, `reference_catalog_snapshot_receipts` | Identifier+physical-name scan не нашёл production caller; `code-search` и exact search проверили migrations, deploy cutover, RLS/privilege registries, DB dumps и archived plans. Это не generated/runtime-ledger/passkey false positive, но таблицы могут содержать retained/cutover data. | UI/runtime сегодня от них не зависят; удаление без решения может уничтожить retained legacy/cutover evidence, сохранение оставляет dormant schema. | Owner/data-retention decision перед schema cleanup; это не authority на DROP и не продуктовая задача census. |

### Явные non-findings и ложные дубли

- Queue/intention/attempt/history не объединяются с business entity: `outgoing_delivery_queue`, delivery attempts,
  webhook/provider events, booking/package history и audit rows имеют разные lifecycle/retention обязанности.
- Messenger external IDs (`telegram/max/vk`) не являются вторым `platform_user` identity root; integrator resolution
  adapters переводят provider identity в canonical user/org context.
- Route/RSC/process adapters не являются дублем, если правило живёт в одном service/port: сюда относятся security
  status, doctor directory, material-rating summary, mood/progress reads и notification mark-read. Неиспользуемый
  HTTP adapter в `N1-Q1` требует решения о compatibility, но не доказывает сломанную функцию.
- `PATCH /api/admin/users/[userId]/archive` — явный compatibility alias и делегирует тому же
  `applyClientArchiveChange`; отдельной archive business logic нет.
- Patient-card `PatientTabFinances`/`PatientTabComms` — сохранённые старые top-level components, но cash payments
  перенесены в `PatientTabRecords`, chat/messages — в current card overview/header и communications screen; legacy
  `?tab=finances|comms` намеренно редиректится в `karta`. Это не потеря функций.
- Старый clinical `DoctorAnalyticsShell` не является потерянным entry: specialist nav ведёт на
  `/app/doctor/material-ratings`, а route-group `(global-admin)/doctor/analytics/page.tsx` владеет
  `/app/doctor/analytics` для platform operations. Старые analytics components — не current page wiring.
- `normalizeToUtcInstant` не раздвоен: webapp файл только re-export канонической integrator implementation;
  `next.config.ts` разрешает этот single-source import.
- Webapp/integrator `reportEmptyNotificationAudience`, mail-profile producer/consumer, error tracking,
  saas-isolation telemetry и DB principals — process/role adapters с разными durable sinks и permissions, не одна
  скопированная business action.
- M2M/webhook/control routes (`/api/integrator/**`, payment webhooks, `/api/internal/**`, `/health`) не обязаны
  иметь UI caller. Их wiring проверен через integrator `registerRoutes`, resident scheduler/worker, public SW,
  background-job manifest/cron artifacts и provider protocols.
- Generated migrations, schema barrels, privilege declarations, DB snapshots and archived documents не считались
  executable product duplicates. Несовпадающий комментарий сам по себе — `STALE TEXT ONLY`, не product finding.

### Упорядоченный correction plan

1. **Закрыть два человеческих разрыва одной существующей дверью:** `N1-001` вернуть в единую profile privacy
   surface как resource cleanup; `N1-002` расширить существующий authenticated email panel/confirm door purpose-
   параметром. Не писать параллельные purge/OTP services.
2. **Вынести cross-process pure contracts:** сначала phone normalization (`N2-001`, identity risk), затем HLS
   layout/playlist (`N2-002`, media availability), затем integration availability schema/parser (`N2-003`, delivery
   control-plane). В каждом случае один source + compile/import boundary либо настоящий sync gate.
3. **Не смешивать уже заведённые workstreams:** `N2-R2` завершает `#1092`; `N2-R1` закрыт отдельной bounded
   consolidation одной общей дверью; `N2-R3` не переоткрывать.
4. **Получить owner decisions перед удалением:** compatibility contracts `N1-Q1`, manual diary input `N1-Q2` и
   retained dormant relations `N1-Q3`. До решения это вопросы, не backlog, не DROP и не product fix.

### Статус полноты

N1 и N2 отмечены complete именно как **repository-wide census**, а не как исправление найденного. Просмотрены все
заявленные домены: identity/auth/invites; patients/visits/programs/exercises/CMS/media/files; messages/comments/
support; reminders/notifications/delivery; integrations/bots/calendar/mail; tariffs/billing; admin/health/
retention/background jobs; shared cross-app contracts. Непройденной поверхности в заявленном scope нет. N3 не
формулировался и остаётся owner-owned открытым пунктом. Product code, tests, generated artifacts и taskdb этим
проходом не менялись.

## Что из этого стоит стать гейтом, а не разовым проходом

Разовый проход находит сегодняшнее и не мешает завтрашнему. Кандидат — распространить форму
`check-s4-entitlement-coverage` с механик на маршруты и сервисы: обнаружение автоматом, исключения
объявляются списком с причиной. Решение по этому — после того, как аудит покажет объём.

## Связанное

- `docs/_TODO/SILENT_CODE_CENSUS_2026-08-19.md` — исходная перепись разрывов, вход для Н1; её измерение приведено
  в разделе «Почему это отдельная работа».
- `docs/_TODO/TEST_SUITE_AUDIT_2026-07-29.md` — канонические решения по тестам. Владелец 19.08 отдельно решил
  не тратить время на правку этого документа сейчас; здесь только ссылка, чтобы не потерялась.

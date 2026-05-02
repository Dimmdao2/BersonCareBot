# Журнал исполнения APP_RESTRUCTURE (быстрые устойчивые правки)

Дата начала: 2026-05-01.

Формат записи: дата, пункт плана (1–6), изменения, проверки, решения, что не делали вне scope.

---

## Этап 1 APP_RESTRUCTURE — удаление «Новостей» + каналы в рассылках (audit)

**Сделано:**

- Drizzle-схема: удалены таблицы `news_items` / `news_item_views`; у `broadcast_audit` колонка `channels` (`text[]`, default `bot_message` + `sms`). Миграция: [`0016_drop_news_broadcast_channels.sql`](../../apps/webapp/db/drizzle-migrations/0016_drop_news_broadcast_channels.sql).
- CMS: редирект [`/app/doctor/content/news`](../../apps/webapp/src/app/app/doctor/content/news/page.tsx) → мотивация; [`ContentPagesSidebar`](../../apps/webapp/src/app/app/doctor/content/ContentPagesSidebar.tsx) без пункта «Новости»; экран мотивации читает список цитат через порт [`DoctorMotivationQuotesEditorPort`](../../apps/webapp/src/modules/doctor-motivation-quotes/ports.ts) и [`buildAppDeps().doctorMotivationQuotesEditor`](../../apps/webapp/src/app-layer/di/buildAppDeps.ts) (без `pool.query` в RSC для **списка**). Мутации (insert/update/reorder) по-прежнему в [`motivation/actions.ts`](../../apps/webapp/src/app/app/doctor/content/motivation/actions.ts) — отдельный backlog на вынос в сервис/порт.
- Рассылки: UI выбора каналов, поле `channels` в preview/execute/audit; [`doctor-broadcasts/service.ts`](../../apps/webapp/src/modules/doctor-broadcasts/service.ts) на `execute` **только** пишет аудит и оценку аудитории — **массовая доставка по каналам не вызывается из этого модуля**; на странице [`/app/doctor/broadcasts`](../../apps/webapp/src/app/app/doctor/broadcasts/page.tsx) добавлена поясняющая подпись для врача.
- Merge/purge/скрипты: убраны ссылки на `news_item_views` где применимо (см. историю коммитов этапа).

**Архив данных перед `DROP news_*`:** в репозитории **нет** автоматического экспорта `.md`/`.csv`; для production перед первым применением миграции на БД с ценным содержимым `news_items` — снять дамп/выгрузку вручную (ops), иначе риск необратимой потери строк.

**Проверки (точечные, без полного CI):** `eslint` / `vitest` на затронутых путях после правок.

**Вне scope:** `STRUCTURE_AUDIT.md` не меняли (immutable baseline).

---

## 2026-05-01 — старт

- Создан `LOG.md`, будет дополняться по мере закрытия пунктов 1–6.
- `STRUCTURE_AUDIT.md` не меняем (immutable baseline).

---

## Пункт 1 — мёртвый груз главной + legacy `HomeBlockId`

**Сделано:**

- Удалены орфаны: `PatientHomeNewsSection.tsx`, `PatientHomeMailingsSection.tsx` и их тесты.
- Из [`navigation.ts`](../../apps/webapp/src/app-layer/routes/navigation.ts) удалены `HomeBlockId`, `patientHomeBlocks*`, `patientHomeBlocksForEntry`; импорт `PlatformEntry` убран.
- Обновлены [`navigation.test.ts`](../../apps/webapp/src/app-layer/routes/navigation.test.ts), [`patient-home.md`](../../apps/webapp/src/modules/patient-home/patient-home.md), [`platform.md`](../../apps/webapp/src/shared/lib/platform.md).
- В [`apps/webapp/package.json`](../../apps/webapp/package.json) скрипт `test:with-db` больше не ссылается на удалённые тесты.

**Проверки:** `rg PatientHomeNewsSection|PatientHomeMailingsSection` и `rg HomeBlockId|patientHomeBlocks...` по `apps/webapp/src` — пусто; `pnpm run ci` — зелёный (2026-05-01).

**Вне scope:** не трогали `STRUCTURE_AUDIT.md` (там ещё упоминается старый `HomeBlockId` как baseline «как было»).

---

## Пункт 2 — меню: «Онлайн-заявки»

- В [`doctorNavLinks.ts`](../../apps/webapp/src/shared/ui/doctorNavLinks.ts) добавлен пункт `online-intake` с `href: routePaths.doctorOnlineIntake` между «Записи» и «Сообщения».
- Источник маршрута — только `routePaths`, без дублирующего литерала.

**Чек-лист закрытия пункта 2 (отмечено):**

- [x] В `doctorNavLinks.ts` есть link `online-intake` с `href: routePaths.doctorOnlineIntake`.
- [x] Пункт расположен между «Записи» и «Сообщения», не в системном/CMS-кластере.
- [x] `DOCTOR_MENU_LINKS` продолжает собираться из `DOCTOR_MENU_ENTRIES` без ручного дублирования.
- [x] В `LOG.md` записано, что пункт добавлен без перестройки всего меню.

---

## Пункт 3 — legacy / debug IA врача

- [`subscribers/page.tsx`](../../apps/webapp/src/app/app/doctor/subscribers/page.tsx): комментарий про legacy URL и что не добавлять в меню; redirect сохранён для закладок.
- `name-match-hints`: вторых входов в меню нет (ссылка только в `DoctorClientsPanel` при admin + adminMode на странице клиентов); код не меняли.
- [`delete-errors/page.tsx`](../../apps/webapp/src/app/app/doctor/content/library/delete-errors/page.tsx): redirect на `/app/doctor/content/library`, если не `admin` или не `adminMode`.
- [`MediaLibraryClient`](../../apps/webapp/src/app/app/doctor/content/library/MediaLibraryClient.tsx): проп `canSeeDeleteErrorsLink` (default `false`), ссылка «Ошибки удаления S3» только при admin + adminMode и ненулевом счётчике; сервер передаёт флаг из [`content/library/page.tsx`](../../apps/webapp/src/app/app/doctor/content/library/page.tsx).

**Вне scope:** API `GET /api/admin/media/delete-errors` без изменений (guard только на страницу и видимую ссылку).

**Проверки:** `rg "/app/doctor/subscribers|name-match-hints|delete-errors" apps/webapp/src` показывает только ожидаемые места (redirect-route, page/API/tests, `doctorScreenTitles.ts`, `DoctorClientsPanel` и `ClientListLink`), без пунктов меню на `/subscribers`.

**Чек-лист закрытия пункта 3 (отмечено):**

- [x] `/app/doctor/subscribers` остался redirect-route, но не появился в `DOCTOR_MENU_ENTRIES`.
- [x] `name-match-hints` доступен только admin + adminMode; дублей входа в меню не найдено.
- [x] `delete-errors/page.tsx` редиректит не-admin/adminMode на `/app/doctor/content/library`.
- [x] `MediaLibraryClient` показывает ссылку «Ошибки удаления S3» только через серверный prop `canSeeDeleteErrorsLink`.
- [x] Новые env/config flags не добавлялись.
- [x] Результаты `rg` по `subscribers|name-match-hints|delete-errors` зафиксированы.

---

## Пункт 4 — `/messages` vs `/broadcasts`

- [`doctor/messages/page.tsx`](../../apps/webapp/src/app/app/doctor/messages/page.tsx) оставлен только `DoctorSupportInbox` + `AppShell`.
- Удалены: `NewMessageForm`, `DoctorMessagesLogFilters`, `DoctorMessagesLogPager`, `parseMessagesLogClientId` (+ тест).
- [`e2e/doctor-pages-inprocess.test.ts`](../../apps/webapp/e2e/doctor-pages-inprocess.test.ts): проверка `DoctorSupportInbox` + `SendMessageForm`.

**Сознательно не делали:** не переносили UI массовых сообщений в broadcasts (там уже `BroadcastForm` / audit).

**Проверки:** `rg "NewMessageForm|DoctorMessagesLogFilters|DoctorMessagesLogPager|parseMessagesLogClientId" apps/webapp` — пусто.

**Чек-лист закрытия пункта 4 (отмечено):**

- [x] `messages/page.tsx` не импортирует удалённые символы и лишние зависимости из старого журнала.
- [x] `rg` по удалённым символам пустой.
- [x] `broadcasts/page.tsx` не переписывался и остаётся владельцем массовых рассылок/audit.
- [x] `doctor-pages-inprocess.test.ts` не импортирует удалённый `NewMessageForm`.
- [x] Зафиксировано разделение: `/messages` = чат поддержки; `/broadcasts` = массовые рассылки и audit.

---

## Пункт 5 — intake в `AppShell`

- [`intake/nutrition/page.tsx`](../../apps/webapp/src/app/app/patient/intake/nutrition/page.tsx), [`intake/lfk/page.tsx`](../../apps/webapp/src/app/app/patient/intake/lfk/page.tsx): `AppShell` title «Онлайн-запрос», `backHref={routePaths.cabinet}`, `session` из `requirePatientAccessWithPhone`.
- В клиентах убран лишний `py-6` у success-state (остался `gap-4`), чтобы не дублировать отступы с shell.

**Чек-лист закрытия пункта 5 (отмечено):**

- [x] Оба `page.tsx` импортируют `AppShell`.
- [x] Оба `page.tsx` используют `const session = await requirePatientAccessWithPhone(...)`.
- [x] `backHref` в обоих случаях — `routePaths.cabinet`.
- [x] Клиентские формы не переписывались по UX, только адаптированы отступы под shell.
- [x] В `LOG.md` зафиксирован выбранный вариант заголовка (`Онлайн-запрос`) и backHref.

---

## Пункт 6 — `CabinetInfoLinks`

- Три плитки: «Адрес кабинета» (`patientAddress`), «Записаться» (`bookingNew`), «Справка и контакты» (`patientHelp`). Убраны вводящие в заблуждение «Как подготовиться» / «Стоимость» без расширения контента `/help`.

**Проверки:** `rg "Как подготовиться|Стоимость" apps/webapp/src/app/app/patient/cabinet` — пусто.

**Чек-лист закрытия пункта 6 (отмечено):**

- [x] В `CabinetInfoLinks.tsx` нет строк `Как подготовиться` и `Стоимость`.
- [x] Вторая плитка ведёт на `routePaths.bookingNew`, третья — на `routePaths.patientHelp`.
- [x] Не добавлялись CMS-страницы, anchors или mock-контент.
- [x] В `LOG.md` зафиксирован выбранный «честный минимум», без расширения help/CMS в рамках этого scope.

---

## 2026-05-01 — `notifications_topics` в `system_settings`

**Сделано:**

- Ключ `notifications_topics` (scope admin): [`ALLOWED_KEYS`](../../apps/webapp/src/modules/system-settings/types.ts), модуль [`notificationsTopics.ts`](../../apps/webapp/src/modules/patient-notifications/notificationsTopics.ts) (дефолт, парсер, валидация PATCH), [`PATCH /api/admin/settings`](../../apps/webapp/src/app/api/admin/settings/route.ts) с проверкой кодов через `subscriptionMailingProjection.listTopics()` (при пустой проекции — только структурная валидация).
- Админ: [`NotificationsTopicsSection`](../../apps/webapp/src/app/app/settings/NotificationsTopicsSection.tsx) во вкладке «Параметры приложения» на [`/app/settings`](../../apps/webapp/src/app/app/settings/page.tsx).
- Пациент: [`/app/patient/notifications`](../../apps/webapp/src/app/app/patient/notifications/page.tsx) читает настройку + `parseNotificationsTopics` (fallback = прежний хардкод).
- Миграции: [`083_notifications_topics.sql`](../../apps/webapp/migrations/083_notifications_topics.sql), зеркало integrator [`20260502_0001_notifications_topics_setting.sql`](../../apps/integrator/src/infra/db/migrations/core/20260502_0001_notifications_topics_setting.sql).

**Проверки:** `pnpm install --frozen-lockfile && pnpm run ci` — успех (2026-05-01).

**Вне scope:** связывание с `/reminders`, изменения `ChannelNotificationToggles`. ~~Этап «новости + каналы рассылок»~~ — закрыт отдельным блоком **«Этап 1 APP_RESTRUCTURE»** выше в этом файле (не путать с этой записью про `notifications_topics`).

**Follow-up после аудита (закрыто 2026-05-01):**

- [`notificationsTopics.ts`](../../apps/webapp/src/modules/patient-notifications/notificationsTopics.ts): экспорт `isValidNotificationTopicId` / `isValidNotificationTopicTitle`; тест совпадения `notificationsTopicsDefaultValueJsonString()` с литералом [`083_notifications_topics.sql`](../../apps/webapp/migrations/083_notifications_topics.sql).
- [`NotificationsTopicsSection.tsx`](../../apps/webapp/src/app/app/settings/NotificationsTopicsSection.tsx): валидация строк перед `patchAdminSetting`, стабильные ключи списка (`topic-row-${index}`).
- [`RECOMMENDATIONS_AND_ROADMAP.md`](RECOMMENDATIONS_AND_ROADMAP.md): обновлены I.1, таблица долга (часть III), этап 4, таблица «Выполнено» в начале документа; устранён дубликат пункта в списке этапа 4.

---

## Итог CI

- `pnpm install --frozen-lockfile && pnpm run ci` — успех (2026-05-01).
- Повторный полный прогон перед фиксацией доков и push: **`pnpm run ci` — успех** (2026-05-01, тот же коммитовый набор этапа 1 + `notifications_topics` + IA-пакет).

---

## Синхронизация с дорожной картой

- [`RECOMMENDATIONS_AND_ROADMAP.md`](RECOMMENDATIONS_AND_ROADMAP.md): добавлен блок «Выполнено» и поправлены формулировки в частях I–II, таблице долга и этапах 0 / 5 / 6 под закрытый пакет (2026-05-01).
- Темы `/notifications` и ключ `notifications_topics`: раздел I.1, таблица долга в части III и этап 4 в [`RECOMMENDATIONS_AND_ROADMAP.md`](RECOMMENDATIONS_AND_ROADMAP.md) обновлены под факт реализации (2026-05-01).
- Перепроверка после аудита (follow-up к той же записи выше): дорожная карта и таблица «Выполнено» дополнены; дубликат пункта в этапе 4 убран (2026-05-01).
- **Этап 1 (новости + `broadcast_audit.channels` + порт списка мотивации):** таблица «Выполнено», часть II (долг по RSC), описание этапа 1 и этапа 3 в roadmap; [`PLATFORM_USER_MERGE.md`](../ARCHITECTURE/PLATFORM_USER_MERGE.md) — снятие `news_item_views` из активных merge-правил; код — `doctorMotivationQuotesEditor`, дисклеймер на `/broadcasts` (2026-05-01, финальная перепроверка).
- Чек-лист закрытия этапа 1 и хвосты перенесены в [`STAGE1_PLAN_CLOSEOUT.md`](STAGE1_PLAN_CLOSEOUT.md) и [`BACKLOG_TAILS.md`](../BACKLOG_TAILS.md).

---

## 2026-05-02 — `PLAN_DOCTOR_CABINET.md` приведён в соответствие с новыми решениями

- Порядок этапов перестроен на **CMS-first**. Этап 1 = CMS-разделение по [`CMS_RESTRUCTURE_PLAN.md`](CMS_RESTRUCTURE_PLAN.md).
- Этап 2 «Меню» расширен: аккордеон с состоянием в `localStorage`, перенос «Библиотеки файлов» из CMS в основное меню.
- Этап 5 «Сообщения» переписан под новую идею: страница чатов с фильтром «непрочитанные», универсальный layout чата как модалка, переиспользование в карточке пациента, автопрочтение по видимости.
- Этап 6 «Карточка пациента» свёрнут до минимальной пересборки. Подробный tabs/hero-план положен в `<details>` как архив. В текущем проходе глубокая переработка не выполняется.
- Этап 7 «Каталоги»: добавлены курсы.
- Этап 8 — новый: «Плотность интерфейса» (карточки/тексты/отступы кабинета врача слишком крупные).
- Этап 9 — старое содержание (`content_sections.kind` + редизайн CMS hub) **переехало** в `CMS_RESTRUCTURE_PLAN.md`. В этом плане этап оставлен пустым с указанием хвоста по мотивациям (raw SQL → порт).
- Definition of Done переписан под новый набор этапов.
- Код не правился, только документация.

---

## 2026-05-02 — заведена инициатива CMS-разделения (Вариант C)

- Добавлен документ-инициатива [`CMS_RESTRUCTURE_PLAN.md`](CMS_RESTRUCTURE_PLAN.md): визуальная иерархия CMS через поля `kind` и `system_parent_code` у `content_sections`, без настоящей parent-иерархии в БД (Вариант A отложен).
- Контекст и факты — [`CMS_AUDIT.md`](CMS_AUDIT.md).
- Старт шагов — после согласования открытых вопросов §«Открытые вопросы (к шагу 1)» в плане.
- Код на этом этапе не правится.

---

## CMS Composer — шаг 0 (preflight): таксономия в документах, без кода

**Сделано:**

- В [`CMS_RESTRUCTURE_PLAN.md`](CMS_RESTRUCTURE_PLAN.md) устранено противоречие: канонические значения `system_parent_code` — `situations` \| `sos` \| `warmups` \| `lessons` \| `null` (включён `lessons` для `lessons` / `course_lessons`).
- Зафиксировано: «Мотивации» — отдельный маршрут и `motivational_quotes`, **не** значение `system_parent_code` у `content_sections` в этом проходе.
- Добавлена таблица canonical backfill (slug → `kind` / `system_parent_code`) в шаге 1 плана.
- Сайдбар DoD и формулировки «что входит» приведены в соответствие (системные папки: Ситуации, SOS, Разминки, Уроки; мотивации — отдельная ссылка).
- Защита slug: зафиксированы **immutable** встроенные slug; пользовательские разделы `kind=system` в папках кластера могут переименовываться (см. реализацию и [`CMS_RESTRUCTURE_PLAN.md`](CMS_RESTRUCTURE_PLAN.md)).

**Проверки:** ручная сверка `CMS_RESTRUCTURE_PLAN.md`; `STRUCTURE_AUDIT.md` не меняли.

**Вне scope:** миграция БД и правки кода — следующие шаги плана Composer.

---

## CMS Composer — реализация варианта C (миграция, CMS, patient-home, резолверы)

**Сделано:**

- БД и порт: `content_sections.kind` / `system_parent_code`, миграция с backfill, `apps/webapp/src/modules/content-sections/*`, реализация в `pgContentSections` (фильтры, upsert; переименование slug запрещено только для встроенных immutable slug, пользовательские разделы в папках можно переименовывать).
- CMS: `ContentPagesSidebar` (статьи vs папки), `/app/doctor/content?section=` и `?systemParentCode=`, список разделов с бейджами таксономии, форма раздела с «Расположение в CMS», `saveContentSection` с `placement`, защита встроенных slug в UI и в actions.
- Patient-home: правила в `blocks.ts`, фильтр кандидатов и проверка целей в `service.ts`, inline-создание раздела с `kind=system` и родителем из `systemParentCodeForPatientHomeBlock` (карусель — `inline_section_not_supported_for_block`).
- Главная пациента: `patientHomeResolvers.ts` и `todayConfig.ts` пропускают цели вне кластера; `patientHomeRuntimeStatus` и `/app/doctor/patient-home` передают в sync-контекст таксономию разделов и поле `section` у страниц.

**Проверки (зафиксированы явно для трассируемости):**

- `pnpm --dir apps/webapp typecheck`
- `pnpm --dir apps/webapp lint`
- `pnpm --dir apps/webapp test` (полный прогон тестов пакета webapp)

**Ops (после применения миграции `0017_content_sections_kind_system_parent.sql` на окружении):** выполнить контрольный запрос и при приёмке этапа добавить в этот журнал **одну строку** с датой, именем окружения (dev/stage/prod) и краткой сводкой счётчиков (без секретов, без полного дампа строк):

```sql
SELECT kind, COALESCE(system_parent_code::text, 'null') AS parent, COUNT(*) AS n
FROM content_sections
GROUP BY 1, 2
ORDER BY 1, 2;
```

**Вне scope этого прохода:** `parent_id` в БД, смена patient URL, перенос библиотеки в основное меню врача.

---

## 2026-05-02 — пост-аудит CMS Composer: журнал, планы и факты в CMS_AUDIT

**Сделано:**

- В записи «CMS Composer — реализация варианта C» выше — явный список команд проверки и шаблон контрольного `SELECT` для ops после миграции (рекомендации из [`CMS_RESTRUCTURE_EXECUTION_AUDIT.md`](CMS_RESTRUCTURE_EXECUTION_AUDIT.md) §4).
- [`PLAN_DOCTOR_CABINET.md`](PLAN_DOCTOR_CABINET.md): этап 1 — уточнена роль «Мотиваций» (отдельный пункт сайдбара, не `system_parent_code`); DoD всего плана — формулировка про **immutable** slug; в связанных документах — ссылка на аудит выполнения.
- [`RECOMMENDATIONS_AND_ROADMAP.md`](RECOMMENDATIONS_AND_ROADMAP.md): примечание к «Этапу 2» дорожной карты — фактическая первая итерация типизации соответствует **варианту C** из `CMS_RESTRUCTURE_PLAN.md`, а не полному enum из старого текста этапа.
- [`README.md`](README.md) этой папки — строки в таблице «Что в этой папке» для CMS-плана и аудита.
- [`CMS_AUDIT.md`](CMS_AUDIT.md): разграничение baseline «до миграции» и текущего состояния; строки таблицы §4 по CMS-хабу приведены в соответствие с вариантом C.
- [`TARGET_STRUCTURE_DOCTOR.md`](TARGET_STRUCTURE_DOCTOR.md): сноска к §8 про вариант C как первый шаг к целевой типизации.
- [`CMS_RESTRUCTURE_PLAN.md`](CMS_RESTRUCTURE_PLAN.md): в Definition of Done уточнён пункт про контрольный `SELECT` (шаблон в `LOG.md`).

**Проверки:** ручная сверка изменённых markdown-файлов; код не менялся.

---

## 2026-05-02 — этап 1 `PLAN_DOCTOR_CABINET` помечен закрытым

**Сделано:** в [`PLAN_DOCTOR_CABINET.md`](PLAN_DOCTOR_CABINET.md) в шапке и в блоке «Этап 1» зафиксировано закрытие CMS-разделения (вариант C); в сводной таблице этапов строка 1 помечена как **закрыт**.

**Проверки:** сверка с [`CMS_RESTRUCTURE_PLAN.md`](CMS_RESTRUCTURE_PLAN.md) (статус «реализовано») и записью «CMS Composer — реализация» в этом журнале.

---

## 2026-05-02 — подготовлено ТЗ для этапа 2 «Меню врача»

**Сделано:**

- Добавлен [`DOCTOR_MENU_RESTRUCTURE_PLAN.md`](DOCTOR_MENU_RESTRUCTURE_PLAN.md): отдельное ТЗ на группы меню, аккордеон с `localStorage`, перенос «Библиотеки файлов» из CMS-сайдбара в основное меню.
- В [`PLAN_DOCTOR_CABINET.md`](PLAN_DOCTOR_CABINET.md) добавлена ссылка на новое ТЗ в связанных документах и в блоке этапа 2.
- Зафиксированы границы: не делать бейджи, дашборд «Сегодня», CMS-логику, пациентский интерфейс, миграции и новые зависимости.
- Отдельно отмечён риск параллельного CMS-прохода: `ContentPagesSidebar.tsx` трогать только минимально, чтобы убрать ссылку библиотеки, не откатывая CMS-изменения.

**Проверки:** ручная сверка плана и текущих файлов меню (`doctorNavLinks.ts`, `DoctorHeader.tsx`, `DoctorAdminSidebar.tsx`, `doctorScreenTitles.ts`, `ContentPagesSidebar.tsx`). Код не правился.

---

## 2026-05-02 — подготовлено ТЗ для этапа 8 «Плотность интерфейса»

**Сделано:**

- Добавлен [`DOCTOR_UI_DENSITY_PLAN.md`](DOCTOR_UI_DENSITY_PLAN.md): отдельное ТЗ на уменьшение крупности doctor UI без редизайна.
- В [`PLAN_DOCTOR_CABINET.md`](PLAN_DOCTOR_CABINET.md) добавлена ссылка на новое ТЗ в связанных документах и в блоке этапа 8.
- Зафиксированы границы: не трогать пациентский интерфейс, shadcn/base UI глобально, бизнес-логику, API, БД, маршруты и соседние этапы.
- Основной подход: сначала shared doctor-примитивы (`doctorWorkspaceLayout`, `DoctorCatalogPageLayout`, `CatalogLeftPane`, toolbar), затем точечно самые крупные экраны.

**Проверки:** ручная сверка текущих shared doctor layout-файлов и блока этапа 8 в плане. Код не правился.

---

## 2026-05-02 — подготовлено ТЗ для этапа 7 «Каталоги назначений»

**Сделано:**

- Добавлен [`ASSIGNMENT_CATALOG_USAGE_ARCHIVE_PLAN.md`](ASSIGNMENT_CATALOG_USAGE_ARCHIVE_PLAN.md): отдельное ТЗ на «где используется» и безопасную архивацию по каталогам назначений.
- В [`PLAN_DOCTOR_CABINET.md`](PLAN_DOCTOR_CABINET.md) добавлена ссылка на новое ТЗ в связанных документах и в блоке этапа 7.
- Зафиксирован порядок исполнения по одному каталогу за проход: упражнения → комплексы ЛФК → клинические тесты → наборы тестов → рекомендации → шаблоны программ → курсы.
- Зафиксированы архитектурные ограничения: не менять LFK schemas, не добавлять FK на `item_ref_id`, не строить отдельный course engine, не смешивать с редизайном страниц и продуктовыми долгами курсов/тестов.
- Отдельно отмечено ограничение по курсам: точного `course_id` в экземплярах программ нет, поэтому счётчик назначений можно формулировать только через связанный `programTemplateId`, если не появится другой подтверждённый источник.

**Проверки:** ручная сверка текущих module/port/repo цепочек для LFK, tests, recommendations, treatment programs и courses. Код не правился.

---

## 2026-05-02 — подготовлено ТЗ для этапа 5 «Сообщения»

**Сделано:**

- Добавлен [`DOCTOR_MESSAGES_UNIFIED_CHAT_PLAN.md`](DOCTOR_MESSAGES_UNIFIED_CHAT_PLAN.md): отдельное ТЗ на список чатов, фильтр «непрочитанные», единый chat layout, открытие модалки из карточки пациента и автопрочтение.
- В [`PLAN_DOCTOR_CABINET.md`](PLAN_DOCTOR_CABINET.md) добавлена ссылка на новое ТЗ в связанных документах и в блоке этапа 5.
- Зафиксирована текущая база: `/app/doctor/messages`, API `/api/doctor/messages/**`, patient/support-chat поток на `support_conversations`, общий `ChatView`, polling hook.
- Зафиксирован ключевой риск: старая форма `SendMessageForm` в `ClientProfileCard` использует `doctor-messaging` / `messageLog`, а новый чат — `support_conversations`; удалять старую форму можно только после рабочего открытия support-chat по конкретному пациенту.
- Зафиксированы границы: не трогать `/broadcasts`, рассылки, пациентский интерфейс, realtime/websocket/SSE, БД-схему и глубокую переработку карточки пациента.

**Проверки:** ручная сверка текущих doctor messages routes/components, patient messages flow, `ClientProfileCard`, `modules/messaging`, `doctor-messaging` и `pgSupportCommunication`. Код не правился.

---

## 2026-05-01 — рамка текущего прохода `PLAN_DOCTOR_CABINET`

- В [`PLAN_DOCTOR_CABINET.md`](PLAN_DOCTOR_CABINET.md) добавлен общий фокус текущего прохода: работать прежде всего с механиками и разделами, которые определяют будущий пациентский опыт главной и внутренних блоков (`разминки`, `прогресс`, `ситуации`, `курсы`, `подписка` и т.д.), параллельно с doctor-facing UI кабинета.
- Карточка пациента зафиксирована как отдельный блок без глубокой переработки в текущем проходе: только решения, границы и будущая целевая рамка.
- Проверки: повторно прочитаны изменённые фрагменты плана; кодовые проверки не запускались, так как менялась только документация.
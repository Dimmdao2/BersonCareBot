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
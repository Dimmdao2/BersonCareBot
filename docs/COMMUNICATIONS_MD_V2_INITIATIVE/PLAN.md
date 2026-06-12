# COMMUNICATIONS_MD_V2 — План выполнения (для агентов sonnet)

Оркестратор: Opus. Исполнители: субагенты **sonnet**, по одному этапу за раз.
Источник истины по продукту — `README.md` (ТЗ) в этой же папке. Этот файл — **карта этапов и
протокол работы**. Перед кодом каждый агент читает: `README.md`, `AGENTS.md`, `.cursor/rules`,
`docs/ARCHITECTURE/DOCTOR_APP_UI_STYLE_GUIDE.md`.

---

## 0. Протокол (ОБЯЗАТЕЛЬНО для каждого агента)

### 0.1 Ветка и git — git делает ТОЛЬКО оркестратор
- Работаем в текущей ветке **`feat/doctor-ui-rebuild`** (НЕ main, НЕ новая ветка).
- **Параллельный чат пишет «Расписание» в ЭТУ ЖЕ ветку.** Поэтому:
  - **Агент НЕ запускает `git add/commit/push/checkout/stash/rebase`.** Совсем. Агент только
    правит файлы и гоняет проверки. Коммитит и пушит **оркестратор**, постадийно, только
    наши пути (`git add <явные пути>`, никогда `git add -A`/`git add .`/`commit -a`).
  - Агент **не трогает** чужую зону: `app/doctor/schedule/**`, `shared/ui/doctor/doctorNavLinks.ts`,
    `modules/doctor-appointments/**`, `infra/repos/pgDoctorAppointments.ts`. Если по задаче кажется,
    что нужно — СТОП, написать в отчёте, не редактировать.

### 0.2 Наша зона (что можно править)
`app/doctor/communications/**`, `app/doctor/broadcasts/**`, `app/doctor/messages/**`,
`app/doctor/online-intake/**`, `app/doctor/comments/**`, `app/doctor/loadDoctorExerciseComment*.ts`,
`modules/doctor-broadcasts/**`, `modules/program-item-discussion/**`,
`modules/messaging/**` (только если правка треда чата), соответствующие `infra/repos/pg*` и
`inMemory*` для рассылок/комментариев, `app/api/doctor/**` нашего скоупа, `docs/COMMUNICATIONS_MD_V2_INITIATIVE/**`.

### 0.3 Общий канон (из README §0.2 — повторено для удобства)
1. Clean Architecture: UI/page без `@/infra/*`, данные через app-layer loader/сервис. DB — только через порты.
2. Изоляция зон: в doctor-зоне запрещены `@/components/ui/**` и `@/shared/ui/patient/**`;
   примитивы — из `@/shared/ui/doctor/primitives/*`.
3. Секции — `DoctorSection`/`doctorSectionCardClass`; пустые состояния — `DoctorEmptyState` (есть `size`).
4. Плотность контролов: input/select/button — `h-8`. Никаких `h-9`/`h-10`.
5. Типографика: заголовки — `doctorSectionTitleClass`; запрещены `text-lg/xl/3xl`, `text-[13px]`,
   `rounded-2xl`, тени на page-level секциях.
6. Любая правка `shared/ui/doctor/**` — **строго аддитивная и обратносовместимая** (зона пересечения
   с «Расписанием»): только новые пропы/файлы, существующие сигнатуры не менять.

### 0.4 Definition of Done на этап
- `cd apps/webapp && npx tsc --noEmit` — 0 ошибок.
- `npx eslint <изменённые файлы>` — 0.
- `npx vitest run <релевантные .test>` — зелёные; новые тесты на новую логику. **Полный CI не гонять.**
- Обновить `docs/COMMUNICATIONS_MD_V2_INITIATIVE/LOG.md` (создаётся в Этапе 1): что сделано, проверки,
  сознательно не сделано, продуктовые развилки (по README §7 — фиксировать, не угадывать).
- Вернуть оркестратору: список изменённых файлов + результаты проверок + замечания.

### 0.5 Независимый скролл (сквозной шаблон, README §2)
Канон split-layout как на `exercises`. Переиспользовать:
- `CatalogSplitLayout` (`@/shared/ui/doctor/catalog/CatalogSplitLayout`) — обёртка двух пейнов;
- `CatalogLeftPane` / `CatalogRightPane` — колонки с рамкой и внутренним скроллом;
- высоты — константы из `@/shared/ui/doctor/doctorWorkspaceLayout`
  (`DOCTOR_CATALOG_SPLIT_LAYOUT_MAX_H_SINGLE` и родственные): контейнер высотой «вьюпорт − шапка − таб-бар»,
  внутри — два независимо скроллящихся пейна. Таб-бар коммуникаций ≈ один липкий ряд (~3.25rem).
- НЕ верстать заново гридами с `min-h-[400px]`; заменить текущие `grid` в табах на split-layout.

---

## Карта этапов

| Этап | Фаза README | Содержание | Риск |
|------|-------------|------------|------|
| 1 | A0 | Порядок вкладок + LOG.md + каркас независимого скролла | низкий |
| 2 | A1 | Чаты: ширины пейнов, отступы треда, превью-ellipsis, пустое состояние, независимый скролл | низкий |
| 3 | A2 | Заявки: фильтры→тогглы (без «Все»), независимый скролл | низкий |
| 4 | A4 + CI | Рассылки: порядок полей, аудитория-дропдаун, категории, каналы(5)+точные счётчики, отступы, фикс красного CI | средний |
| 5 | B.1–B.2 | Комментарии: drill-down (пациенты→упражнения→чат), бэкенд-агрегация, шапка | высокий |
| 6 | B.3 | Микро-график статистики упражнения в шапке чата комментариев | средний |
| 7 | B.4 | Журнал рассылок: аккордеон + доставка по каналам (низкий приоритет, опционально) | низкий |

Фаза C (README §6) — **вне этого прогона** (патиент-апп + схема, отдельно).

---

## Этап 1 — A0: порядок вкладок + LOG + каркас скролла

**Цель:** порядок вкладок **Чаты → Комментарии → Заявки → Рашки** и фундамент независимого скролла.

**Файлы:**
- `communications/doctorCommunicationsTabs.ts` — переставить `COMMUNICATIONS_TABS` в порядок
  `chats, comments, intake, broadcasts`. `communicationsTabFromQuery` и ключи URL не менять.
- `communications/communicationsTabRegistry.ts` — тот же порядок в `COMMUNICATIONS_TAB_REGISTRY`.
- `communications/doctorCommunicationsTabs.test.ts` — обновить ожидаемый порядок на
  `["chats","comments","intake","broadcasts"]`.
- `communications/communicationsTabRegistry.test.ts` — если фиксирует порядок, обновить.
- (опц.) `DoctorCommunicationsShell.test.tsx` — если завязан на порядок.
- `communications/DoctorCommunicationsShell.tsx` — обеспечить, чтобы область контента таба могла
  занять высоту «вьюпорт − шапка − таб-бар»: обёртка таба `<div hidden=...>` получает классы
  для полной высоты (`min-h-0 flex-1`), `<main>` в `DoctorAppShell` уже `flex flex-col`. Скролл —
  внутри пейнов конкретного таба (этапы 2–5), здесь только подготовить контейнер, не ломая keepMounted/URL-sync.
- Создать `docs/COMMUNICATIONS_MD_V2_INITIATIVE/LOG.md` по образцу
  `app/doctor/communications/LOG.md` (заголовок инициативы + раздел «Этап 1»).

**Не делать:** редиректы старых URL, deep-link ключи, нав левого меню.

**Тесты:** `vitest run` по `doctorCommunicationsTabs.test.ts`, `communicationsTabRegistry.test.ts`,
`DoctorCommunicationsShell.test.tsx`; `tsc`; eslint изменённых.

---

## Этап 2 — A1: Чаты (`messages/DoctorSupportInbox.tsx` + тред-панель)

**Цель:** косметика + независимый скролл (README §A1).

1. **Ширины пейнов:** сейчас `gridTemplateColumns: "1.4fr 1fr"` (список шире чата) → сделать окно
   чата НЕ уже списка (равные или чат шире, напр. `1fr 1.2fr`). Перевести на `CatalogSplitLayout`
   с независимым скроллом списка и треда.
2. **Тред (`@/modules/messaging/components/DoctorChatPanel`):** добавить горизонтальный padding
   сообщений от края пейна и больший вертикальный интервал между сообщениями. ⚠️ `DoctorChatPanel`
   может использоваться и вне коммуникаций — проверить usages (`grep`); если используется ещё где-то,
   правки делать так, чтобы не ломать другие места (через проп или безопасные отступы).
3. **Превью в списке:** одна строка с ellipsis (`truncate` уже есть — проверить, что реально
   обрезается одной строкой, при необходимости убрать многострочность).
4. **Пустое правое состояние** «Выберите чат слева» → `DoctorEmptyState`.
5. Сохранить логику поллинга (active+visible) и фильтры — не трогать.

**Тесты:** `DoctorSupportInbox.test.tsx` (+ обновить при смене разметки); tsc; eslint.

---

## Этап 3 — A2: Заявки (`online-intake/DoctorOnlineIntakeClient.tsx`)

**Цель:** фильтры статусов → тоггл-кнопки + независимый скролл (README §A2).

1. **Фильтры статусов → мультитоггл** как в чатах: клик вкл/выкл; **убрать «Все»**; пустой выбор =
   показать все. (Сейчас single-select Новые/В работе/Записанные/Отказанные/Все.)
2. **Независимый скролл** левого списка и правой карточки — `CatalogSplitLayout`.
3. **Статистику заявок (7/30/90/год) НЕ трогать** — она независима от фильтра (решение владельца).

**Тесты:** `DoctorOnlineIntakeClient.test.tsx` (обновить под мультитоггл); tsc; eslint.

---

## Этап 4 — A4: Рассылки (split 4a backend / 4b UI)

**Подтверждённые факты бэкенда (recon оркестратора):**
- `BroadcastChannel = "bot_message"|"sms"|"push"|"home_banner"|"notification_bell"`;
  `BROADCAST_ACTIVE_CHANNELS = ["bot_message","sms","push"]`.
- В доставке (`deliveryJobs.ts`) `bot_message` УЖЕ раскладывается на отдельные **telegram** и **max**
  jobs по биндингам `client.bindings.telegramId` / `.maxId`. Значит разделить TG/MAX в выборе —
  малая правка гейтинга, данные уже есть на `ClientListItem.bindings`.
- **push** уже управляется выбором канала: `service.ts` → `channels.includes("push")` →
  `fanOutBroadcastWebPush`. Баг только в **счётчике** push (хардкод `push: 0` в
  `infra/repos/broadcastChannelCounts.ts`).
- **Счётчик** `getChannelConnectionCounts` (pg, Drizzle): сейчас `bot_message`=telegram-биндинги,
  `sms`=phone, `push`=0. Данные для всех 5 каналов в БД есть: `user_channel_bindings`
  (`channel_code='telegram'|'max'`), `platform_users.phone_normalized`, web_push-подписки
  (см. `pgWebPushSubscriptions`/`resolveBroadcastWebPushEligibleUserIds`), email
  (`platform_users` email + verified).
- **email на `ClientListItem` НЕТ** (email-поля — на профиле, не в списке аудитории). Email-отправка
  как инфраструктура есть (`modules/outbound-email/sendTransactionalSmtp.ts`,
  `modules/notification-delivery` знает канал `email`), но **broadcast→email фанаута в
  `doctor-broadcasts` нет** — это единственный реально недостающий кусок доставки.
- **Красный CI `webappPhase15F.verify.test.ts` УЖЕ ЗЕЛЁНЫЙ** (закрыт миграцией Wave3 15G). Отдельный
  фикс НЕ нужен. ⚠️ НО: любой новый SQL в этом этапе — только Drizzle `db.execute(sql)`, НЕ
  `pool.query`/`client.query` (иначе сломаешь этот гейт и его ассерт «tail size = 25»).

### Этап 4a — бэкенд: 5-канальная модель + реальные счётчики + доставка
**Файлы:** `modules/doctor-broadcasts/{broadcastChannels.ts,ports.ts,draftPort.ts,deliveryJobs.ts,service.ts,broadcastEligible.ts}`,
`broadcasts/labels.ts`, `infra/repos/broadcastChannelCounts.ts`, `infra/repos/inMemoryBroadcastChannelCounts.ts`,
их тесты. Всё **аддитивно/обратносовместимо** (зона `shared`/`doctor-appointments` не трогается).

1. Добавить в `BroadcastChannel` значения `telegram`, `max`, `email`. `BROADCAST_ACTIVE_CHANNELS` →
   `["telegram","max","push","sms","email"]`. `bot_message` оставить как **legacy** значение
   (историч. аудит): распознаётся в `CHANNEL_LABELS` и при показе журнала маппится на telegram+max,
   но как новый активный канал не предлагается. `normalizeBroadcastChannels` обновить.
2. `deliveryJobs.ts`: гейтинг `wantsBot=includes("bot_message")` → `wantsTelegram=includes("telegram")`,
   `wantsMax=includes("max")` (telegram-job под TG, max-job под MAX). sms — как есть. Сохранить
   обратную совместимость: если в `channels` встретился legacy `bot_message` — трактовать как (telegram+max).
3. **email-доставка:** СНАЧАЛА исследуй существующий путь (пользователь утверждает, что рассылка по
   email уже есть в интеграциях). Проверь `notification-delivery`, `outbound-email`,
   `fanOutBroadcastWebPush` как шаблон, DI `buildAppDeps`. Если есть переиспользуемый путь — подключи
   email как канал (eligibility = верифицированный email; добавь email-фанаут по аналогии с web push
   ИЛИ email-job, если так в архитектуре). Если готового broadcast-email пути нет — добавь минимальный
   фанаут, переиспользуя `outbound-email`, eligibility по верифиц. email; **весь новый SQL — Drizzle**.
   Если плумбинг email в аудиторию выходит за разумный объём — канал всё равно сделать видимым и с
   **реальным счётчиком**, а фактическую отправку — guarded + детально зафиксировать в LOG.md, что
   именно осталось. Не ломать gate phase15F.
4. **Счётчики:** `BroadcastChannelCounts` → `{ telegram, max, push, sms, email }` (аддитивно;
   `bot_message` можно сохранить для совместимости/легаси, но форма читает 5 новых). Реализовать
   реальные числа в pg (Drizzle) и inMemory: telegram/max из `user_channel_bindings`, sms из phone,
   **push — реальное число активных web_push-подписок** (не 0), email — верифиц. email.
5. **Дефолт каналов в команде/сервисе:** где сервис подставляет каналы по умолчанию — привести к
   `Telegram + MAX + Push`.
6. Обновить ВСЕ затронутые тесты модуля рассылок (многие ассертят `bot_message`/старые дефолты).

### Этап 4b — UI формы рассылки
**Файлы:** `broadcasts/BroadcastForm.tsx`, `broadcasts/BroadcastAudienceSelect.tsx`,
`broadcasts/labels.ts`, `communications/tabs/BroadcastsTab.tsx`, их тесты.

1. **Порядок полей:** Аудитория → **Категория** → Каналы → Заголовок → Текст → кнопки.
2. **Аудитория · кому:** заменить нативный `<select>` на доктор-дропдаун (`ReferenceSelect`,
   `displayLabel`/`SelectValue`, `h-8`). Single-select, «кому» (без каналов/SMS).
   - Набор сегментов — README §5.1. **Дефолт скоупа:** оставить существующие `BroadcastAudienceFilter`,
     подписи под §5.1 где совпадает; новые сегменты с новыми DB-фильтрами и «Выбрать вручную» (диалог) —
     НЕ в этом этапе, зафиксировать развилку в LOG.md (per README §7), не лезть в `doctor-appointments`.
     `isAudienceEstimateApproximate` сохранить.
3. **Категория:** 4 тоггл-чипа **Организационное · Важное · Сервисное · Рекламное**, дефолт —
   **Организационное** (`organizational`). Маппинг: `organizational`, `important_notice`, `service`,
   `marketing`. Прочие категории не показывать. Сейчас дефолт пустой — сделать `organizational`.
4. **Каналы · куда:** 5 чекбоксов **Telegram · MAX · Push · SMS · Email** (из 4a). Под каждым —
   **точная цифра из БД**. Дефолт отмечены **Telegram + MAX + Push** (SMS, Email — выкл) — поправить
   `useState` и `handleReset`. Дублирование по каналам — by design.
5. **Отступ заголовка «Новая рассылка»** уменьшить (`BroadcastsTab.tsx`).
6. **Независимый скролл** (общий шаблон) для вкладки рассылок.
7. **Логику compose/preview/confirm/draft НЕ менять** (только дефолты и верстку полей).

**Тесты:** `BroadcastForm.test.tsx`, `BroadcastsTab.test.tsx`, тесты затронутых модулей рассылок,
`webappPhase15F.verify.test.ts` (должен остаться зелёным); tsc; eslint.

---

## Этап 5 — B.1–B.2: Редизайн комментариев (drill-down)

> Полностью заменяет плоскую раскладку `comments/DoctorCommentsTab.tsx`. README §B.1–B.2 — источник.

**Модель (3 состояния правого пейна):**
- **Левый пейн — список ПАЦИЕНТОВ** (имя + счётчик непрочитанных + «★»). Сверху — поиск + тоггл-фильтры
  (поведение из README §A3: клик вкл/выкл, пустой выбор = все; «★ на сопровождении» как тоггл, не
  статичный бейдж — текущий баг). Поиск многополевой (имя/фамилия вкл. скрытую/displayName/телефон/
  email/telegram/MAX — как на странице пациентов). Адаптив: на узком — поиск отдельной строкой сверху,
  фильтры под ним; плейсхолдер «Поиск». Поиск/фильтры фильтруют **оба** пейна.
- **(A) Лента всех комментариев** (пациент не выбран): плоский список, имя пациента + первые 2 строки.
- **(B) Упражнения пациента** (пациент выбран): только упражнения с комментариями; превью-миниатюра +
  название + бейдж «всего/новых»; группировка по этапам (активный сверху, закрытые — свёрнуты внизу);
  сортировка по дате последнего комментария (новые сверху). Прошлые программы — опционально/вторично.
- **(C) Чат по упражнению** (упражнение выбрано): карточка упражнения сверху + тред комментариев,
  ответ на каждый + «отметить прочитанным». Переиспользовать текущую механику ответа
  (`DoctorCommentsTab` reply + route `program-note-reply`), привести под стиль.

**Навигация:** пациент→B; упражнение→C; текст-кнопка «Закрыть» (НЕ «×») C→B; «×» в шапке пациента B→A.

**Шапка правого пейна (§B.2):** B — имя + «★ на сопровождении» + счётчик всего/новых; C — хлебная
крошка пациент→упражнение. Клик по имени пациента → дашборд пациента (`doctorClientProfileHref`).
**Убрать** ссылку «Открыть упражнение →».

**Бэкенд-агрегация (app-layer + module ports, аддитивно):**
- Пациенты с непрочитанными комментариями (уже есть `loadDoctorExerciseCommentAttention` +
  doctor-wide методы в `program-item-discussion`). Сгруппировать по пациенту со счётчиком.
- Упражнения пациента с комментариями, сгруппированные по этапам (вкл. закрытые), с «всего/новых».
- Переиспользовать `listAttentionSummaryForStageItems`, `listMessagesPage`, `getLastReadAtForViewer`,
  `pickActivePlanInstance`, `treatmentProgramInstance.*`. Новые методы портов — **аддитивно**.
- Миниатюры упражнений — канон `@/shared/ui/doctor/media` (`ExerciseListCatalogThumb` и т.п.).

**Подэтапы (агент может разбить внутри себя, но коммит — оркестратор после готовности этапа):**
- 5a: бэкенд-агрегация (loader + порты + сервис + тесты, inMemory-паритет).
- 5b: UI drill-down (split-layout, 3 состояния, навигация, шапка) + тесты.

**Развилки (зафиксировать в LOG.md, не угадывать): точная разбивка «всего/новых», поведение прошлых
программ, набор полей многополевого поиска по пациенту.**

**Тесты:** новые на агрегацию + компонентные на drill-down; tsc; eslint.

---

## Этап 6 — B.3: Микро-график статистики упражнения (шапка чата C)

**Цель:** в шапке чата упражнения — компактный микро-график (полоски) за последнюю неделю:
повторения / (подходы) / вес / тяжесть (легко/тяжело). README §B.3.

- Метрики — **гибко**: рисовать то, что реально пишется в модели выполнения упражнения. Свериться,
  что доступно (повторения/вес/тяжесть). **Подходы (sets) сейчас не пишутся** — заложить место, чтобы
  подхватить без переделки (Фаза C добавит).
- Источник данных — порт/сервис выполнения упражнений (найти существующий по grep), читать через
  app-layer. Никаких прямых infra из UI.
- Компонент микро-графика — переиспользуемый (README §C.2: пригодится на странице пациента), но саму
  страницу пациента в этом этапе не трогать. Канон графиков — `@/shared/ui/doctor/analytics` /
  `DoctorRechartsTooltip` (свериться).

**Развилка:** набор метрик графика — зафиксировать в LOG.md.

**Тесты:** unit на агрегацию метрик + компонентный; tsc; eslint.

---

## Этап 7 — B.4: Журнал рассылок (опционально, низкий приоритет)

**Цель (README §B.4):** правый пейн рассылок — аккордеон (одна строка за раз):
сводка Категория·Аудитория·Каналы; полный текст; вложенный аккордеон «Доставка по каналам»
(`N доставлено · M ошибок`, причины с именами); действия «Повторить N неудачным»,
«Открыть ошибки →», «Создать на основе».

**Приоритет низкий.** Разделение причин недоставки в исторических рассылках отсутствует — делать
«по возможности», не блокирует ничего. Если данных нет — реализовать каркас аккордеона на доступных
полях `BroadcastAuditEntry` (sentCount/errorCount/blockedRecipientCount), остальное — зафиксировать.

**Файлы:** `broadcasts/BroadcastAuditLog.tsx` (+ тест). Логику отправки не трогать.

---

## Аудит (финал, делает оркестратор)
После всех этапов: `tsc` целиком по apps/webapp; eslint по всем изменённым; прогон всех затронутых
vitest-файлов; ручная проверка на dev-логине доктора (README §0.4, `127.0.0.1:5200`). Отчёт по
ошибкам/развилкам.

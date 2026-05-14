# MASTER PLAN — Operator Health & Alerting

Дата черновика: 2026-05-03.

## 1. Цель

Обеспечить **операторскую видимость** здоровья системы и внешних интеграций:

1. **Регулярные** (редкие) синтетические проверки доступности исходящих API и ключевых зависимостей.
2. **Событийные** уведомления при сбоях на горячих путях (вебхуки, создание записи в Google Calendar, автомерж, воркеры/очередь проекции и т.д.).
3. **Разовые** алерты по принципу: один сервис × один класс причины × один открытый инцидент — без спама при повторяющихся ошибках до восстановления.
4. **Явное разделение** в метриках, UI и тексте алертов: **исходящий канал** (мы → провайдер) vs **входящий вебхук** (провайдер → наш API) vs **внутренняя обработка** после приёма.
5. **Уведомление о восстановлении** после успешного ping, успешной операции или нормализации очереди (по согласованным критериям).
6. **Мультиканальная доставка** при недоступности одного канала: Telegram, email, запись в UI (обязательный слой, если outbound TG недоступен).

Детальная декомпозиция реализации по фазам: см. **§5** и файлы `PHASE_A_*.md` … `PHASE_G_*.md` в этой папке.

## 2. Текущее состояние (baseline)

- Вкладка **«Здоровье системы»** (`/app/settings`, admin mode): `GET /api/admin/system-health` (сбор [`collectAdminSystemHealthData`](../../apps/webapp/src/app-layer/health/collectAdminSystemHealthData.ts)) агрегирует webapp DB, integrator `GET /health`, projection `GET /health/projection` (очередь `projection_outbox`: pending/dead/retries/`lastSuccessAt`), медиа-превью, метрики playback и клиента плеера, **ошибки HLS-прокси**, **очередь доставки уведомлений**, **метрики транскода** (`media_transcode_jobs` + кандидаты legacy-reconcile по DRY-предикату), **`videoTranscode.status`** (`ok` \| `degraded` \| `error`, пороги в [`adminHealthThresholds.ts`](../../apps/webapp/src/modules/operator-health/adminHealthThresholds.ts)), тик **`POST /api/internal/media-transcode/reconcile`** в **`operator_job_status`**, открытые операторские инциденты и статусы host backup. Воркер projection оценивается **косвенно** (нет systemd API в variant 1).
- Отдельного блока **«здоровье интеграций»** (Google Calendar, Telegram/MAX как внешние API, Rubitime api2, SMSC) в общем health **нет**.
- В коде уже есть паттерн **дедуп + Telegram при первом инциденте**: `recordDataQualityIncidentAndMaybeTelegram` (integrator), таблица качества данных — шаблон для операторских инцидентов.
- MAX: в `apps/integrator/src/integrations/max/client.ts` есть **`getMaxBotInfo`** (`getMyInfo`) — задокументировано как health/auth check.
- Telegram: grammy `Bot`, для синтетики пригоден **`getMe`** (обёртки под health в репозитории может не быть).
- Google Calendar: refresh token + Calendar API (`apps/integrator/src/integrations/google-calendar/client.ts`); отдельного health-роута нет.
- Rubitime: `api2` (`get-schedule`, `get-record`, …), глобальный throttle ~5.5 s между исходящими вызовами (`rubitime_api_throttle`).
- SMSC: `createSmscClient` → `send.php`; режимы **стоимости без отправки** (`cost=1`) и **виртуальная отправка** — в документации SMSC; в текущем клиенте **не прокинуты** — потребуется явная реализация для health.

## 3. Принятые продуктовые решения

### 3.1 Ключи инцидентов и причины

- **Разные классы падений — разные ключи дедупликации.** Нужно знать **причину** (HTTP-код, стабильный `error_code`, тип этапа: OAuth vs Calendar API vs парсинг вебхука).
- Один открытый инцидент на пару **(канал интеграции, класс ошибки)** (уточнить в реализации при коллизиях: например `rubitime_api:invalid_grant` отдельно от `rubitime_webhook:schema`).

### 3.2 Восстановление (resolution)

Считать инцидент **закрытым** и слать **уведомление о восстановлении**, когда выполняется согласованный критерий, например:

- успешный **синтетический ping** по этому каналу;
- успешная **боевые операция** (например синк календаря после записи);
- для очереди проекции: **`deadCount` вернулся к 0** (и при необходимости совместно с отсутствием retries over threshold) — уточнить в реализации, чтобы не мигать при временных колебаниях.

### 3.3 Доставка алертов

- Основной канал: **Telegram** админу (как сейчас в ряде сценариев).
- При сбое исходящей доставки или для надёжности: **email** + **запись в БД для UI** (баннер/список открытых инцидентов на вкладке здоровья или отдельном блоке).

### 3.4 Два измерения здоровья (для всех релевантных каналов)

| Измерение | Вопрос | Как снимать |
|-----------|--------|-------------|
| **Исходящая доступность** | Работают ли учётные данные, сеть и контракт API к провайдеру? | Редкие синтетические пробы (см. §4). |
| **Входящий контур** | Принимаем ли мы вебхук и успешно ли он обрабатывается в нашем приложении? | Состояние **последней** (или последних N) обработок по источнику: успех, ошибка парсинга, 5xx, таймаут ответа. |

**Важно:** `get-schedule` и аналоги **не** проверяют вебхук — это исходящий вызов. Вебхук оценивается отдельно (логи/таблица «последний результат по источнику»).

### 3.5 Rubitime: `get-schedule` без оценки «есть слоты»

- Успех synthetic probe: **HTTP ок**, envelope Rubitime `status: ok`, структура ответа соответствует ожидаемому контракту.
- **Не** трактовать отсутствие свободных слотов или пустое расписание как «падение интеграции» — только как информационный сигнал при необходимости.
- Триплет branch/cooperator/service брать из **стабильного** профиля каталога; при смене id на стороне Rubitime возможны ложные срабатывания — предусмотреть операторскую настройку «эталонного» триплета для health (в `system_settings` или аналог).

### 3.6 SMSC: виртуальная отправка vs только стоимость

- Предпочтительно для «уверенности в цепочке» периодически использовать **виртуальную отправку** (режим из документации SMSC), реже — только **`cost=1`** (расчёт без отправки), если нужен минимальный smoke по ключу без нагрузки.
- Частота синтетики: **раз в час или 1–2 раза в сутки** — достаточно; не каждую минуту.

### 3.7 Скорость обнаружения

- **Быстрые** ошибки — прежде всего из **входящих вебхуков** и из **операционных путей** (календарь, мерж, projection), а не из часового cron.
- Редкий cron ловит **деградацию ключей/сети/провайдера** между событиями.

## 4. Каталог интеграций для мониторинга

| Интеграция | Исходящий synthetic (идея) | Входящий / событийный |
|------------|----------------------------|------------------------|
| **Telegram Bot API** | `getMe` | Вебхук Telegram: последняя обработка update |
| **MAX** | `getMaxBotInfo` / `getMyInfo` | Вебхук MAX: последняя обработка |
| **Google Calendar** | OAuth refresh + минимальный Calendar GET (календарь или `events.list` limit 1) | Ошибки в `syncAppointmentToCalendar` / post-create projection |
| **Rubitime api2** | `get-schedule` (валидный триплет, без критерия «есть слоты») | Вебхук Rubitime: успех/ошибка обработки у нас |
| **SMSC** | `cost=1` и/или виртуальная отправка (по политике) | Ошибки реальной отправки OTP/уведомлений (если есть единая точка) |
| **SMTP / email** | `transporter.verify()` или controlled test (если добавить) | Ошибки `sendMail` на алертах |
| **Integrator + DB** | Уже в `/health` | — |
| **Projection queue** | snapshot в `/health/projection` | dead / retries / stale pending — пороги и инциденты |
| **Media worker / S3** | Уже частично в system-health; при необходимости расширить | Ошибки jobs |

**VK / Instagram** в реестре — заглушки; полноценный мониторинг после появления реальных адаптеров.

## 5. Задачи (поставленный backlog)

Детальная декомпозиция по фазам — отдельные файлы (этап → шаги → checklist → DoD фазы):

| Фаза | Документ |
|------|----------|
| **A** — Модель данных и ядро алертинга | [`PHASE_A_DATA_MODEL_AND_CORE_ALERTING.md`](PHASE_A_DATA_MODEL_AND_CORE_ALERTING.md) |
| **B** — Синтетические пробы (cron) | [`PHASE_B_SYNTHETIC_PROBES_CRON.md`](PHASE_B_SYNTHETIC_PROBES_CRON.md) |
| **C** — Входящие вебхуки: последний статус | [`PHASE_C_INBOUND_WEBHOOK_LAST_STATUS.md`](PHASE_C_INBOUND_WEBHOOK_LAST_STATUS.md) |
| **D** — Событийные хуки | [`PHASE_D_EVENT_HOOKS.md`](PHASE_D_EVENT_HOOKS.md) |
| **E** — Восстановление и уведомление «ок» | [`PHASE_E_RESOLUTION_AND_RECOVERY_NOTIFICATIONS.md`](PHASE_E_RESOLUTION_AND_RECOVERY_NOTIFICATIONS.md) |
| **F** — UI и admin API | [`PHASE_F_UI_AND_ADMIN_API.md`](PHASE_F_UI_AND_ADMIN_API.md) |
| **G** — Тесты и документация | [`PHASE_G_TESTS_AND_DOCS.md`](PHASE_G_TESTS_AND_DOCS.md) |

Рекомендуемый порядок исполнения: **A → (B ∥ C)** → **D** → **E** → **F** → **G** (G частично параллелится с F). **B** и **C** можно параллелить после A при разделении файлов/миграций.

## 6. Оценка трудозатрат (ориентир)

- **Полный объём** (все фазы, recovery, UI, мультиканал): порядка **10–15 инженерных дней**.
- **MVP** (инциденты + критичные хуки + TG + UI без recovery-email): **5–7 дней**. Детальный порядок работ, дедуп GCal, два entrypoint вебхука/post-create, защита probe — см. [`MVP_IMPLEMENTATION_PLAN.md`](MVP_IMPLEMENTATION_PLAN.md).

## 7. Definition of Done (инициатива)

- Админ видит на вкладке здоровья **раздельно**: исходящую доступность по ключевым интеграциям и статус **последнего** входящего вебхука по Rubitime/Telegram/MAX.
- При деградации — **одно** уведомление на инцидент до починки; при восстановлении — одно уведомление «ок».
- При недоступности TG алерт доходит **минимум** через запись в UI + email (если SMTP настроен).
- Синтетические пробы не чаще заданного интервала; Rubitime **не** помечает красным отсутствие слотов при валидном `get-schedule`.
- Ключи и параметры интеграций — через **`system_settings`** по правилам репозитория.
- Целевые тесты и линт по затронутым пакетам; перед пушем полный **`pnpm run ci`** (`.cursor/rules/pre-push-ci.mdc`).

## 8. Карта кода (ориентир)

| Область | Пути |
|---------|------|
| Health UI | `apps/webapp/src/app/app/settings/SystemHealthSection.tsx` |
| Health API | `apps/webapp/src/app/api/admin/system-health/route.ts` |
| Integrator health | `apps/integrator/src/app/routes.ts` (`/health`, `/health/projection`) |
| MAX client | `apps/integrator/src/integrations/max/client.ts` |
| Telegram client | `apps/integrator/src/integrations/telegram/client.ts` |
| Google Calendar | `apps/integrator/src/integrations/google-calendar/` |
| Rubitime | `apps/integrator/src/integrations/rubitime/client.ts`, `webhook.ts` |
| SMSC | `apps/integrator/src/integrations/smsc/client.ts` |
| Дедуп-прецедент | `apps/integrator/src/infra/db/dataQualityIncidentAlert.ts` |
| Admin audit / merge | `apps/webapp/src/infra/adminAuditLog.ts`, вкладка аудита |

## 9. Риски

- **Синтетика не ловит** регресс сразу после деплоя — компенсируется событийными хуками.
- **Throttle Rubitime** — пробы не должны забивать очередь реальных api2-вызовов.
- **Ложные срабатывания** при смене триплета/календаря — смягчать настройкой эталонов и текстами алертов.

## 10. Связанные правила репозитория

- Интеграционная конфигурация в **`system_settings`**, не новые env для ключей (`.cursor/rules/000-critical-integration-config-in-db.mdc`).
- Чистая архитектура модулей webapp — новые запросы через порты/DI (`.cursor/rules/clean-architecture-module-isolation.mdc`).
- Документация исполнения — `LOG.md` в папке инициативы (`.cursor/rules/plan-authoring-execution-standard.mdc`).

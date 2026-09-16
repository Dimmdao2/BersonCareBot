---
name: Admin incident alerts
overview: 'Настраиваемые уведомления админам вне админки (TG/Max relay) для идентичности: channel-link, автомерж, phone-bind, аномалии projection — ключ admin_incident_alert_config. Закрыто: миграции, PATCH/UI, relay, тесты, docs. In-app merge/purge — backlog (PHASE_D §8, docs/TODO.md).'
status: completed
todos:
  - id: schema-key-migration
    content: admin_incident_alert_config в ALLOWED_KEYS, Drizzle 0064 (public) + integrator core 20260515_0001, дефолтный JSON v1 topics + channels
    status: completed
  - id: parser-send-webapp
    content: parseAdminIncidentAlertConfig + sendAdminIncidentAlerts (relayOutbound, admin_* ids, channels; безопасный текст; лог при пустых получателях / ошибке relay)
    status: completed
  - id: wire-channel-merge-audit
    content: upsertOpenConflictLog → insertedFirst; channel-link; auto_merge_conflict relay только при insertedFirst; auto_merge_conflict_anomaly отдельная тема
    status: completed
  - id: wire-webapp-phone-bind
    content: messengerPhoneHttpBindExecute после audit blocked — алерт с дедупом (conflict_key / сортированные candidate ids), без дубля с integrator
    status: completed
  - id: integrator-phone-bind
    content: recordMessengerPhoneBindBlocked + anomaly — public.system_settings; TG dispatchPort; Max sendMaxMessage + admin_max_ids
    status: completed
  - id: admin-ui-settings
    content: AdminIncidentAlertsSection — темы v1 + каналы TG/Max; PATCH + тесты route
    status: completed
  - id: docs-cross
    content: CONFIGURATION_ENV_VS_DATABASE, auth.md, PHASE_D; исключены data-quality и operator health из ключа
    status: completed
  - id: followup-inapp-merge-purge
    content: 'Отменено в рамках relay-MVP: in-app merge / purge — backlog (PHASE_D §8, docs/TODO.md), не admin_incident_alert_config'
    status: cancelled
isProject: false
---

# Admin incident alerts (topics + channels), усиленный план

## Контекст

- [`upsertOpenConflictLog`](apps/webapp/src/infra/adminAuditLog.ts) — `auto_merge_conflict`, пинга админу нет.
- [`channelLink.ts`](apps/webapp/src/modules/auth/channelLink.ts) — `reportChannelLinkBindingConflict` только в консоль; [`setChannelLinkBindingConflictReporter`](apps/webapp/src/modules/auth/channelLink.ts) не подключён в проде.
- Integrator [`recordMessengerPhoneBindBlocked`](apps/integrator/src/infra/db/repos/messengerPhoneBindAudit.ts) — Telegram через прямой `fetch` на один `TELEGRAM_ADMIN_ID`, Max нет.
- Webapp [`messengerPhoneHttpBindExecute.ts`](apps/webapp/src/modules/integrator/messengerPhoneHttpBindExecute.ts) пишет `messenger_phone_bind_blocked` через [`writeAuditLog`](apps/webapp/src/infra/adminAuditLog.ts) (каждый раз новая строка) — пинга нет; риск **спама**, если слать в мессенджер на каждый INSERT без дедупа.
- Relay и списки админов: [`intakeNotificationRelay.ts`](apps/webapp/src/modules/online-intake/intakeNotificationRelay.ts) + [`relayOutbound`](apps/webapp/src/modules/messaging/relayOutbound.ts).
- Согласованность с дедупом аудита: [`docs/OPERATOR_HEALTH_ALERTING_INITIATIVE/PHASE_D_EVENT_HOOKS.md`](docs/OPERATOR_HEALTH_ALERTING_INITIATIVE/PHASE_D_EVENT_HOOKS.md) — один **внешний** алерт на **новый** `conflict_key` для открытого конфликта; при повторных событиях той же пары — не дублировать пинг в TG/Max (обновление `repeat_count` без нового relay), если явно не включён отдельный «digest» (вне v1).

## Продуктовые уточнения (вне JSON-ключа relay)

### Ручной merge / integrator merge — ошибка (`manual_merge_failed`)

- **Relay (Telegram / Max) не нужен:** оператор и так видит ошибку в UI при действии в админке.
- **Нужно только in-app:** всплывающее уведомление в самой админке (toast / тот же паттерн, что уже принят в проекте для админских действий).
- **Не** добавлять тему `manual_merge_failed` в `admin_incident_alert_config.topics` и не планировать под неё relay.

### Purge частичный / отложенный внешний сбой (`user_purge_partial`, retry)

- Ручная / процедурная зона; критично **видимость в админке**, а не пинг в мессенджер по умолчанию.
- **Журнал:** запись в `admin_audit_log` (уже есть контур) + **уведомление на экране админа:**
  - **Мгновенный** сбой (оператор ещё в контексте запроса) — **всплывающее** (toast), как при merge.
  - **Отложенное** падение (post-commit S3 / integrator) — **не toast**, а заметка на **экране «сегодня»** админа (или эквивалент «дашборд дня» / баннер открытых проблем), чтобы не потерять при уходе со страницы.
- **Не** включать в `admin_incident_alert_config`; реализуется отдельной задачей ([`followup-inapp-merge-purge`](#followup-inapp-merge-purge) в todos).

### Integration data quality ([`recordDataQualityIncidentAndMaybeTelegram`](apps/integrator/src/infra/db/dataQualityIncidentAlert.ts))

- **Критичные** инциденты нормализации интеграций.
- **Без переключателей в настройках:** поведение **всегда включено** (как сейчас: уведомление админу при первом открытии инцидента).
- **Не** входит в `admin_incident_alert_config`; не смешивать с темами relay идентичности.

## Ключ настроек и форма JSON

- Ключ **`admin_incident_alert_config`**, scope `admin`, в [`ALLOWED_KEYS`](apps/webapp/src/modules/system-settings/types.ts), зеркало [`integrator.system_settings`](.cursor/rules/system-settings-integrator-mirror.mdc).
- Структура `value` (в колонке как у других ключей — объект с полем `value`, согласовано с `updateSetting`):

```json
{
  "topics": { "...": true },
  "channels": { "telegram": true, "max": true }
}
```

- **Только v1-топики** в схеме PATCH и в UI (см. таблицу ниже). Никаких `manual_merge_failed` / `user_purge_partial` / `integration_data_quality` в этом JSON.
- **Парсер:** неизвестные ключи внутри `topics` игнорировать (forward compatibility); отсутствующие ключи трактовать как **default true** для известных v1-топиков; битый JSON целиком → весь конфиг = дефолт v1.
- **Пустые получатели:** если выбран канал, но соответствующий список `admin_*_ids` пуст — не слать, один debug/info лог (`admin_incident_alert_skipped_no_recipients`), без throw.

## Политики доставки и безопасность (relay)

- **Текст алерта:** только операционные поля (`action`, `topic`, `reason`/`classifiedReason`, укороченный `mergeMessage`, `channelCode`, `externalId` мессенджера, UUID кандидатов, `correlationId` при необходимости). **Не** включать: полный телефон, `link_` токены, initData, OAuth секреты, сырой payload integrator-события целиком (для preview — жёсткий лимит символов, как в аудите).
- **Идемпотентность relay:** стабильный `messageId` вида `admin-incident:{topic}:{dedupKey}:{channel}:{recipient}` где `dedupKey` = `conflict_key` или sha256 отсортированных id / `(channelCode,externalId)` для channel-link без merge-кандидатов — чтобы повторная доставка не плодила дубликаты в outbox.
- **Повторы по той же открытой конфликтной строке:** для `upsertOpenConflictLog` и integrator phone-bind — relay **только** при первом открытии (`insertedFirst` / аналог в integrator), не при `repeat_count++`.
- **Ошибки relay:** best-effort; structured warn `admin_incident_relay_failed` с `topic`, `channel`, `recipient` (без секретов), не ломать основной запрос.

## Каталог классов (`topics`) в `admin_incident_alert_config`

### Единственный набор (v1): переключатели в UI + проводка в коде

| Ключ topic                     | Смысл                                                                                                                                                                                                                                              | Источник в коде                                  |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `channel_link`                 | Конфликт привязки канала / сбой автомержа в [`channelLink.ts`](apps/webapp/src/modules/auth/channelLink.ts) (в т.ч. после [`reportChannelLinkBindingConflict`](apps/webapp/src/modules/auth/channelLink.ts))                                       | webapp                                           |
| `auto_merge_conflict`          | Новая открытая строка `auto_merge_conflict` (после [`upsertOpenConflictLog`](apps/webapp/src/infra/adminAuditLog.ts), только `insertedFirst`)                                                                                                      | webapp (+ integrator events через тот же upsert) |
| `auto_merge_conflict_anomaly`  | Пустые `candidateIds` в projection merge — [`writeAuditLog` `auto_merge_conflict_anomaly`](apps/webapp/src/app/api/integrator/events/route.ts)                                                                                                     | webapp                                           |
| `messenger_phone_bind_blocked` | Блокировка bind: integrator [`recordMessengerPhoneBindBlocked`](apps/integrator/src/infra/db/repos/messengerPhoneBindAudit.ts) **и** webapp [`messengerPhoneHttpBindExecute`](apps/webapp/src/modules/integrator/messengerPhoneHttpBindExecute.ts) | integrator + webapp                              |
| `messenger_phone_bind_anomaly` | Строка `messenger_phone_bind_anomaly` в integrator audit                                                                                                                                                                                           | integrator                                       |

### Не смешивать в этом ключе

- **Operator health / probes / backup** — отдельный контур ([`docs/OPERATOR_HEALTH_ALERTING_INITIATIVE/`](docs/OPERATOR_HEALTH_ALERTING_INITIATIVE/MVP_IMPLEMENTATION_PLAN.md)); в UI текстом развести блоки «Инциденты идентичности (внешняя доставка)» vs «Здоровье интеграций».
- **Integration data quality** — всегда включено, без этого ключа (см. выше).
- **Merge fail / purge partial** — только in-app + аудит (см. выше), не `topics` relay.

## Реализация по слоям

### Webapp

- Модули: [`apps/webapp/src/modules/admin-incidents/adminIncidentAlertConfig.ts`](apps/webapp/src/modules/admin-incidents/adminIncidentAlertConfig.ts), [`sendAdminIncidentAlerts.ts`](apps/webapp/src/modules/admin-incidents/sendAdminIncidentAlerts.ts) (или соседний путь в `modules/`).
- `upsertOpenConflictLog`: возврат `{ insertedFirst: boolean }`; после COMMIT при `insertedFirst && topics.auto_merge_conflict` — send relay.
- `channelLink`: единая точка через `setChannelLinkBindingConflictReporter` в bootstrap **или** явные вызовы; дедуп по `dedupKey` как выше.
- **Webapp phone bind:** после успешного `writeAuditLog` для blocked — вызов send с **той же политикой дедупа**, что integrator (идемпотентный `messageId` по `conflict_key` **или** рефактор: общая функция «audit first open + notify», чтобы не было двойного пинга с integrator для одной и той же ошибки на разных путях).

### Integrator

- Чтение `public.system_settings` для `admin_incident_alert_config` и `admin_max_ids` / `admin_telegram_ids` (сырой JSON list parse, минимальный дубль логики с webapp или shared doc contract).
- `messenger_phone_bind_blocked` / `anomaly`: уважать `topics` и `channels`; Max — `sendMaxMessage`; Telegram — предпочтительно **тот же** механизм, что [`recordDataQualityIncidentAndMaybeTelegram`](apps/integrator/src/infra/db/dataQualityIncidentAlert.ts) (`dispatchPort`), а не прямой `fetch`, для единообразия с доставкой в чаты.
- **Не** менять политику «всегда включено» для `recordDataQualityIncidentAndMaybeTelegram` ради этого ключа.

### Admin UI

- Одна карточка «Инциденты идентичности (Telegram / Max)»: секция **Каналы** (TG / Max), секция **Темы** — только строки таблицы v1 выше (без «Дополнительно» для merge/purge/data-quality).
- Сохранение: `patchAdminSetting("admin_incident_alert_config", { value: … })`; компактные подписи ([`.cursor/rules/ui-copy-no-excess-labels.mdc`](.cursor/rules/ui-copy-no-excess-labels.mdc)).

### API

- [`apps/webapp/src/app/api/admin/settings/route.ts`](apps/webapp/src/app/api/admin/settings/route.ts): Zod-схема — **только** известные v1 ключи в `topics` и два ключа в `channels`; strip unknown в `topics` или жёсткий отказ на лишние ключи — по выбору реализации.

### Тесты

- Парсер: default, частично заданные topics, мусорный JSON.
- `upsertOpenConflictLog`: insert vs update → `insertedFirst`.
- `channelLink.test.ts`: мок send / relay.
- Integrator: выключенный topic → нет dispatch/send; включённый max → мок `sendMaxMessage`.

### Документация

- [`docs/ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md`](docs/ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md): ключ + получатели + каналы; явное исключение data-quality и in-app-only сценариев.
- [`apps/webapp/src/modules/auth/auth.md`](apps/webapp/src/modules/auth/auth.md): channel-link relay и дедуп.
- Ссылка на PHASE_D для политики повторов.

## Definition of Done

- Ключ, миграция, зеркало, PATCH, UI с **только** v1-темами и каналами TG/Max.
- Relay при channel-link конфликте, при первом открытии `auto_merge_conflict`, при `auto_merge_conflict_anomaly`, при `messenger_phone_bind_*` (integrator + webapp bind) с учётом флагов и без дублирования при `repeat_count`.
- Нет утечки PII/секретов в тексте relay; relay failures залогированы.
- В плане зафиксированы отдельные дорожки: merge — toast в админке; purge — аудит + in-app (мгновенно / «сегодня»); data-quality — без настроек, всегда on.
- Тесты и `pnpm run ci` перед merge.

## followup-inapp-merge-purge

Отдельный трек после или параллельно relay-MVP: реализовать in-app уведомления по согласованным правилам выше (toast vs экран «сегодня»), переиспользовать существующие паттерны админки; не добавлять их в `admin_incident_alert_config`.

## Индекс реализации (факт закрытия)

| Область                          | Где в репозитории                                                                                                                                                      |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ключ, парсер, нормализация PATCH | `apps/webapp/src/modules/admin-incidents/adminIncidentAlertConfig.ts`                                                                                                  |
| Relay и дедуп                    | `apps/webapp/src/modules/admin-incidents/sendAdminIncidentAlerts.ts`                                                                                                   |
| UI                               | `apps/webapp/src/app/app/settings/AdminIncidentAlertsSection.tsx`                                                                                                      |
| PATCH                            | `apps/webapp/src/app/api/admin/settings/route.ts`                                                                                                                      |
| Integrator events, dedup anomaly | `apps/webapp/src/app/api/integrator/events/route.ts` (`integratorAutoMergeAnomalyDedupKey`)                                                                            |
| upsertOpenConflictLog            | `apps/webapp/src/infra/adminAuditLog.ts`                                                                                                                               |
| Channel-link                     | `apps/webapp/src/modules/auth/channelLink.ts`                                                                                                                          |
| Re-export conflict key           | `apps/webapp/src/app-layer/admin/auditLog.ts`                                                                                                                          |
| getConfigValue + object value    | `apps/webapp/src/modules/system-settings/configAdapter.ts`                                                                                                             |
| Integrator relay + DI            | `apps/integrator/src/infra/db/adminIncidentAlertRelay.ts`, `apps/integrator/src/app/di.ts`                                                                             |
| Phone bind audit                 | `apps/integrator/src/infra/db/repos/messengerPhoneBindAudit.ts`                                                                                                        |
| Миграции                         | `apps/webapp/db/drizzle-migrations/0064_admin_incident_alert_config.sql`, `apps/integrator/src/infra/db/migrations/core/20260515_0001_admin_incident_alert_config.sql` |

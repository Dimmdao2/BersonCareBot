# Массовые рассылки врача (`/app/doctor/broadcasts`)

Канонический маршрут: **`/app/doctor/broadcasts`**. Индивидуальный чат с пациентами — **`/app/doctor/messages`** (журнал массовых рассылок там не дублируется).

## Назначение

Форма **категории**, **сегмента аудитории**, **каналов** (`bot_message`, `sms`), текста; **предпросмотр** → **подтверждение** → одна транзакция webapp: **`broadcast_audit`** + пакетная вставка в **`public.outgoing_delivery_queue`** (`kind = doctor_broadcast_intent`). **Журнал** на той же странице.

## Код (webapp)

| Область | Путь |
|--------|------|
| Страница | `apps/webapp/src/app/app/doctor/broadcasts/page.tsx` |
| Server actions | `.../broadcasts/actions.ts` (`previewBroadcastAction`, `executeBroadcastAction`, `listBroadcastAuditAction`) |
| Доменный сервис | `apps/webapp/src/modules/doctor-broadcasts/service.ts` |
| Построение заданий очереди и правила каналов | `.../doctor-broadcasts/deliveryJobs.ts`, `broadcastEligible.ts` |
| Типы и константы | `.../doctor-broadcasts/ports.ts`, `deliveryQueueKind.ts` (`BROADCAST_RECIPIENT_PREVIEW_NAME_CAP` = 20) |
| Оценка аудитории / dev_mode | `.../doctor-broadcasts/broadcastAudienceMetrics.ts` |
| DI | `apps/webapp/src/app-layer/di/buildAppDeps.ts` (`doctorBroadcasts`, `doctorBroadcastDeliveryCommitPort`) |
| Аудит в БД | `apps/webapp/src/infra/repos/pgBroadcastAudit.ts` → **`broadcast_audit`** |
| Транзакция аудит + очередь | `apps/webapp/src/infra/repos/pgDoctorBroadcastDelivery.ts` |

## Преференсы каналов и изолированные аудитории

- Источник: **`public.user_channel_preferences.is_enabled_for_notifications`** для кодов **`telegram`**, **`max`**, **`sms`**. Если строки в БД для канала **нет**, рассылка трактует уведомления как **включённые** (как синтетический default в `getPreferences`).
- **Общий** фильтр (`all`, `active_clients`, `with_upcoming_appointment`, …): при «сообщение в боте» задачи Telegram/MAX ставятся только при привязке **и** включённых уведомлениях этого канала. При включённом **SMS** — только при включённом SMS-pref и валидном E.164 номере (`normalizePhone` + `isValidPhoneE164`).
- **`with_telegram`**: только очередные задачи **Telegram**, настройки уведомлений **игнорируются**; MAX этой рассылкой не трогается даже если привязан.
- **`with_max`**: только **MAX** по симметричным правилам.
- **`sms_only`**: при выбранном канале SMS — доставка по номеру **без** проверки SMS-prefs (изоляция как для узкого канала).

Пер-топик настройки (`user_notification_topic_channels`) в рассылках врача **не** используются.

После успешной привязки `telegram`, `max` или `sms` webapp выполняет **upsert** prefs с `is_enabled_for_messages/notifications = true`, чтобы канал явно включён для рассылок (повторное подключение снова включает prefs).

## Политика перед отправкой (preview)

Ответ **`BroadcastPreviewResult`** содержит **`deliveryPolicyKind`** и **`deliveryPolicyDescriptionRu`** — короткая подпись с выбранной политикой доставки (шаг подтверждения в форме).

## Предпросмотр: число получателей и список имён

- Размер сегмента считается по тем же фильтрам, что и список клиентов врача: **`DoctorClientsPort.listClients`** (см. `listClientsForBroadcastAudience`).
- После этого применяется **`resolveBroadcastEffectiveClients`** (ниже про `dev_mode`), затем batch чтение prefs (**`channelPreferencesPort.getBroadcastNotificationFlagsBatch`**) и отбор клиентов, которым действительно уйдёт **хотя бы одно** очередное задание (**`filterEligibleBroadcastClients`**).
- В **`BroadcastPreviewResult`** возвращаются:
  - **`audienceSize`** — число **таких** клиентов (eligible после dev_mode и prefs/isolate-сегментов);
  - при сужении dev_mode у мессенджера — **`segmentSize`** (размер множества до пересечения с тестовыми аккаунтами, как и раньше);
  - **`recipientsPreview`** по тем же eligible-клиентам: `names` (до **`BROADCAST_RECIPIENT_PREVIEW_NAME_CAP`**), `total`, `truncated`.
- **`execute`** строит **`outgoing_delivery_queue`** через **`buildDoctorBroadcastDeliveryJobs`** по списку **`eligibleClients`** (тот же, что счётчик **`audienceSize`** и список имён в превью); задачи добавляются с тем же правилом каналов/prefs/isolate, что при фильтрации превью.
  - **`delivery_jobs_total`** может быть **>** `audience_size`, если одному клиенту уходят и мессенджер, и SMS (или несколько разрешённых мессенджеров при общих prefs).
- Для сегментов **`inactive`** и **`sms_only`** фильтр в порту пока **не полный** (фактически «все клиенты», см. `isAudienceEstimateApproximate` в `broadcasts/labels.ts`). Чтобы не вводить в заблуждение, **список имён в UI не показывается** (остаётся предупреждение о грубой оценке числа).

## `dev_mode` и `test_account_identifiers`

При **`dev_mode` = true** (admin `system_settings`) расчёт доставки в мессенджер для канала «сообщение в боте» **пересекает** сегмент с **`test_account_identifiers.telegramIds` / `maxIds`** — ту же семантику, что guard исходящего relay: `systemSettingsService.shouldDispatchRelayToRecipient` (см. **`apps/webapp/INTEGRATOR_CONTRACT.md`**, раздел *dev_mode guard*).

- Только **SMS** при включённом `dev_mode`: relay-guard для SMS в текущем контракте не покрывает телефон как `recipient` → в превью **доставка 0** для этого сценария; **в очередь SMS-задачи не ставятся** (согласовано с превью тем же резолвером аудитории).
- Каналы «скоро» (`push`, `home_banner`, …) в форме не активны; при попадании в расчёт без `bot_message`/`sms` **пересечение dev_mode не применяется** (список = весь сегмент).

Снимок настроек для превью: **`getRelayDevContext`** в `apps/webapp/src/modules/system-settings/service.ts`.

## `preview` и `execute`

Оба пути используют один резолвер аудитории в DI — **`resolveBroadcastAudience`**: он собирает сегмент, применяет **`resolveBroadcastEffectiveClients`** (relay `dev_mode`), batch prefs, считает **`eligibleClients`** и поля превью (число/имена и подпись политики).

- **`effectiveClients`** — множество после **`dev_mode`** для мессенджеров (до отбора по prefs/isolate).
- **`eligibleClients`** — те, кому возможна ≥ одна задача после prefs/isolate; **`execute`** ставит задачи **только** по этому списку (**`audience_size`** в аудите = его длина).

**`execute`** (сервис `doctor-broadcasts`):

1. Собирает текст сообщения (заголовок + тело, с усечением по лимиту в `deliveryJobs.ts`).
2. Генерирует `auditId`, строит плоский список заданий (`buildDoctorBroadcastDeliveryJobs`) с `event_id` и `payload_json` (`intent` + `broadcastAuditId` + `clientUserId` + флаг **`attachMenu`** при включённой опции меню).
3. Ограничение **`MAX_BROADCAST_DELIVERY_JOBS`** — при превышении ошибка до транзакции.
4. **`commitAuditAndDeliveryQueue`**: `INSERT broadcast_audit` (в т.ч. `message_body`, `delivery_jobs_total`, **`attach_menu_after_send`**) + для каждой строки очереди — `INSERT … ON CONFLICT (event_id) DO NOTHING` в `outgoing_delivery_queue`; если вставка строки не произошла (`rowCount ≠ 1`, дубликат `event_id` или иной сбой) — **откат всей транзакции** (в т.ч. запись `broadcast_audit` не фиксируется).

### Меню в чате (опция формы)

Переключатель **«Прикрепить / обновить меню»** (по умолчанию выкл., действует только если выбран канал «сообщение в боте»): в аудит пишется **`broadcast_audit.attach_menu_after_send`**, в каждую строку очереди — **`payload_json.attachMenu`**. Воркер integrator (`doctorBroadcastIntentMenu`) перед **`dispatchOutgoing`** обогащает `message.send` той же разметкой, что и обычная доставка в **`delivery.ts`** (reply keyboard в Telegram при **`sendMenuOnButtonPress`** и привязанном телефоне; для MAX — inline `menus.main` при `linkedPhone` и числовом `chatId`, как в доменном обработчике). Глобальные команды меню BotFather / MAX setup из воркера **не** вызываются. SMS-задания не получают клавиатуру.

Массовая доставка **не** идёт через HTTP **`relay-outbound`**: воркер integrator в штатном цикле **`runOutgoingDeliveryWorkerTick`** вызывает **`dispatchOutgoing`** по строкам с `kind = doctor_broadcast_intent` (см. `apps/integrator/src/infra/runtime/worker/outgoingDeliveryWorker.ts`).

### Семантика счётчиков в `broadcast_audit`

| Колонка | Смысл |
|--------|--------|
| `audience_size` | Число клиентов, которым уйдёт хотя бы одна строка очереди (eligible: dev_mode → prefs/isolate-сегмент). |
| `delivery_jobs_total` | Число строк очереди для этой рассылки; **0** — запись до внедрения очереди (legacy). |
| `sent_count` / `error_count` | Инкременты воркера по **завершённым** заданиям очереди (успех / `dead`). |
| `attach_menu_after_send` | Запрошено ли прикрепление главного меню к исходящим в мессенджер для этой рассылки. |

## Наблюдаемость

- **Журнал врача** (`BroadcastAuditLog`): человекочитаемые заголовки колонок, раскрытие строки — начало текста, подсказка при незавершённой доставке.
- **Админка «Здоровье системы»**: блок очереди доставки; агрегаты **`dueByKind`** / **`deadByKind`** с подписями «Напоминания пациентам», «Рассылки от специалистов», «Служебные оповещения», «Прочее».
- **Логи integrator** (`doctor_broadcast_delivery.sent` / `.dead`; при планируемом ретрае — **debug** `doctor_broadcast_delivery.dispatch_will_retry` с усечённым `error`, без сырого объекта исключения): `broadcastAuditId`, `eventId`, `channel`, исход, **маскированный** получатель (без полного текста рассылки).

## Связанные документы

- Кабинет специалиста (продуктовый смысл раздела «Рассылки»): [`SPECIALIST_CABINET_STRUCTURE.md`](SPECIALIST_CABINET_STRUCTURE.md) §9.
- Guard relay: [`apps/webapp/INTEGRATOR_CONTRACT.md`](../../apps/webapp/INTEGRATOR_CONTRACT.md) (Flow 6, dev_mode).
- Режимы и тестовые аккаунты: [`APP_RESTRUCTURE_INITIATIVE/done/MODES_AND_TEST_ACCOUNTS_EXECUTION_AUDIT.md`](../APP_RESTRUCTURE_INITIATIVE/done/MODES_AND_TEST_ACCOUNTS_EXECUTION_AUDIT.md).

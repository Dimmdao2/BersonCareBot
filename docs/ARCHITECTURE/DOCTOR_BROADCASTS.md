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
| Построение заданий очереди | `.../doctor-broadcasts/deliveryJobs.ts` |
| Типы и константы | `.../doctor-broadcasts/ports.ts`, `deliveryQueueKind.ts` (`BROADCAST_RECIPIENT_PREVIEW_NAME_CAP` = 20) |
| Оценка аудитории / dev_mode | `.../doctor-broadcasts/broadcastAudienceMetrics.ts` |
| DI | `apps/webapp/src/app-layer/di/buildAppDeps.ts` (`doctorBroadcasts`, `doctorBroadcastDeliveryCommitPort`) |
| Аудит в БД | `apps/webapp/src/infra/repos/pgBroadcastAudit.ts` → **`broadcast_audit`** |
| Транзакция аудит + очередь | `apps/webapp/src/infra/repos/pgDoctorBroadcastDelivery.ts` |

## Предпросмотр: число получателей и список имён

- Размер сегмента считается по тем же фильтрам, что и список клиентов врача: **`DoctorClientsPort.listClients`** (см. `listClientsForBroadcastAudience`).
- В **`BroadcastPreviewResult`** возвращаются:
  - **`audienceSize`** — ожидаемая **доставка** с учётом релевантных ограничений (ниже про `dev_mode`);
  - при сужении dev_mode — **`segmentSize`** (размер сегмента до пересечения с тестовыми аккаунтами);
  - **`recipientsPreview`**: `names` (до **`BROADCAST_RECIPIENT_PREVIEW_NAME_CAP`** имён, сортировка по `displayName`, `ru`), `total`, `truncated`.
- Для сегментов **`inactive`** и **`sms_only`** фильтр в порту пока **не полный** (фактически «все клиенты», см. `isAudienceEstimateApproximate` в `broadcasts/labels.ts`). Чтобы не вводить в заблуждение, **список имён в UI не показывается** (остаётся предупреждение о грубой оценке числа).

## `dev_mode` и `test_account_identifiers`

При **`dev_mode` = true** (admin `system_settings`) расчёт доставки в мессенджер для канала «сообщение в боте» **пересекает** сегмент с **`test_account_identifiers.telegramIds` / `maxIds`** — ту же семантику, что guard исходящего relay: `systemSettingsService.shouldDispatchRelayToRecipient` (см. **`apps/webapp/INTEGRATOR_CONTRACT.md`**, раздел *dev_mode guard*).

- Только **SMS** при включённом `dev_mode`: relay-guard для SMS в текущем контракте не покрывает телефон как `recipient` → в превью **доставка 0** для этого сценария; **в очередь SMS-задачи не ставятся** (тот же список `effectiveClients`, что в превью).
- Каналы «скоро» (`push`, `home_banner`, …) в форме не активны; при попадании в расчёт без `bot_message`/`sms` **пересечение dev_mode не применяется** (список = весь сегмент).

Снимок настроек для превью: **`getRelayDevContext`** в `apps/webapp/src/modules/system-settings/service.ts`.

## `preview` и `execute`

Оба пути используют один резолвер аудитории в DI — **`resolveBroadcastAudience`** возвращает в том числе **`effectiveClients`**: тот же набор, что даёт превью (имена/число), и именно он идёт в постановку заданий в **`outgoing_delivery_queue`**.

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
| `audience_size` | Число клиентов в эффективной выборке (когорта + dev_mode). |
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

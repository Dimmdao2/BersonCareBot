# Массовые рассылки врача (`/app/doctor/broadcasts`)

Канонический маршрут: **`/app/doctor/broadcasts`**. Индивидуальный чат с пациентами — **`/app/doctor/messages`** (журнал массовых рассылок там не дублируется).

## Назначение

Форма **категории**, **сегмента аудитории**, **каналов** (`bot_message`, `sms`), текста; **предпросмотр** → **подтверждение** → запись в **`broadcast_audit`** и отображение **журнала** на той же странице.

## Код (webapp)

| Область | Путь |
|--------|------|
| Страница | `apps/webapp/src/app/app/doctor/broadcasts/page.tsx` |
| Server actions | `.../broadcasts/actions.ts` (`previewBroadcastAction`, `executeBroadcastAction`, `listBroadcastAuditAction`) |
| Доменный сервис | `apps/webapp/src/modules/doctor-broadcasts/service.ts` |
| Типы и константы | `.../doctor-broadcasts/ports.ts` (`BroadcastPreviewResult`, **`BROADCAST_RECIPIENT_PREVIEW_NAME_CAP`** = 20) |
| Оценка аудитории / dev_mode | `.../doctor-broadcasts/broadcastAudienceMetrics.ts` |
| DI | `apps/webapp/src/app-layer/di/buildAppDeps.ts` (`doctorBroadcasts`) |
| Аудит в БД | `apps/webapp/src/infra/repos/pgBroadcastAudit.ts` → таблица **`broadcast_audit`** |

## Предпросмотр: число получателей и список имён

- Размер сегмента считается по тем же фильтрам, что и список клиентов врача: **`DoctorClientsPort.listClients`** (см. `listClientsForBroadcastAudience`).
- В **`BroadcastPreviewResult`** возвращаются:
  - **`audienceSize`** — ожидаемая **доставка** с учётом релевантных ограничений (ниже про `dev_mode`);
  - при сужении dev_mode — **`segmentSize`** (размер сегмента до пересечения с тестовыми аккаунтами);
  - **`recipientsPreview`**: `names` (до **`BROADCAST_RECIPIENT_PREVIEW_NAME_CAP`** имён, сортировка по `displayName`, `ru`), `total`, `truncated`.
- Для сегментов **`inactive`** и **`sms_only`** фильтр в порту пока **не полный** (фактически «все клиенты», см. `isAudienceEstimateApproximate` в `broadcasts/labels.ts`). Чтобы не вводить в заблуждение, **список имён в UI не показывается** (остаётся предупреждение о грубой оценке числа).

## `dev_mode` и `test_account_identifiers`

При **`dev_mode` = true** (admin `system_settings`) расчёт доставки в мессенджер для канала «сообщение в боте» **пересекает** сегмент с **`test_account_identifiers.telegramIds` / `maxIds`** — ту же семантику, что guard исходящего relay: `systemSettingsService.shouldDispatchRelayToRecipient` (см. **`apps/webapp/INTEGRATOR_CONTRACT.md`**, раздел *dev_mode guard*).

- Только **SMS** при включённом `dev_mode`: relay-guard для SMS в текущем контракте не покрывает телефон как `recipient` → в превью **доставка 0** для этого сценария.
- Каналы «скоро» (`push`, `home_banner`, …) в форме не активны; при попадании в расчёт без `bot_message`/`sms` **пересечение dev_mode не применяется** (список = весь сегмент).

Снимок настроек для превью: **`getRelayDevContext`** в `apps/webapp/src/modules/system-settings/service.ts`.

## `preview` и `execute`

Оба пути вызывают один и тот же резолвер аудитории в DI — **число в подтверждении и число в аудите совпадают**.

Модуль **`doctor-broadcasts.execute`** по смыслу **не выполняет массовую отправку** по каналам: только пишет **`broadcast_audit`** (`sent_count` / `error_count` на старте 0). Реальная доставка массовым контуром — **отдельный долг** (см. `docs/BACKLOG_TAILS.md`, блок про `broadcast_audit`).

## Связанные документы

- Кабинет специалиста (продуктовый смысл раздела «Рассылки»): [`SPECIALIST_CABINET_STRUCTURE.md`](SPECIALIST_CABINET_STRUCTURE.md) §9.
- Guard relay: [`apps/webapp/INTEGRATOR_CONTRACT.md`](../../apps/webapp/INTEGRATOR_CONTRACT.md) (Flow 6, dev_mode).
- Режимы и тестовые аккаунты: [`APP_RESTRUCTURE_INITIATIVE/done/MODES_AND_TEST_ACCOUNTS_EXECUTION_AUDIT.md`](../APP_RESTRUCTURE_INITIATIVE/done/MODES_AND_TEST_ACCOUNTS_EXECUTION_AUDIT.md).

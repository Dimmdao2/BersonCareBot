# E2 — отписка от темы рассылки, 2026-08-22

## Перепись до изменения

Искал сначала через индекс, затем точными строками в найденных файлах:

```bash
node /home/dev/brain/tools/code-search.mjs "отписка тема рассылки unsubscribe subscription notification" --repo bcb -k 20
node /home/dev/brain/tools/code-search.mjs "email newsletter notification send topic preferences" --repo bcb -k 20
node /home/dev/brain/tools/code-search.mjs "bot message broadcast notification topic delivery" --repo bcb -k 20
node /home/dev/brain/tools/code-search.mjs "doctor_broadcast_intent payload bot email outgoing delivery render" --repo bcb -k 20
node /home/dev/brain/tools/code-search.mjs "signed token HMAC public route no session email enumeration" --repo bcb -k 20
node /home/dev/brain/tools/code-search.mjs "service transactional messages email login code appointment reminder doctor reply bot send" --repo bcb -k 20
rg -n "listUnsubscribe|unsubscribe|Отписаться|doctor_broadcast_intent|BroadcastCategory" apps/webapp apps/integrator docs
```

Темы рассылок заданы `BroadcastCategory` в `modules/doctor-broadcasts/ports.ts`, а master mapping — в
`patient-notifications/notificationTopicCodes.ts`:

| Категория рассылки | Master-тема |
| --- | --- |
| `service` | `important_broadcasts` |
| `organizational` | `important_broadcasts` |
| `important_notice` | `important_broadcasts` |
| `marketing` | `patient_news` |
| `schedule_change` | `patient_news` |
| `reminder` | `patient_news` |
| `education` | `patient_news` |
| `survey` | `patient_news` |

Путь рассылки: `DoctorBroadcastsService` → `buildDoctorBroadcastDeliveryJobs` →
`outgoing_delivery_queue(kind=doctor_broadcast_intent)` → integrator `outgoingDeliveryWorker` → Telegram/MAX;
email идёт из того же сервиса через `fanOutBroadcastEmail` → `relayOutbound` → integrator. До E2 master-тема
участвовала в Web Push, но не являлась общим gate для bot/email; topic-unsubscribe для рассылки отсутствовал.
Единственная найденная unsubscribe-метка была `mailto` в транзакционном `notifyPatientDoctorReply` — это
противоречило закрытой развилке и удалено.

Отдельные служебные пути: auth email OTP (`emailOtpDeliveryQueuePort` и auth routes), напоминания о приёме
(`modules/reminders` и `reminders.dispatchDue`), ответ врача (`notifyPatientDoctorReply`) и ответы на действия
пациента. Они однозначно транзакционные, не входят в `doctor-broadcasts` и CTA не получили. Неоднозначных
сообщений по результатам переписи не найдено. Категория `service` внутри `doctor-broadcasts` отдельно проверена:
это создаваемая врачом массовая рассылка, уже сопоставленная `important_broadcasts`, а не транзакционное
служебное сообщение; поэтому она остаётся в контуре E2.

## Реализация

- Один общий gate в `DoctorBroadcastsService` читает `user_notification_topics` batch-методом и формирует одно
  eligible-множество для preview, queue, Push и email. Схема и defaults не менялись.
- Telegram/MAX payload и каждое broadcast email содержат URL-кнопку «Отписаться от темы». SMS не имеет кнопок.
- `topicUnsubscribe.ts` подписывает HMAC-SHA256 payload `{ userId, topicCode, nonce=auditId }` существующим
  `SESSION_COOKIE_SECRET`. Причина выбора: ссылка работает без сессии и не позволяет заменить адресата или тему;
  audit nonce делает маркер отдельным для конкретной отправки без новой таблицы. Повторный переход безопасен,
  потому что операция `set enabled=false` идемпотентна.
- Публичный маршрут не различает валидный, повторный, неизвестный или повреждённый токен в статусе и тексте,
  поэтому не восстанавливает oracle существования адресата.
- Сверху вкладки рассылок использован существующий `DoctorPageHeader.info` и существующая button variant для
  ссылки на `#clinic-delivery-channels`; новый UI-примитив не создан.
- Служебный `notifyPatientDoctorReply` не содержит bot keyboard, HTML CTA или List-Unsubscribe.

## Поведенческие доказательства

```bash
pnpm --dir apps/webapp exec vitest --run src/modules/patient-notifications/topicUnsubscribe.acceptance.test.ts src/modules/doctor-broadcasts/service.topicUnsubscribe.acceptance.test.ts src/modules/doctor-broadcasts/deliveryJobs.unit.test.ts src/modules/doctor-broadcasts/service.mechanicWriteClearance.test.ts src/modules/messaging/notifyPatientDoctorReply.noUnsubscribe.acceptance.test.ts src/app/api/public/notifications/unsubscribe/route.route.test.ts src/app/app/doctor/communications/DoctorCommunicationsShell.broadcastSettings.ui.test.tsx
# PASS: 7 files, 11 tests
```

Проверено: отписка выключает только подписанную тему; соседняя тема остаётся включённой; повтор безопасен;
подмена payload/signature не пишет; ответ public route не создаёт existence oracle; отписанный адресат отсутствует
в preview, bot queue и email fan-out; CTA есть в bot/email; служебный ответ CTA не получает; shortcut находится
в header вкладки рассылок.

Контрфакт выполнен вручную: в `service.ts` временно заменён master-filter
`row?.isEnabled !== false` на `true`, затем запущено:

```bash
pnpm --dir apps/webapp exec vitest --run src/modules/doctor-broadcasts/service.topicUnsubscribe.acceptance.test.ts
# EXPECTED FAIL: preview.audienceSize received 2 instead of 1; exit 1
```

После восстановления фильтра та же команда дала `PASS: 1 file, 1 test`.

```bash
pnpm --dir apps/webapp run typecheck
# PASS, exit 0

pnpm --dir apps/webapp run lint
# PASS, exit 0; 2 существующих warning в незатронутом AppointmentPaymentSection.tsx, 0 errors

git diff --check
# PASS, exit 0
```

## Границы

Схема подписок, defaults и интегратор не переделывались. TEST/PROD, deploy, push и full CI не запускались.

Telegram protocol принимает один `reply_markup` на сообщение. Поэтому обязательная inline-кнопка E2 имеет
приоритет над прежней optional reply-клавиатурой `attachMenu` на том же broadcast-message: существующий
integrator worker уже не заменяет присутствующий `replyMarkup`. Отдельное второе сообщение ради меню не
добавлялось, поскольку это изменило бы продуктовый поток за границами E2. MAX auto-menu в этом worker и до E2
был отключён; email не имеет этого конфликта.

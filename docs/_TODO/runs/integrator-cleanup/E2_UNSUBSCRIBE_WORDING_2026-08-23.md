# E2 — название темы в отписке, 2026-08-23

## Итог

Человек видит конкретную тему и в CTA, и после перехода по подписанной ссылке.

- Источник названия — существующая настройка `system_settings.notifications_topics` (с org-first fallback), та же, из которой строится экран пациента `/app/patient/notifications/settings`.
- Для показа используется существующая `patientNotificationTopicDisplayTitle`; второго списка названий не создано.
- Две master-темы E2 имеют человеческие названия: `patient_news` → «Новости и уведомления», `important_broadcasts` → «Важные рассылки». Тем без названия среди тем рассылок врача не найдено.
- CTA в Telegram/MAX и HTML/текстовом email: «Отписаться от „<название темы>“».
- Подписанный HMAC-маркер теперь несёт title на момент отправки. Подтверждение на публичном экране называет эту тему, сообщает, что остальные уведомления продолжат приходить, и ведёт в настройки уведомлений для изменения других тем.

Механика не менялась: запись остаётся ровно `setTopicEnabled(userId, topicCode, false)`, повторный переход идемпотентен. Для существующих ранее подписанных ссылок без title сохранён fallback к существующей patient-facing подписи. Статус/тело для существующего и отсутствующего адресата с одним валидным маркером совпадают; существование адреса не раскрывается. Кнопка «отписаться от всего» не добавлялась.

## Поведенческое доказательство

```bash
pnpm --dir apps/webapp exec vitest --run src/modules/patient-notifications/topicUnsubscribe.acceptance.test.ts src/modules/doctor-broadcasts/service.topicUnsubscribe.acceptance.test.ts src/app/api/public/notifications/unsubscribe/route.route.test.ts
# PASS: 3 files, 9 tests
```

Проверено для двух разных тем: bot-CTA и email содержат именно её название; подтверждение из подписанного маркера показывает то же название, фразу «Остальные уведомления продолжат приходить» и путь `/app/patient/notifications/settings`.

Контрфакт выполнен вручную: в `apps/webapp/src/modules/doctor-broadcasts/service.ts` временно заменён аргумент `getTopicDisplayTitle(topicCode, ...)` на `getTopicDisplayTitle('patient_news', ...)`, затем запущено:

```bash
pnpm --dir apps/webapp exec vitest --run src/modules/doctor-broadcasts/service.topicUnsubscribe.acceptance.test.ts
# EXPECTED FAIL: important_notice получил «Новости и уведомления» вместо «Важные рассылки»; 1 failed, 1 passed
```

После восстановления production-кода первый прогон снова зелёный.

```bash
pnpm --dir apps/webapp run typecheck
# PASS, exit 0

pnpm --dir apps/webapp run lint
# PASS, exit 0

git diff --check
# PASS, exit 0
```

## Границы

TEST/PROD, deploy, push и full CI не запускались.

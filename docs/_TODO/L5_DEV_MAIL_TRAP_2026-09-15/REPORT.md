# Л5 — почтовый канал DEV = ловушка Mailpit

Дата: 2026-09-15. Ветка: `wt/dev-mail-trap`.

## Итог

На `NODE_ENV=development` центральный гейт интегратора теперь пропускает до адаптера только `email`.
Единственная проверка фактически выбранного SMTP-хоста находится в
`apps/integrator/src/integrations/email/deliveryAdapter.ts`: `127.0.0.1`, `::1` и `localhost`
разрешены, любой другой хост возвращает ожидаемое подавление
`development_non_loopback_smtp_host` до `sendMail`. Telegram, MAX, SMS и Web Push по-прежнему
подавляются общим гейтом до адаптеров.

Ветка production не менялась: условие `if (!isTestDeployment()) return intent;` и исходный intent
оставлены без изменений.

## DEV-профили до изменения

Пароли не читались и не печатались. Выполнена команда:

```bash
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -v ON_ERROR_STOP=1 -P pager=off -c "SELECT key, value_json #>> '{value,host}' AS host, value_json #>> '{value,port}' AS port, value_json #>> '{value,from}' AS sender FROM public.system_settings WHERE scope = 'admin' AND organization_id IS NULL AND key IN ('therapysto_smtp_outbound','therapygo_smtp_outbound') ORDER BY key;"
```

Результат: `(0 rows)` — оба новых платформенных профиля на DEV отсутствовали.

Дополнительный замер существующих SMTP-ключей:

```bash
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -v ON_ERROR_STOP=1 -P pager=off -c "SELECT key, value_json #>> '{value,host}' AS host, value_json #>> '{value,port}' AS port, value_json #>> '{value,from}' AS sender FROM public.system_settings WHERE key LIKE '%smtp_outbound%' ORDER BY key;"
```

Нашёлся один legacy-профиль: `smtp_outbound`, хост `mail.hosting.reg.ru`, порт `465`, отправитель
`no-reply@bersoncare.ru`. Это prod-похожая конфигурация в DEV-базе. Она не изменена: Л5 переводит
два новых audience-профиля, а новый гейт не позволит DEV обратиться к этому непетлевому хосту, если
он будет выбран старым путём.

## DEV-профили после изменения

Оба значения записаны атомарно через существующие
`createSystemSettingsService(createPgSystemSettingsPort(), { writeUnitOfWork:
createPgSystemSettingsWriteUnitOfWork() })` и platform principal. SMTP-пароли сгенерированы в
процессе и не печатались.

Проверка после записи:

```bash
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -v ON_ERROR_STOP=1 -P pager=off -c "SELECT key, value_json #>> '{value,host}' AS host, value_json #>> '{value,port}' AS port, value_json #>> '{value,secure}' AS secure, value_json #>> '{value,from}' AS sender FROM public.system_settings WHERE scope = 'admin' AND organization_id IS NULL AND key IN ('therapysto_smtp_outbound','therapygo_smtp_outbound') ORDER BY key;"
```

| key | host | port | secure | from |
| --- | --- | ---: | --- | --- |
| `therapysto_smtp_outbound` | `127.0.0.1` | 1025 | false | `dev-staff@therapysto.local` |
| `therapygo_smtp_outbound` | `127.0.0.1` | 1025 | false | `dev-patient@therapygo.local` |

TEST-настройки не читались и не изменялись.

## Почему петлевая проверка живёт в email adapter

`dispatchPort` знает только канал и среду, поэтому на DEV передаёт `email` дальше, но продолжает
подавлять остальные каналы. Только `EmailDeliveryAdapter` уже после разрешения clinic/platform
профиля знает фактически выбранный `smtpHost`; поэтому ровно там проверяется loopback и ровно там
путь останавливается перед сетевой границей `sendMail`.

Для очереди отдельная причина доходит через `DeliverySendResult.environmentSuppressionReason` и
сохраняется worker-ом в `last_error`; синхронный relay пишет ту же причину в журнал. Подавление не
вызывает callback подтверждённой provider-доставки.

## Поведенческий тест и инъекция

Один смысловой тест в `apps/integrator/src/shared/testDeliverySafety.test.ts` запускает реальный
`dispatchPort` и реальный `EmailDeliveryAdapter`, подменяя только разрешение SMTP-конфига и последнюю
сетевую границу. На DEV одно письмо доходит до `sendMail` при `127.0.0.1`, то же письмо подавляется
при `smtp.external.example`, а Telegram не доходит до адаптера при обоих SMTP-хостах.

Инъекция: тело `isLoopbackSmtpHost` временно заменено на `return host.length > 0;`, после чего:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/integrator exec vitest run src/shared/testDeliverySafety.test.ts"
```

Результат: exit 1, `1 failed | 7 passed`; упал именно тест
`on DEV sends email only through loopback SMTP and always suppresses telegram`: для внешнего SMTP
ожидалась причина подавления, фактически пришёл `{}`. Инъекция отменена.

Финальная проверка после восстановления:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/integrator exec vitest run src/shared/testDeliverySafety.test.ts src/infra/adapters/dispatchPort.test.ts src/integrations/email/deliveryAdapter.unit.test.ts src/infra/runtime/worker/outgoingDeliveryWorker.reminderGeneration.d21.test.ts"
```

Результат: `Test Files 4 passed (4)`, `Tests 52 passed (52)`.

Дополнительно:

```bash
pnpm --dir apps/integrator exec tsc --noEmit
pnpm --dir apps/integrator exec eslint src/infra/adapters/dispatchPort.ts src/infra/runtime/worker/outgoingDeliveryWorker.ts src/integrations/bersoncare/relayOutboundRoute.ts src/integrations/email/deliveryAdapter.ts src/integrations/email/mailer.ts src/kernel/contracts/ports.ts src/shared/testDeliverySafety.test.ts src/shared/testDeliverySafety.ts
```

Обе команды завершились с exit 0.

## Живое письмо в Mailpit

Использован уже работающий Next на `http://127.0.0.1:5200`; второй Next не запускался. После
штатного owner-входа выполнен реальный синхронный путь:

```bash
curl -sS -b /tmp/bcb-l5-platform-admin.cookies -H 'Content-Type: application/json' -H 'Origin: http://127.0.0.1:5200' --data-binary '{"to":"dimmdao@gmail.com"}' http://127.0.0.1:5200/api/admin/smtp-test
```

Ответ: HTTP 200,
`{"ok":true,"probeRef":"smtp-test:4178e904-c198-4e93-8011-2b23cd67ef78"}`. На время этой
проверки под общим host-lock был запущен только candidate integrator API на `127.0.0.1:4200`; он
остановлен в том же foreground-прогоне. Startup migration gate не обходился для deploy: это была
только живая проба `buildApp`, миграции не применялись.

Требуемая команда Mailpit:

```bash
curl -s 'http://127.0.0.1:8025/api/v1/messages?limit=5'
```

Первое письмо ответа:

- Mailpit ID: `0TQ70CStqV6XrP3YKNaOxI`;
- Message-ID: `bf1b4f83-2114-787a-de8c-26f781d36ddd@therapygo.local`;
- отправитель: `dev-patient@therapygo.local`;
- получатель: `dimmdao@gmail.com`;
- тема: `Тест SMTP — Therapysto`;
- создано: `2026-09-15T14:12:02.871+03:00`.

Integrator получил SMTP-ответ `250 2.0.0 Ok: queued as 0TQ70CStqV6XrP3YKNaOxI`.

Для штатного owner-входа перед живой пробой выполнен канонический DEV-only скрипт
`apps/webapp/scripts/ensure-nonprod-owner-account-passwords.mjs --execute
--confirm-test-owner-password-reset --database=dev`: `accountsUpdated=2`, `contactsRestored=0`,
`secretsPrinted=false`. TEST не затрагивался.

Во время поиска доступного живого маршрута `auth_surface_staff_email_enabled` временно менялся только
на DEV через тот же system-settings application port. Итоговое значение восстановлено в исходную
объектную форму и отдельно проверено командой
`SELECT key, value_json #>> '{value}' AS value ...`: `auth_surface_staff_email_enabled | false`.
После восстановления публичная дверь ожидаемо вернула HTTP 503
`{"ok":false,"error":"auth_channel_disabled"}`.

## Telegram и SMS на DEV молчат

Отдельная живая проба отправила два подписанных запроса в candidate integrator
`POST http://127.0.0.1:4200/api/bersoncare/relay-outbound` под `NODE_ENV=development`:

```text
TELEGRAM HTTP=200 BODY={"ok":true,"status":"skipped"}
SMS HTTP=200 BODY={"ok":true,"status":"skipped"}
```

В журнале для обоих запросов: `relay-outbound: suppressed by environment`, каналы соответственно
`telegram` и `sms`. Ни Telegram-, ни SMS-адаптер не вызывался.

## НЕ СДЕЛАНО

- PROD не читался и не изменялся.
- TEST не читался и не изменялся.
- Legacy `smtp_outbound` с prod-похожими значениями не менялся: он вне двух ключей Л5.
- Миграции и привилегии не создавались; на DEV миграции не применялись. Поэтому migration preflight
  с `ROLLBACK` отсутствует: проверять нечего.
- Полный CI, `scripts/ci-record.mjs` и автоматические UI-тесты не запускались.
- Второй Next-сервер не запускался.
- Резидентный scheduler/worker не запускался: точная команда
  `SELECT status, count(*) FILTER (WHERE next_retry_at <= now()) ...` показала 57 старых due-строк,
  и их обработка расширила бы scope. Живая SMTP-проверка прошла синхронным маршрутом.
- Строка независимого вердикта в `feat` не записывалась.

## Вердикт для ведущего

`PASS — Л5: DEV выпускает email только через петлевой SMTP в Mailpit; непетлевой SMTP получает отдельное подавление, Telegram/SMS остаются заглушены; production-ветка не изменена.`

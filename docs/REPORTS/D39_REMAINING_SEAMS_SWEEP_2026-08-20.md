# D39 — независимый sweep оставшихся webapp → integrator швов

Дата: 2026-08-20. Ветка: `wt/d39-census-20260820`.

Authority: `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`, D39. Этот проход не меняет
код и не повторяет девять строк census или закрытый owner-вопрос transactional email. Его предмет —
независимо проверить тезис census «иных не найдено» другими путями поиска.

## Вердикт

Тезис **не подтверждён в точной формулировке**: найден один дополнительный живой delivery seam, отсутствующий
в таблице census. Это не обнаруженный дефект доставки: ключ устойчив, receiver использует durable
`idempotencyPort`, повтор возвращает `duplicate` без второго dispatch.

| Шов | Файл:строка | Дверь | Ключ идемпотентности | Повтор | Вердикт |
| --- | --- | --- | --- | --- | --- |
| Operator alert relay | `apps/webapp/src/modules/operator-alerts/relayOperatorAlert.ts:23-60`; реальные callers: `modules/operator-alerts/dispatchOperatorAlert.ts:104`, `modules/admin-incidents/sendAdminIncidentStaffWebPush.ts:76` | Signed `POST /api/bersoncare/operator-alert-relay` | `${organizationId ?? 'global'}:${messageId}:${channel}:${recipient}` (`:31-34`); receiver namespace-prefixes organization (`apps/integrator/src/integrations/bersoncare/operatorAlertRelayRoute.ts:157`) | Receiver `tryAcquire(key, 86400)` (`:159-160`); занятый ключ → `200 {status:'duplicate'}`, second dispatch отсутствует | **Новая строка для census, PASS по коду.** Не чинить в этом проходе. |

## 1. HTTP-клиент и конфигурация, а не исходные строки census

Сначала выполнен обязательный независимый lexical поиск:

```text
$ node /home/dev/brain/tools/code-search.mjs "webapp send request to integrator http post" --repo bcb -k 30
EXIT: 0
```

Он вывел известные adapters/receiver routes и документацию, но не дал исчерпывающего sender-list. Поэтому его
пересёк ручной поиск именно call-site HTTP-клиента:

```text
$ rg -n "await fetch\\(" apps/webapp/src --glob '*.{ts,tsx}'
388 matches; EXIT: 0

$ rg -l -i "from ['\\\"](axios|undici|got|ky|node-fetch)|require\\(['\\\"](axios|undici|got|ky|node-fetch)" apps/webapp/src --glob '*.{ts,tsx}' | wc -l
0
```

Из 388 `fetch` вручную разобраны все call-sites с внешним/base URL или интеграторской конфигурацией. Результат:

- уже учтены census: SMS, Telegram/MAX OTP, email, reminder M2M/outbox, `relay-outbound`, `request-contact`;
- `modules/integrator/bookingM2mApi.ts:104` шлёт signed
  `POST /api/bersoncare/booking/lifecycle-event` с caller-supplied `idempotencyKey` (`:99-110`). Это **не
  новый** шов: ему соответствует строка census «Ingress booking/event gateway»; receiver
  `bookingLifecycleRoute.ts:854-918` проводит ключ через `idempotencyPort`;
- найденный `operator-alert-relay` выше — отдельный route и отдельный receiver, поэтому не может быть
  неявно отнесён к строке `relay-outbound`;
- `GET /health` и `GET /health/projection` (`infra/health/proxyIntegratorProjectionHealth.ts:8`,
  `app-layer/health/collectCriticalHealthSignals.ts:76-91`) — наблюдение, не доставка;
- CloudPayments/Alfabank call-sites — платежные провайдеры; `pingOperatorHeartbeat.ts:37-52` — пустой
  heartbeat на внешний receiver; они не адресуют integrator.

Дополнительный контроль конфигурации:

```text
$ rg -l "getIntegratorApiUrl|getIntegratorWebhookSecret|INTEGRATOR_API_URL|integratorBaseUrl|CLOUDPAYMENTS_API_BASE|ALFABANK|OPERATOR_HEARTBEAT_.*_URL" apps/webapp/src --glob '*.{ts,tsx}' | sort
29 files (включая tests/config/callers); EXIT: 0
```

Единственный transport-клиент помимо уже учтённых census и booking lifecycle — `relayOperatorAlert.ts`.

## 2. Очереди и outbox

Источник полного списка — `docs/ARCHITECTURE/DB_STRUCTURE.md`, Приложение A. По именам искались
`outbox`, `queue`, `delivery`, `dispatch`, `relay`:

```text
$ rg -n -i "public\\.[a-z0-9_]*(outbox|queue|delivery|dispatch|relay)[a-z0-9_]*|\\b(outbox|queue|delivery|dispatch|relay)[a-z0-9_]*\\b" docs/ARCHITECTURE/DB_STRUCTURE.md
```

Кандидаты: `integrator.projection_outbox`, `public.integrator_push_outbox`,
`public.outgoing_delivery_queue`, `delivery_attempt_logs`, `user_reminder_delivery_logs`,
`notification_delivery_attempts`, `reminder_delivery_events`, `support_delivery_events`; исторический
реестр также содержит `message_retry_jobs`. Дальше проверены их DDL и consumers:

```text
$ rg -n -C 3 "projection_outbox|message_retry_jobs" apps/webapp/src apps/integrator/src --glob '*.{ts,tsx}'
```

- `outgoing_delivery_queue` и `integrator_push_outbox` — две уже учтённые строки census.
- `integrator.projection_outbox` — очередь **integrator → webapp projection**, что прямо фиксирует
  `proxyIntegratorProjectionHealth.ts:8`; не webapp→integrator send seam.
- `message_retry_jobs` — вырезанная старая лестница: `apps/integrator/src/infra/delivery/deliveryContract.test.ts:4-7`
  фиксирует, что target ladder — `outgoing_delivery_queue`, а `integrator.message_retry_jobs` cut.
- Все таблицы с `delivery` в оставшемся списке — attempt/log/event tables: DDL не содержит status/next_try
  queue contract, а code search не показал из них webapp sender в integrator. Это аудит-следы, не очереди
  доставки интегратору.

Новой таблицы-очереди webapp→integrator не найдено.

## 3. Модули, а не endpoint names

Проверены логически способные отправлять наружу модули: `auth`, `booking-notifications`,
`doctor-broadcasts`, `messaging`, `notification-delivery`, `patient-broadcasts`,
`patient-notifications`, `reminders`, `specialist-tasks`, `operator-alerts`, `integrator`,
`system-settings`.

Команда и результат:

```text
$ rg -l -i "\\bfetch\\(|postIntegratorSignedJson|integratorBaseUrl|getIntegrator(ApiUrl|WebhookSecret)|integrator_push_outbox|outgoing_delivery_queue|relay-outbound|bersoncare" apps/webapp/src/modules --glob '*.{ts,tsx}' | wc -l
65
```

Из совпадений каждого названного delivery-модуля:

- `doctor-broadcasts`, `patient-broadcasts`, `patient-notifications`, `specialist-tasks` и messaging
  создают `outgoing_delivery_queue` intent либо пользуются существующим `relay-outbound`;
- `auth` использует уже учтённые OTP adapters;
- `reminders` использует уже учтённый M2M immediate/fallback outbox;
- `integrator` содержит уже учтённый booking lifecycle sender;
- `operator-alerts` содержит один новый `operator-alert-relay` выше;
- остальные совпадения — same-origin UI `fetch` или health/read paths, без integrator base URL.

Таким образом, модульный обход подтверждает один пропуск таблицы, но не второй delivery seam.

## 4. `system_settings`

Проверен именно active push, не общий путь записи настроек:

```text
$ rg -n -i "(system.?settings|settings).{0,100}(fetch|post|enqueue|outbox)|(fetch|post|enqueue|outbox).{0,100}(system.?settings|settings)" apps/webapp/src --glob '*.{ts,tsx}'
```

Вывод содержит только browser→same-origin settings APIs и ссылки на уже известный reminder outbox, без
webapp→integrator settings POST/enqueue. `createSystemSettingsService().updateSetting` делает DB-port write
и `invalidateConfigKey` (`modules/system-settings/service.ts:433-451`), не HTTP delivery. Integrator читает
канонические `public.system_settings` через DB-owned capability (`apps/integrator/src/infra/db/publicSystemSettings.ts:1-15,83-94`).

Вердикт: active push настроек отсутствует; исключение census «integrator читает сам» подтверждено.

## NOT DONE

- Census-таблица не изменена и D39 checkbox не закрыт: по brief это может сделать только owner/lead после
  принятия независимого аудита.
- Код и тесты не менялись; новый seam не исправлялся, потому что проверенный путь уже duplicate-safe.

## Независимый аудит

Дата: 2026-08-20. Роль: независимый скептический аудит; продуктовый код не менялся. Классификация обоих
пунктов — **взгляд** по AGENTS.md §24.4: проверялись фактические sender/receiver и итоговый route census,
не добавлялись тесты на отсутствие строк.

### 1. `operator-alert-relay` — PASS

Тезис отчёта подтверждён чтением кода:

- sender формирует стабильный ключ
  `${organizationId ?? 'global'}:${messageId}:${channel}:${recipient}` в
  `apps/webapp/src/modules/operator-alerts/relayOperatorAlert.ts:31-36`;
- receiver строит тот же organization-scoped key в
  `apps/integrator/src/integrations/bersoncare/operatorAlertRelayRoute.ts:157`, вызывает durable
  `idempotencyPort.tryAcquire(key, 86400)` до `dispatchOutgoing` (`:159-165`), а занятый ключ возвращает
  `200 { status: 'duplicate' }` (`:159-160`);
- локальный `inFlight` guard стоит до acquire (`:157-161`), поэтому параллельный запрос той же replica не
  доходит до dispatch; на другой replica его отсекает атомарный Postgres-backed port
  (`apps/integrator/src/infra/db/repos/idempotencyKeys.ts:27-48`). TTL равен 24 часам (`:14`, `:159`), не
  короче заявленного окна.

Реального пути «успешный dispatch → повтор с тем же ключом → второй dispatch» не найдено. Освобождение ключа
есть только в catch неуспешного dispatch (`operatorAlertRelayRoute.ts:167-172`); это не опровергает тезис о
повторе после успешной доставки.

### 2. «Других delivery seam нет» — PASS

Применён другой маршрут поиска, чем в исходном отчёте:

```text
$ rg -n --glob '*.{ts,tsx}' 'createHmac\\s*\\([^\\n]*sha256|createHmac\\s*\\(' apps/webapp/src
```

Каждый HMAC sender, относящийся к integrator, сопоставлен с census либо с новой строкой выше: email
(`integratorEmailAdapter.ts:13-75`), SMS (`integratorSmsDelivery.ts:26-76`), Telegram/MAX OTP (общий
`signIntegratorPayload`), relay (`relayOutbound.ts:74-175`), request-contact
(`requestMessengerContact.ts:19-57`), reminder upsert (`integratorM2mPosts.ts:15-93`), booking lifecycle
(`bookingM2mApi.ts:16-110`) и operator alert (`relayOperatorAlert.ts:23-60`). Остальные результаты HMAC —
платёжные, auth/session либо verification helpers, не вызовы integrator.

Полный список bersoncare route сверён с их регистрацией в
`apps/integrator/src/app/routes.ts:156-218`: `send-sms`, `send-email`, `relay-outbound`,
`operator-alert-relay`, `request-contact`, `send-otp`, `reminder-rules`, health probe и booking lifecycle.
Первые семь и booking имеют перечисленных выше webapp callers и уже покрыты census/этим отчётом. Health probe
не является webapp caller: реальный подписанный POST выполняет
`deploy/host/operator-health-probe.sh:61-65`; registry webapp лишь показывает его состояние
(`apps/webapp/src/modules/operator-health/cronJobRegistry.ts:115-123`). Следовательно, это host observability
path, не дополнительный webapp → integrator delivery seam.

Новой неупомянутой webapp → integrator delivery-двери не найдено; отрицательный тезис подтверждён.

# Универсальный enqueue исходящих сообщений (19.08.2026)

## Зачем

Подтверждение записи занимает 12.4 с. Из них 9.0 с — ожидание письма-подтверждения прямо в обработчике
запроса, 3.1 с — ретраи вызова жизненного цикла. Решение владельца:

> «письмо и уведомление не надо ждать — абсолютно точно»
>
> «Письмо нельзя просто положить в очередь — значит надо сделать чтобы можно было, у нас же интегратор для
> этого и создан, у него есть планировщик, есть ретраи, все есть — и должно быть универсальным по сути
> механизмом, в который просто передается нужный контекст от вебапп. Не 100 функций на каждое отправляемое
> событие. Тогда и роль и права и контекст подставлять надо в одном месте. И желательно писать сразу
> оптимизированно по запросам к бд а не как раньше.»

Цель: **один** объявленный корень постановки в очередь, принимающий контекст сообщения, а не по функции на
каждый вид письма.

## 1. Что построено сегодня

| Кусок | Файл | Что делает |
| --- | --- | --- |
| Таблица очереди | `public.outgoing_delivery_queue` | 19 колонок, `uq_outgoing_delivery_queue_event_id` UNIQUE, FORCE RLS, **у `kind` нет CHECK-ограничения** — база принимает любую строку вида |
| Воркер | `apps/integrator/src/infra/runtime/worker/outgoingDeliveryWorker.ts` | клеймит due-строки, резолвит арендатора, диспатчит, ретраит, хоронит |
| Общий транспорт | `apps/integrator/src/infra/delivery/deliveryContract.ts:25` | `GENERIC_TRANSPORT_QUEUE_KINDS` — виды, чья строка уже является готовым transport-намерением и не требует продуктовой логики в воркере |
| Шов записи (webapp) | `apps/webapp/src/infra/repos/pgOutgoingDeliveryQueue.ts` | drizzle-инсерт **напрямую в таблицу**; работает только там, где у роли есть table grant |
| Резолвер арендатора | `app.resolve_outgoing_delivery_scope(uuid)` | строка → `tenant` / `operator_global` / `invalid` |

### Объявленные корни enqueue — сколько их и что каждый покупает

Их **четыре**, и ни один не универсален:

1. `app.enqueue_current_reminder_rule_push(text)` — пишет в `public.integrator_push_outbox`, не в очередь
   доставки. Покупает: пациент/staff может переслать интегратору правило напоминания, не имея грантов ни на
   `reminder_rules`, ни на outbox.
2. `app.enqueue_integrator_inbound_reply(text,text,text,integer,uuid)` — пишет в очередь доставки. Гейт —
   `app_operational_delivery_worker`, то есть **порт интегратора, не вебапп**. Покупает: воркер ставит ответ
   на входящее, не получая INSERT на таблицу.
3. `app.email_auth_enqueue_otp_delivery(uuid,uuid)` — пишет в очередь доставки под `app_patient`. Покупает
   максимум: **сам собирает письмо** из `public.email_challenges`, поэтому вызывающий не может сочинить
   произвольное письмо — он передаёт только id challenge и одноразовый токен владения.
4. `app.enqueue_media_transcode_job_for_staff|_for_service(uuid)` → `_core(uuid)` — другая очередь
   (`media_transcode_jobs`), но именно та форма, которую копирует эта работа: **один приватный core + тонкие
   роли-обёртки**, у каждой свой класс контекста.

Вывод: для вебаппа **нет** корня, который кладёт произвольное исходящее сообщение в
`outgoing_delivery_queue`. Поэтому письмо-подтверждение и уходит синхронно по HTTP через relay.

## 2. Ловушка карантина

`app.resolve_outgoing_delivery_scope(uuid)` при неузнанном `kind` возвращает `invalid`, и воркер
(`outgoingDeliveryWorker.ts:1084`) помечает строку **dead** — без отправки и без ретрая. Это уже давало
отказ, зафиксированный дословно в `deploy/postgres/c4-operational-runtime.sql:509-512`:
«found 04.08: missing auth_email_otp quarantined every login OTP».

**Тела функции в рабочем дереве нет.** `c4-operational-runtime.sql:509` утверждает, что «latest body in
`apps/webapp/db/drizzle-migrations/*`», а `scripts/check-c4-migration-owned-function-bodies.mjs:18`
запрещает держать тело в оверлее — но в ledger миграций тела нет:

```
$ grep -rn "resolve_outgoing_delivery_scope" apps/webapp/db/ deploy/postgres/*.sql
(в apps/webapp/db — ни одного совпадения; в deploy — только ALTER/REVOKE/GRANT и списки ACL)
```

Тело нашлось в сгенерированном снимке `deploy/postgres/generated/prod-to-target/schema-pre.sql`, удалённом
из ветки коммитом `bfe6b48f0` 17.08.

**Сверка живого тела со снимком.** Живое тело снято с `bcb_webapp_dev`
(`select prosrc from pg_proc …`), историческое — `git show bfe6b48f0^:…schema-pre.sql`, строки 12219–12306.
Diff: **различаются только dollar-кавычки обёртки (`AS $_$` / `$_$;`), тело совпадает построчно.**
То есть с момента снимка функцию никто не менял; починка `auth_email_otp` от 04.08 уже была в снимке.

**Действие:** тело переносится в нумерованную миграцию `0033`. Незаверсионированная функция на критическом
пути доставки — самостоятельная опасность, независимая от этой задачи: `reapply_c4_operational_runtime_overlays`
после каждого `pnpm migrate` не тронет её (в оверлее только ACL), а восстановить её при пересоздании базы
неоткуда.

### Почему ловушка вообще срабатывает

Первая ветка функции — **не по виду**:

```sql
IF stored_organization_id IS NOT NULL THEN
  RETURN QUERY SELECT queue_kind, stored_organization_id, 'tenant'::text;
```

Строка, несущая `organization_id`, резолвится в `tenant` **при любом `kind`**. Ветки по видам ниже нужны
только строкам с `organization_id IS NULL`: операторским (глобальным) и тем, кто выводит арендатора из
связанной строки (`reminder_dispatch` → occurrence, `doctor_broadcast_intent` → broadcast_audit).

`auth_email_otp` попал в карантин именно потому, что он **до входа**, у него нет организации — и его забыли
внести в список глобальных. Арендаторское сообщение в эту ловушку не попадает вовсе.

## 3. Дизайн

**Один вид очереди `outbound_message` и один объявленный корень.**

```sql
app.enqueue_outbound_message(
  p_organization_id uuid,     -- арендатор; NULL = платформенное сообщение
  p_purpose         text,     -- 'booking.confirmation' — назначение, не вид транспорта
  p_idempotency_key text,     -- стабильный ключ отправителя
  p_channel         text,     -- email | telegram | max | sms | web_push
  p_recipient       text,     -- адрес в терминах канала
  p_content         jsonb,    -- {text, html?, subject?, icsContent?, icsFilename?, replyMarkup?, title?, url?, senderScope?}
  p_max_attempts    integer
) RETURNS boolean             -- true, если вставлена новая строка
```

### Что несёт контекст

- **организация** — `p_organization_id`, ложится в колонку `organization_id`;
- **получатель** — `p_recipient`, раскладывается по слоту канала внутри корня (закрытая карта из пяти
  строк, выведенная из самих адаптеров: `email→recipient.email`, `telegram→recipient.chatId`,
  `max→recipient.userId`, `sms→recipient.phoneNormalized` + `delivery.channels=['smsc']`,
  `web_push→recipient.pushUserId`);
- **канал** — `p_channel`, он же `meta.source` и `payload.delivery.channels`;
- **содержимое** — `p_content`, переносится в payload **дословно**, поле в поле;
- **ключ идемпотентности** — `event_id = p_purpose || ':' || p_idempotency_key`, UNIQUE-колонка таблицы,
  вставка `ON CONFLICT (event_id) DO NOTHING`;
- **назначение** — `p_purpose`; именно оно, а не `kind`, различает виды сообщений.

### Класс сообщения корень НЕ принимает от вызывающего

`outboundMessageClass`/`outboundCapability` — маркер политики внешнего выхода
(`apps/integrator/src/infra/adapters/outboundMessagePolicy.ts`). Корень выводит его сам, повторяя ровно то
правило, что уже стоит в подписанном relay-маршруте (`relayOutboundRoute.ts:88-99`):
`senderScope='clinic_required'` → `broadcast_event`/`clinic_delivery`, иначе
`routine_product`/`essential_delivery`. Вызывающий не может назначить себе более широкий маркер — это
условие того, что корень не является расширением прав по сравнению с сегодняшним relay.

### Новый вид сообщения без правки резолвера

**Не требует правки вообще.** Новое сообщение — это новый `p_purpose` внутри того же `kind`
(`outbound_message`). Резолвер видит `organization_id IS NOT NULL` и отдаёт `tenant` первой веткой, до
любого разбора вида. Воркер видит `outbound_message` в `GENERIC_TRANSPORT_QUEUE_KINDS` и диспатчит строку
как готовое намерение.

Минимальное касание остаётся ровно в двух случаях, и оба — не «новое сообщение»:
1. **Новый транспортный канал** (не из пяти) — карта слотов получателя в корне + адаптер в интеграторе.
   Канал без адаптера отправить нельзя в любом случае.
2. **Платформенное сообщение без организации.** Чтобы и этот случай не повторил историю `auth_email_otp`,
   миграция 0033 сразу вносит `outbound_message` в список глобальных видов резолвера. После этого
   `outbound_message` с `organization_id IS NULL` резолвится как `operator_global`, а не карантинится.
   То есть касание закрыто заранее, один раз.

Отдельно: `p_channel` и `p_purpose` валидируются в корне; неизвестный канал — исключение `22023` на
вставке, а не тихая мёртвая строка через сутки.

### Гейт контекста: почему он рукописный

Корень многокапабилитный — в него идут ДВА класса контекста (пациент и staff). Генератор
(`deploy/postgres/privileges/generate.mjs`, режим `exact_existing`) такой гейт **не переписывает**, а
только проверяет на присутствие каждого токена декларации, поэтому вызов `app.require_accepted_context`
написан в теле руками — по образцу `app.append_platform_audit_event` (миграция 0025). Два прикладных
следствия, обнаруженных при применении:
- комментарий между открытием тела и `PERFORM app.require_*` ломает проверку гейта (она требует, чтобы
  за открывающим ключевым словом немедленно следовал вызов), поэтому пояснение стоит выше;
- слово-ключ в тексте комментария выше по телу тоже ломает проверку — она ищет ПЕРВОЕ вхождение.

### Роль и права

- **Владелец корня:** `app_seam_delivery_scope_owner` — тот же шов, что владеет резолвером и
  `enqueue_integrator_inbound_reply`; у него уже есть политика `rev10_named_root_owner_gate_136` на
  `public.outgoing_delivery_queue`, то есть новых грантов на таблицу не появляется вовсе.
- **EXECUTE:** `app_patient` и `app_staff`.
- **Гранты на таблицу:** ни одного нового. Роли рантайма получают только EXECUTE — как у
  `enqueue_media_transcode_job_for_staff`.
- **Контекст порта:** две объявленные возможности с назначением `outbound.message.enqueue` —
  `patient_outbound_message_enqueue` (`app_patient`/`patient`) и `staff_outbound_message_enqueue`
  (`app_staff`/`staff`), обе на `functionIdentity: app.enqueue_outbound_message(...)`.

### Цена в запросах

| | сегодня | после |
| --- | --- | --- |
| Обращений к БД из вебаппа | 0 | **1 statement** (`SELECT app.enqueue_outbound_message(...)`) + 1 statement установки контекста порта, оба на уже открытом соединении |
| Сетевых вызовов из обработчика | 1 HTTP к интегратору, **блокирующий до конца SMTP** | 0 |
| Что стоит в обработчике | SMTP-хендшейк и отправка (замер владельца: 9.0 с) | одна вставка строки |
| Где выполняется SMTP | внутри HTTP-запроса вебаппа | тик воркера доставки |

`getIntegratorApiUrl()` / `getIntegratorWebhookSecret()` читают env, не БД (`integrationRuntime.ts:13-19`),
поэтому сегодняшний нуль обращений к БД — честный: вся цена сегодня в блокирующем SMTP.

**Замерено на `bcb_webapp_dev` (19.08).** Тело постановки — та же `INSERT ... ON CONFLICT (event_id)
DO NOTHING`, что делает корень, 200 строк под ролью `app_seam_delivery_scope_owner` в откатанной
транзакции: **17.1 мс на 200 строк = 0.086 мс на постановку**. Клиентский round-trip по тому же
mTLS-соединению, что использует вебапп: **0.069–0.287 мс** на statement. То есть постановка стоит доли
миллисекунды против 9.0 с ожидания SMTP.

**Чего НЕ мерил, и это важно:** 9.0 с — замер владельца на живом пути, я его не воспроизводил. На DEV
реальной SMTP-отправки нет (send-safety redirect), поэтому «до» измерить тем же способом нельзя. Что
доказано прямо: из обработчика убран весь блокирующий вызов, а то, что встало на его место, стоит
доли миллисекунды. Разница между 12.4 с и результатом на живом стенде подлежит замеру владельцем.

### Идемпотентность

Была: relay выводит 24-часовой dedup-ключ из `messageId`. Стала: `event_id` = `booking.confirmation:<bookingId>`
в UNIQUE-колонке, `ON CONFLICT DO NOTHING` — **навсегда, а не на 24 часа**. Ретрай очереди повторяет
отправку той же строки, но не создаёт вторую; повторный вызов создания не вставляет вторую строку.

## Чек-лист

- [x] Снять живое тело `app.resolve_outgoing_delivery_scope` с `bcb_webapp_dev`, сверить со снимком
      `bfe6b48f0^:deploy/postgres/generated/prod-to-target/schema-pre.sql` — совпало, кроме dollar-кавычек
- [x] Миграция `0033`: тело резолвера + `outbound_message` в списке глобальных видов
- [x] Миграция `0033`: `app.enqueue_outbound_message(uuid,text,text,text,text,jsonb,integer)`
- [x] Объявление корня и двух port-context возможностей в `deploy/postgres/privileges/declaration.ts`
- [x] Перегенерация артефактов репозиторным генератором
- [x] Применение к `bcb_webapp_dev` через `deploy/host/migrate-dev.sh --execute`
- [x] Порт вебаппа `outboundMessageQueuePort` + реализация `pgOutboundMessageQueue.ts`
- [x] `sendBookingConfirmationEmail` кладёт письмо в очередь вместо синхронного relay
- [x] Интегратор: `outbound_message` в `OutgoingDeliveryKind` и `GENERIC_TRANSPORT_QUEUE_KINDS`
- [x] Видимый отказ: карантин/смерть строки поднимает операторский инцидент, а не только лог
- [x] Тесты: idempotency, .ics байт-в-байт, карантин, отсутствие «плавающего» промиса
- [x] Fault injection: сломать одно место, убедиться что тест краснеет, вернуть

## Что намеренно оставлено следующим шагом

- **Событие жизненного цикла записи** (`deps.syncPort.emitBookingEvent`, `canonicalCreate.ts`) — те самые
  3.1 с ретраев. Владелец отдельно постановил: «интегратор тут вообще ни при чем и не должен быть…
  Запись делает вебапп». Это не перенос в очередь, а снятие интегратора с пути записи — своя работа со
  своим дизайном.
- **Перевод остальных отправок** (`relayOutbound` вызывается и из других мест) на новый корень.
- **Ручной шаг при применении, который стоит убрать:** первый `migrate-dev.sh --execute` записал 0033 в
  ledger и упал на reconcile (гейт), после чего повторный прогон миграцию уже пропускал. Пришлось
  удалить строку ledger, чтобы исправленная миграция применилась. Мигратор применяет по watermark
  `created_at`, а не по хешу тела, — то есть частично применённая миграция чинится только правкой
  ledger. Это не дефект этой работы, но грабли на пути каждого.
- **Тела `app.enqueue_media_transcode_job_core|_for_staff|_for_service`** так же живут вне ledger миграций
  (в `deploy/postgres/generated/privileges.*.sql` только ACL). Тот же класс опасности, что у резолвера, но
  вне этой работы — вынесено владельцу вопросом, не залатано молча.

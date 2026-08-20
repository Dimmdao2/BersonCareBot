# Независимый аудит D39 — швы доставки

Дата: 2026-08-20. Ветка: `wt/d39-census-20260820`. Проверены коммиты `fb1655884`,
`499f2efd6`, `decc3937f` в текущем итоговом дереве. Аудитор: Codex, не автор проверяемых
коммитов.

**ВЕРДИКТ: FAIL — retry синхронизации reminder rule меняет ключ между immediate POST и fallback-outbox (`apps/webapp/src/modules/reminders/notifyIntegrator.ts:12-22`, `apps/webapp/src/infra/integrator-push/integratorM2mPosts.ts:40-45`, `deploy/postgres/generated/prod-to-target/schema-pre.sql:5335-5339`).**

## Метод и blind kill-set

По `AGENTS.md` §24.4 этап разделён:

- дедупликация доставки — повторяемое поведение: чтение полного пути, route-тесты и fault injection;
- удаление M2M merge-клиента — разовое действие: diff, `code-search` и точный поиск конечного состояния,
  без постоянного теста отсутствия текста.

Blind kill-set был записан до чтения тестов:

1. обход `tryAcquire` должен уронить duplicate-assertion отдельно для SMS, reminder rules, email OTP и
   Telegram/MAX OTP;
2. одинаковый ключ даёт один side effect, другой ключ — второй;
3. transactional email без явно переданного retry-key не должен подавлять второй осознанный вызов;
4. один конкретный retry должен донести один и тот же ключ от вызывающего кода до receiver.

## Finding

### D39-F1 — M2M reminder retry не сохраняет ключ исходной операции

Достижимый сценарий:

1. `notifyIntegratorRuleUpdated` вызывает immediate POST без ключа (`notifyIntegrator.ts:12`).
2. `postReminderRuleUpsertToIntegrator` генерирует его на месте как
   `rule_${rule.id}_${timestamp}` (`integratorM2mPosts.ts:40-45`).
3. Integrator принимает запрос, приобретает этот ключ и делает write, но HTTP-ответ теряется; `fetch`
   отклоняется.
4. Catch в `notifyIntegratorRuleUpdated` ставит ту же операцию в fallback через один `rule.id`
   (`notifyIntegrator.ts:13-22`). DB-функция назначает уже другой ключ —
   `reminder_rule:<integratorRuleId>` (`schema-pre.sql:5335-5339`).
5. Worker корректно передаёт `row.idempotencyKey`, но receiver видит новый ключ, приобретает его и выполняет
   второй write. Объявленный в census duplicate/no-op для конкретного retry не достигается.

Команда и вывод:

```text
$ nl -ba apps/webapp/src/modules/reminders/notifyIntegrator.ts
     9  export async function notifyIntegratorRuleUpdated(rule: ReminderRule): Promise<void> {
    11    try {
    12      await postReminderRuleUpsertToIntegrator(rule);
    13    } catch (err) {
    21      try {
    22        await enqueueCurrentReminderRulePushDefault(rule.id);

$ nl -ba apps/webapp/src/infra/integrator-push/integratorM2mPosts.ts | sed -n '38,53p'
    38  export async function postReminderRuleUpsertToIntegrator(
    39    rule: ReminderRule,
    40    existingIdempotencyKey?: string,
    41  ): Promise<void> {
    45    const idempotencyKey = existingIdempotencyKey ?? `rule_${rule.id}_${timestamp}`;
    50    const body = JSON.stringify({
    51      eventType: 'reminder.rule.upserted',
    52      idempotencyKey,

$ nl -ba apps/webapp/src/infra/integrator-push/deliverIntegratorPushPayload.ts
     5  export async function deliverIntegratorPushPayload(row: IntegratorPushOutboxRow): Promise<void> {
     9    await postReminderRuleUpsertToIntegrator(rule, row.idempotencyKey);

$ nl -ba deploy/postgres/generated/prod-to-target/schema-pre.sql | sed -n '5335,5341p'
  5335    INSERT INTO public.integrator_push_outbox (
  5336      kind, idempotency_key, payload, status, attempts_done, next_try_at, last_error, updated_at
  5337    ) VALUES (
  5338      'reminder_rule_upsert', 'reminder_rule:' || p_integrator_rule_id, v_payload,
  5339      'pending', 0, now(), NULL, now()
  5340    )
  5341    ON CONFLICT (idempotency_key) DO UPDATE
EXIT: 0
```

Существующий `notifyIntegrator.test.ts` проверяет только факт двух вызовов `post` и `enqueue`; ключ между ними
не наблюдает. Route-тест с вручную одинаковым ключом доказывает receiver, но не этот end-to-end retry.

## 1. Четыре заявленных шва и источник ключа

### Email adapter → PASS

- OTP: `integratorEmailAdapter.ts:17-19,65-66` строит стабильный ключ из конкретных `to + code`;
  `sendEmailRoute.ts:39,157-159` требует ключ и делает duplicate/no-op до dispatch.
- Transactional email: `integratorEmailAdapter.ts:69-75` создаёт новый UUID для каждого обычного вызова,
  поэтому одинаковые осознанные письма не дедуплицируются. В текущем коде retry-loop transactional email нет;
  следовательно, требование о явно caller-supplied key для будущего конкретного retry сейчас не обходится.

```text
$ nl -ba apps/webapp/src/infra/integrations/email/integratorEmailAdapter.ts | sed -n '17,20p;64,76p'
    17  function emailIdempotencyKey(payload: Record<string, string>): string {
    18    const digest = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    19    return `email:send:${digest}`;
    65    async sendEmailCode(to: string, code: string): Promise<SendEmailResult> {
    66      return postSendEmail({ to, code }, emailIdempotencyKey({ to, code }));
    69    async sendTransactionalEmail(
    73    ): Promise<SendEmailResult> {
    74      return postSendEmail({ to, subject, text }, `email:send:${randomUUID()}`);
    75    },
EXIT: 0
```

### SMS adapter/delivery → PASS

`integratorSmsDelivery.ts:30-37` связывает ключ с конкретным OTP, каналом и адресатом; новый код resend даёт
другой ключ. SMS body получает его в `:71-75`, Telegram/MAX body — в
`integratorSmsAdapter.ts:129-135`. Receiver-gates: `sendSmsRoute.ts:108-120` и
`sendOtpRoute.ts:100-110`.

```text
$ nl -ba apps/webapp/src/infra/integrations/sms/integratorSmsDelivery.ts | sed -n '30,38p;63,76p'
    30  /** Stable for a transport retry; a new OTP code (including explicit resend) gets a new key. */
    31  export function otpDeliveryIdempotencyKey(
    36    const digest = createHash('sha256').update(`${channel}:${recipient}:${code}`).digest('hex');
    37    return `otp:${channel}:${digest}`;
    63  export async function deliverSmsCodeViaIntegrator(
    71    const body = JSON.stringify({
    72      phone,
    73      code,
    74      idempotencyKey: otpDeliveryIdempotencyKey('sms', phone, code),
EXIT: 0
```

### Push delivery → PASS локально

`deliverIntegratorPushPayload.ts:5-9` не генерирует ключ и передаёт `row.idempotencyKey`. Повторные попытки
одной уже созданной outbox-row сохраняют ключ. Этот локальный слой закрыт.

### M2M posts → FAIL end-to-end

`integratorM2mPosts.ts:40-45` принимает caller-key от worker, но для immediate вызова генерирует ключ сам.
Fallback той же неоднозначно завершившейся операции получает другой ключ. Это D39-F1 выше.

## 2. Transactional email по решению владельца

Решение из `decc3937f` соблюдено: строка `:74` использует новый UUID на обычный вызов, а не hash тела; второй
осознанный вызов не будет молча проглочен. Явного retry-loop, которому сейчас требовался бы caller-key, поиски не
нашли.

```text
$ node /home/dev/brain/tools/code-search.mjs "transactional email retry caller idempotencyKey sendEmail adapter" --repo bcb -k 20
# code-search: «transactional email retry caller idempotencyKey sendEmail adapter» · репо bcb · лексический BM25
• bcb/apps/webapp/src/infra/integrations/email/integratorEmailAdapter.ts:81-93
• bcb/apps/webapp/src/modules/specialist-tasks/notifySpecialistTaskReminder.ts:121-170
• bcb/apps/webapp/src/app/api/clinic/invites/route.ts:81-118
EXIT: 0

$ rg -n "sendEmailCodeViaIntegrator|sendEmailSetupLinkViaIntegrator" apps/webapp/src
apps/webapp/src/infra/integrations/email/integratorEmailAdapter.ts:79:export async function sendEmailCodeViaIntegrator(
apps/webapp/src/infra/integrations/email/integratorEmailAdapter.ts:90:export async function sendEmailSetupLinkViaIntegrator(
apps/webapp/src/infra/integrations/sms/integratorSmsAdapter.ts:110:          const sent = await sendEmailCodeViaIntegrator(to, code);
apps/webapp/src/app-layer/di/bindAuthModulePorts.ts:43:      const result = await sendEmailCodeViaIntegrator(to, code);
apps/webapp/src/modules/specialist-tasks/notifySpecialistTaskReminder.ts:150:      await sendEmailSetupLinkViaIntegrator(task.recipientEmail, subject, text);
apps/webapp/src/app/api/clinic/invites/route.ts:105:      await sendEmailSetupLinkViaIntegrator(normalizedEmail, subject, text);
EXIT: 0
```

## 3. Тесты и независимая fault injection

### Fault injection

Временно заменены четыре receiver-условия на `false && tryAcquire(...)`. Production-код после прогона возвращён
точным обратным patch. Команда теста была запущена напрямую, не через pipe:

```text
$ pnpm --dir apps/integrator exec vitest run src/integrations/bersoncare/sendOtpRoute.route.test.ts src/integrations/bersoncare/sendEmailRoute.route.test.ts src/integrations/bersoncare/deliveryIdempotency.route.test.ts --reporter=dot

 RUN  v4.1.10 /home/dev/dev-projects/bcb-wt-d39-20260820/apps/integrator

··xxx··x

Failed Tests 4
FAIL deliveryIdempotency.route.test.ts > SMS retry dispatches once; a distinct resend key dispatches twice
  AssertionError at deliveryIdempotency.route.test.ts:51
FAIL deliveryIdempotency.route.test.ts > reminder outbox retry writes once; a new rule event writes again
  AssertionError at deliveryIdempotency.route.test.ts:97
FAIL sendEmailRoute.route.test.ts > same email OTP request is a no-op, while a new resend key sends another code
  AssertionError at sendEmailRoute.route.test.ts:134
FAIL sendOtpRoute.route.test.ts > same signed request is a no-op, while an explicit resend key dispatches again
  AssertionError at sendOtpRoute.route.test.ts:102

Test Files  3 failed (3)
Tests       4 failed | 4 passed (8)
EXIT fault-injected D39 route tests: 1
```

Результат kill-set: четыре из четырёх receiver-поломок пойманы, непойманных receiver-классов — 0. D39-F1 —
другой, caller-side класс: тесты подают уже одинаковый ключ и потому не проверяют его непрерывность.

### Зелёные затронутые тесты

Запущены все тесты каталога изменённых integrator routes плюс соседний app-тест, а также изменённый
`integratorSmsAdapter.deferred.unit.test.ts`, соседний deferred-тест и тест реального fallback-caller.

```text
$ pnpm --dir apps/integrator exec vitest run src/integrations/bersoncare src/app/operatorHealthProbeSettings.unit.test.ts --reporter=dot

 RUN  v4.1.10 /home/dev/dev-projects/bcb-wt-d39-20260820/apps/integrator
·······································································

Test Files  14 passed (14)
Tests       71 passed (71)
EXIT integrator adjacent tests: 0

$ pnpm --dir apps/webapp exec vitest run src/infra/integrations/sms/integratorSmsAdapter.deferred.unit.test.ts src/infra/integrations/sms/stubSmsAdapter.deferred.unit.test.ts src/modules/reminders/notifyIntegrator.test.ts --reporter=dot

 RUN  v4.1.10 /home/dev/dev-projects/bcb-wt-d39-20260820/apps/webapp
·····

Test Files  3 passed (3)
Tests       5 passed (5)
EXIT webapp adjacent tests: 0
```

## 4. Мёртвый M2M merge-клиент удалён чисто → PASS

Сначала выполнен обязательный lexical `code-search` по вызову и по возможным route/alias. Индекс датирован
`2026-08-20T13:45:02.466Z` и оказался stale: он ещё показал удалённый app-layer re-export и старый фрагмент
infra-файла. Поэтому конечное состояние дополнительно доказано точными поисками по рабочему дереву и diff.

Искали:

1. `callIntegratorUserMerge`, его тип `IntegratorMergeResponse`, import/export/call;
2. `/api/integrator/users/merge`, webapp alias `doctor/clients/integrator-merge`;
3. payload aliases `winnerIntegratorUserId`, `loserIntegratorUserId` в обоих приложениях;
4. app-layer boundary-файл;
5. удалённую строку именно в `apps/webapp/src/app/api/api.md`.

```text
$ node /home/dev/brain/tools/code-search.mjs "callIntegratorUserMerge calls imports exports invocation" --repo bcb -k 30
# code-search: «callIntegratorUserMerge calls imports exports invocation» · репо bcb · лексический BM25
• bcb/apps/webapp/src/app-layer/integrations/integratorUserMergeM2mClient.ts:1-3
• bcb/apps/webapp/src/infra/integrations/integratorUserMergeM2mClient.ts:81-130
• bcb/docs/archive/2026-04-initiatives/PLATFORM_USER_MERGE_V2/AUDIT_INDEPENDENT.md:1-50
EXIT code-search callIntegratorUserMerge: 0

$ node /home/dev/brain/tools/code-search.mjs "integrator users merge HTTP POST route handler webapp integrator" --repo bcb -k 30
# code-search: «integrator users merge HTTP POST route handler webapp integrator» · репо bcb · лексический BM25
• bcb/docs/archive/2026-04-initiatives/PLATFORM_USER_MERGE_V2/AUDIT_STAGE_5.md:41-90
• bcb/apps/webapp/src/infra/integrations/integratorUserMergeM2mClient.ts:81-130
• bcb/apps/webapp/src/modules/integrator/reminderDispatch.ts:1-37
EXIT code-search users merge route: 0

$ rg -n "callIntegratorUserMerge|IntegratorMergeResponse" .
./docs/REPORTS/D39_DELIVERY_SEAM_CENSUS_2026-08-20.md:32:   `callIntegratorUserMerge` НОЛЬ вызовов ...
./docs/REPORTS/D39_DELIVERY_SEAM_CENSUS_2026-08-20.md:35:   ... Удалены `callIntegratorUserMerge`, тип `IntegratorMergeResponse` ...
./docs/archive/2026-04-initiatives/PLATFORM_USER_MERGE_V2/AUDIT_INDEPENDENT.md:49:- **Суть:** route ... вызывает `callIntegratorUserMerge(...)`.
EXIT: 0
```

Три совпадения — только текущий отчёт census и архивный audit; production/import/export/call отсутствуют.

```text
$ rg -n "/api/integrator/users/merge|doctor/clients/integrator-merge|winnerIntegratorUserId|loserIntegratorUserId" apps/webapp apps/integrator
<пусто>
EXIT: 1 (нет совпадений)

$ test ! -e apps/webapp/src/app-layer/integrations/integratorUserMergeM2mClient.ts
EXIT: 0

$ git show --format= --no-ext-diff 499f2efd6 -- apps/webapp/src/app/api/api.md
@@ -94,7 +94,6 @@
-- **doctor/clients/integrator-merge** — `POST`, только **admin + admin mode**. ...
EXIT: 0

$ rg -n "integrator-merge|users/merge" apps/webapp/src/app/api/api.md
<пусто>
EXIT: 1 (нет совпадений)
```

Сохранившийся `apps/webapp/src/infra/integrations/integratorUserMergeM2mClient.ts:82-113` содержит только живой
`checkIntegratorCanonicalPair` и POST на `/api/integrator/users/canonical-pair`; merge sender в нём отсутствует.

## 5. Scope диффа → PASS

```text
$ git diff --name-status fb1655884^ decc3937f
M  apps/integrator/src/app/routes.ts
A  apps/integrator/src/integrations/bersoncare/deliveryIdempotency.route.test.ts
M  apps/integrator/src/integrations/bersoncare/reminderRulesRoute.ts
M  apps/integrator/src/integrations/bersoncare/sendEmailRoute.route.test.ts
M  apps/integrator/src/integrations/bersoncare/sendEmailRoute.ts
M  apps/integrator/src/integrations/bersoncare/sendOtpRoute.route.test.ts
M  apps/integrator/src/integrations/bersoncare/sendOtpRoute.ts
M  apps/integrator/src/integrations/bersoncare/sendSmsRoute.ts
D  apps/webapp/src/app-layer/integrations/integratorUserMergeM2mClient.ts
M  apps/webapp/src/app/api/api.md
M  apps/webapp/src/infra/integrations/email/integratorEmailAdapter.ts
M  apps/webapp/src/infra/integrations/integratorUserMergeM2mClient.ts
M  apps/webapp/src/infra/integrations/sms/integratorSmsAdapter.deferred.unit.test.ts
M  apps/webapp/src/infra/integrations/sms/integratorSmsAdapter.ts
M  apps/webapp/src/infra/integrations/sms/integratorSmsDelivery.ts
M  apps/webapp/src/infra/integrator-push/deliverIntegratorPushPayload.ts
M  apps/webapp/src/infra/integrator-push/integratorM2mPosts.ts
M  docs/REPORTS/D39_DELIVERY_SEAM_CENSUS_2026-08-20.md
M  docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md
EXIT: 0

$ git diff --summary fb1655884^ decc3937f
 create mode 100644 apps/integrator/src/integrations/bersoncare/deliveryIdempotency.route.test.ts
 delete mode 100644 apps/webapp/src/app-layer/integrations/integratorUserMergeM2mClient.ts
EXIT: 0

$ git diff --no-ext-diff fb1655884^ decc3937f -- . ':(exclude)docs/**' | rg -n "(^|[^A-Za-z])(GRANT|REVOKE|CREATE POLICY|ALTER POLICY|DROP POLICY|cutover|migration)([^A-Za-z]|$)"
<пусто>
EXIT: 1 (нет совпадений)
```

Изменений прав, политик, миграций, cutover-SQL и file-mode нет.

## 6. Integrator lint → PASS

Команда выполнена напрямую:

```text
$ pnpm --dir apps/integrator run lint

> @bersoncare/integrator@1.0.0 lint /home/dev/dev-projects/bcb-wt-d39-20260820/apps/integrator
> eslint src && node ../../scripts/check-queue-port-boundary.mjs && tsx src/infra/scripts/check-no-legacy-message-retry-producers.ts

check-queue-port-boundary: OK
legacy retry producer gate: PASS
EXIT pnpm --dir apps/integrator run lint: 0
```

Полный CI не запускался: brief прямо запретил его, а scope закрывается targeted/app checks.

## Чистота после fault injection

До создания этого audit-artifact:

```text
$ git status --porcelain
<пусто>
EXIT: 0
```

Временные production-изменения полностью откатились. В коммит аудита входит только этот отчёт.

## Замечания вне предмета

Нет.

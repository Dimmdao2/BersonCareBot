# Независимый аудит Л5, круг 3

Дата: 2026-09-15. Candidate: `ad548b680f15465a496c00867c56feaa56687bc4`, ветка
`wt/dev-mail-trap`. Authority: `docs/_TODO/LEADS_AND_COMMUNICATION_VISIBILITY_2026-09-14.md`,
«Очередь до цели», пункт 5 (Л5).

## Вердикт

**FAIL. MUST FIX 4.** Продуктовый путь `NODE_ENV=development` после коррекции закрыт для всех
непочтовых каналов, DEV-email доходит до сетевой границы только с петлевым SMTP, развёрнутый TEST
с явно заданным `NODE_ENV=production` не открывается флагом `VITEST`, а штатный production
пропускает исходное сообщение без изменений. Однако одна разрешённая конфигурацией production-like
клетка остаётся fail-open, в активном server-каноне осталась противоположная редакция, а два новых
тестовых решения не проходят линейку владельца §10a.

## MUST FIX

### 1. `NODE_ENV` отсутствует + `TEST=true` + `VITEST=true` выпускает настоящего получателя

Достижимый сценарий: `apps/integrator/src/config/env.ts:10` разрешает не задавать `NODE_ENV` и
нормализует такой процесс в `production`. Safety-gate, однако, читает сырой `process.env`:
`testDeliverySafety.ts:56-59` при отсутствующем `NODE_ENV` доверяет `VITEST=true`, возвращает
`false`, после чего `dispatchPort.ts:257` пропускает исходный intent до адаптера. Матричный прогон
показал `realRecipientReached=true` для клетки `<unset>/true/true`.

Impact: TEST-процесс, у которого потерялась явная строка `NODE_ENV`, но остались `TEST=true` и
лишний `VITEST=true`, стартует как production по валидированному config и отправляет настоящему
неразрешённому получателю. Для email одновременно не срабатывает DEV-проверка
`deliveryAdapter.ts:139`, поэтому непетлевой SMTP тоже может дойти до `sendMail`. Это прямое
нарушение п.5: TEST обязан выпускать только allowlisted recipient.

Оставлен падающий acceptance-test через публичную границу
`apps/integrator/src/shared/testDeliverySafety.test.ts` —
`an unset NODE_ENV cannot let deployed TEST bypass its recipient wall when VITEST leaks`.

### 2. В активном server-каноне осталась третья, противоположная редакция DEV-доставки

Точный поиск:

```bash
rg -n -i -e 'DEV[^\n]{0,100}(подавлен|no-op|не (?:уходит|отправ|шл))' -e '(подавлен|no-op|не (?:уходит|отправ|шл))[^\n]{0,100}DEV' -e 'development[^\n]{0,100}(delivery|достав|no-op)' AGENTS.md CLAUDE.md .cursor docs/ARCHITECTURE docs/RULES --glob '*.md' --glob '*.mdc'
```

Результат содержит конфликт: `docs/ARCHITECTURE/SERVER CONVENTIONS.md:183` утверждает
«В локальном DEV внешняя доставка подавлена целиком». Это противоречит `AGENTS.md` §1b.2 и
`LOCAL_DEV_AND_AGENT_TESTING.md` §5, где DEV-email разрешён только в петлевой SMTP. По §0
конфликтующая активная формулировка должна быть удалена тем же изменением.

### 3. Тест флагов раннера проверяет helper, а не выход delivery-цепочки

Новый сценарий `testDeliverySafety.test.ts:112-123` вызывает
`isTestDeployment`/`isLocalDevelopmentDeliverySuppressed` напрямую. Он не показывает, дошло ли
сообщение до адаптера, и не проверяет production-default при отсутствующем `NODE_ENV`. Реальный
fail-open из MUST FIX 1 поэтому сосуществует с зелёным тестом, названным как защита среды.

Это нарушает §10a «видно ли на ВЫХОДЕ из цепочки результат» и требование брифа проверять четыре
среды на delivery boundary. Oracle для замены уже задан п.5; самый дешёвый публичный слой —
`dispatchOutgoing`, как в оставленном acceptance-test.

### 4. Telegram дважды держится одним и тем же классом теста

`it.each` в `testDeliverySafety.test.ts:150-171` содержит `telegram`, а соседний сценарий
`testDeliverySafety.test.ts:173-216` ещё дважды проверяет тот же DEV Telegram no-send. Инъекция
`intendedChannel === 'email' || intendedChannel === 'telegram'` уронила одновременно оба теста:
`on DEV the telegram channel never reaches its adapter` и
`on DEV sends email only through loopback SMTP and always suppresses telegram` (`2 failed | 12
passed`). Это один класс поломки с двумя защитами, а не defense-in-depth; §10a запрещает
бессмысленный дубль. Параметризация `max/vk/smsc/web_push` сама по себе законна: каждый ряд
проверяет конечный внешний side effect по независимому oracle п.5.

## Матрица среды

Прогонялся настоящий `createDefaultDispatchPort().dispatchOutgoing()` с Telegram intent и
recording adapter. `R` — неразрешённый настоящий recipient `555000111`; `A` — allowlisted
recipient `700000001`; `да` означает, что intent дошёл до адаптера. Для DEV таблица относится к
непочтовому каналу: email намеренно доходит до `EmailDeliveryAdapter`, где `sendMail` разрешён
только для `127.0.0.1`, `::1`, `localhost`.

| `NODE_ENV` | `TEST` | `VITEST` | R до адаптера | A до адаптера | Классификация / законность |
| --- | --- | --- | --- | --- | --- |
| `production` | `true` | `true` | нет | да | TEST; законно, `VITEST` стену не снимает |
| `production` | `true` | не задан | нет | да | TEST; законно |
| `production` | `false` | `true` | да | да | production; законно, `VITEST` без `TEST` ничего не меняет |
| `production` | `false` | не задан | да | да | production; законно |
| `production` | не задан | `true` | да | да | production; законно |
| `production` | не задан | не задан | да | да | production; законно |
| `development` | `true` | `true` | нет | нет | DEV; законно, DEV решает раньше обоих флагов |
| `development` | `true` | не задан | нет | нет | DEV; законно |
| `development` | `false` | `true` | нет | нет | DEV; законно |
| `development` | `false` | не задан | нет | нет | DEV; законно |
| `development` | не задан | `true` | нет | нет | DEV; законно |
| `development` | не задан | не задан | нет | нет | DEV; законно |
| `test` | `true` | `true` | да | да | измеренный Vitest process; законно, адаптер тестовый |
| `test` | `true` | не задан | нет | да | TEST-like fail-closed; наружу не выпускает real recipient |
| `test` | `false` | `true` | да | да | test runner; законно |
| `test` | `false` | не задан | да | да | test process; законно |
| `test` | не задан | `true` | да | да | test runner; законно |
| `test` | не задан | не задан | да | да | test process; законно |
| не задан | `true` | `true` | **да** | да | **незаконно: config считает процесс production, TEST-стена снята** |
| не задан | `true` | не задан | нет | да | TEST-like fail-closed; законно |
| не задан | `false` | `true` | да | да | production-default (`env.ts:10`); законно |
| не задан | `false` | не задан | да | да | production-default; законно |
| не задан | не задан | `true` | да | да | production-default; законно |
| не задан | не задан | не задан | да | да | production-default; законно |

Точная команда одноразового матричного harness:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/integrator exec vitest --run src/shared/auditL5EnvironmentMatrix.test.ts --reporter=dot"
```

Результат: `1 passed`, `26 passed` — 24 клетки плюс отдельные проверки leaked
`VITEST_WORKER_ID` и raw `sms`. Harness удалён после чтения результата: это разовая матрица аудита,
а не ещё один постоянный список обстоятельств запуска.

## Production и `sms` / `smsc`

Production без `TEST` проверен через публичный dispatch: адаптер вызван один раз, recipient и
message равны исходным. Инъекция suppression уронила именно этот сценарий (`1 failed | 13
passed`), поэтому обратная опасность защищена.

Утверждение про `sms` требует уточнения границы. `sms` является публичным значением HTTP payload в
`relayOutboundRoute.ts:36`, но `buildIntent` в `relayOutboundRoute.ts:162-170` нормализует его в
`delivery.channels=['smsc']`. Raw `sms`, переданный непосредственно в `dispatchOutgoing`, был
отклонён `OUTBOUND_MESSAGE_POLICY_DENIED/channel_missing_or_unknown`; recording adapter получил
ноль вызовов. Следовательно, raw `sms` до delivery boundary не доезжает, а публичный HTTP-вход
законно доезжает уже как `smsc`; находки по этому пункту нет.

## Инъекции

Для каждой строки после подтверждения diff выполнялась одна команда:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/integrator exec vitest --run src/shared/testDeliverySafety.test.ts --reporter=dot"
```

| # | Инъекция | Покрасневшее наблюдаемое утверждение | Результат |
| ---: | --- | --- | --- |
| 1 | вернуть старое `TEST && !VITEST` | named TEST не становится production | `1 failed / 13 passed` |
| 2 | вернуть исключение `!VITEST_WORKER_ID` в DEV | leaked worker flag не снимает DEV wall | `1 failed / 13 passed` |
| 3 | пустой `TEST_ACCOUNT_EMAILS` означает allow | email без allowlist подавляется | `1 failed / 13 passed` |
| 4 | любой непустой SMTP host считается loopback | внешний SMTP подавляется до `sendMail` | `1 failed / 13 passed` |
| 5 | разрешить `max` рядом с DEV-email | MAX не достигает адаптера | `1 failed / 13 passed` |
| 6 | production возвращает `SUPPRESS` | исходный recipient/message доходят без изменений | `1 failed / 13 passed` |
| 7 | разрешить `telegram` рядом с DEV-email | оба дублирующих Telegram-сценария | `2 failed / 12 passed` |

Счёт по семи строкам таблицы: **инъекций 7, поймано 7, не поймано 0**. Файлов-отчётов о
непойманных нет, потому что непойманных инъекций нет. Все временные изменения production-кода
отменены через `apply_patch`; `git diff` по трём изменявшимся production-файлам после восстановления
пуст.

## Проверка тестов по §10a

- Новый сценарий отсутствующего `TEST_ACCOUNT_EMAILS` годен: oracle — п.5, дорогой молчаливый
  отказ — письмо настоящему получателю со стенда, выход — отсутствие вызова adapter.
- Параметризованные `max/vk/smsc/web_push` годны: это конечная граница side effect и четыре
  существующих канала owner-требования. Строка `telegram` вредно дублирует соседний сценарий —
  MUST FIX 4.
- Сценарий runner flags в текущем виде негоден: проверяет внутренние helper-результаты вместо
  delivery boundary и уже пропустил реальную fail-open клетку — MUST FIX 3.
- Автоматизированных UI-тестов в изменении нет.

## Финальная проверка восстановленного дерева

После отмены всех инъекций и добавления acceptance-test выполнено:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/integrator exec vitest --run src/shared/testDeliverySafety.test.ts --reporter=dot"
```

Ожидаемый результат дефекта: `1 failed | 14 passed (15)`. Единственный красный сценарий —
`an unset NODE_ENV cannot let deployed TEST bypass its recipient wall when VITEST leaks`; он
получил `{}` вместо `{ suppressedByEnvironment: true }`.

```bash
pnpm --dir apps/integrator exec tsc --noEmit
pnpm --dir apps/integrator exec eslint src/shared/testDeliverySafety.test.ts
```

Обе команды: exit `0`. Полный CI намеренно не запускался.

## ВОПРОСЫ ВЛАДЕЛЬЦУ

Нет. Все четыре находки имеют прямой authority в п.5 либо обязательном §0/§10a и не расширяют
scope.

## НЕ СДЕЛАНО

- Продуктовый код не исправлялся.
- PROD не читался и не изменялся; TEST runtime и его настройки не читались и не изменялись.
- DEV-БД, миграции и привилегии не затрагивались; preflight не применим.
- Живых отправок, второго Next-сервера и автоматических UI-тестов не было.
- Полный CI и `scripts/ci-record.mjs` не запускались.
- Строка вердикта в `feat` не записывалась; текст для ведущего:
  `FAIL — Л5 round 3: MUST FIX 4; NODE_ENV=<unset>, TEST=true, VITEST=true выпускает real recipient; активный SERVER CONVENTIONS противоречит §1b.2; runner-тест не проверяет delivery boundary; Telegram покрыт дублирующим тестом.`

# Независимый адверсарный аудит Л5 — круг 2

Дата: 2026-09-15. Предмет: коммит `3e8cf266451c0a4dd778852618f972a3f076a697`
в ветке `wt/dev-mail-trap`. Оракул: `docs/_TODO/LEADS_AND_COMMUNICATION_VISIBILITY_2026-09-14.md`,
«Очередь до цели», пункт 5 (Л5).

## ВЕРДИКТ: FAIL — MUST FIX 4

Обе известные инъекции первого аудита новый сценарий ловит. Однако четыре независимых класса
остались непойманными: пустой `TEST_ACCOUNT_EMAILS`, ещё один не-email канал на DEV, `VITEST=true`
в production-like TEST-процессе и `VITEST_WORKER_ID` в DEV-процессе. Последние два — не только дыра
теста: на текущем коде они реально отключают соответствующую стену среды. Кроме того, правка
`AGENTS.md` §1b.2 оставила две активные противоположные формулировки.

Итоговый счёт: **6 инъекций; 2 пойманы существующими тестами; 4 не пойманы**. Для каждой непойманной
ниже указан раздел этого файла-отчёта.

## MUST FIX

### MUST FIX 1 — runner-флаги отключают стены развёрнутых DEV/TEST

Нарушено требование Л5: на TEST до адаптера проходят только разрешённые получатели, на DEV наружу
может пройти только email и только к петлевому SMTP. Текущий классификатор делает обратное:

- `apps/integrator/src/shared/testDeliverySafety.ts:48-50`: `VITEST=true` превращает
  `NODE_ENV=production, TEST=true` в production-путь;
- `apps/integrator/src/shared/testDeliverySafety.ts:52-56`: наличие `VITEST_WORKER_ID` выключает
  DEV-suppression при `NODE_ENV=development`;
- `apps/integrator/src/shared/testDeliverySafety.test.ts:112-125` закрепляет эти обстоятельства
  запуска как ожидаемый внутренний контракт, хотя §10a запрещает тестировать обстоятельства запуска.

Достижимое последствие: лишний env-флаг в process environment выпускает неразрешённое TEST-письмо
или DEV SMS/Telegram/Web Push до provider adapter. Это дорогой молчаливый отказ границы доставки.
Исправление обязано различать процесс тест-раннера и развёрнутую среду так, чтобы runner-флаг никогда
не ослаблял явно названные `NODE_ENV=production, TEST=true` и `NODE_ENV=development`.

Доказательство — инъекции E и F в разделе «Инъекции».

### MUST FIX 2 — отсутствующий `TEST_ACCOUNT_EMAILS` не защищён тестом

Текущий код fail-closed (`testDeliverySafety.ts:105-108`), но правдоподобная email-only подмена
«пустой список означает разрешить» оставляет **весь набор integrator зелёным: 698/698**. Соседний
сценарий `TEST fails closed when account env is absent` проверяет только Telegram; новый сценарий
email всегда вызывает `configureTestAccounts()`.

Последствие: после такой регрессии стенд при пропавшем deploy-owned `TEST_ACCOUNT_EMAILS` начнёт
молча передавать произвольные письма адаптеру. Нужен один поведенческий сценарий через публичный
`dispatchOutgoing`: `NODE_ENV=production`, `TEST=true`, `TEST_ACCOUNT_EMAILS` отсутствует/пуст,
email не из списка → suppression и ноль вызовов внешней границы.

Доказательство — инъекция C. Файл-отчёт непойманной:
`docs/_TODO/AUDIT_L5_ROUND2_2026-09-15.md`, раздел «Инъекция C».

### MUST FIX 3 — «остальные каналы на DEV молчат» проверено только на Telegram

Пункт Л5 требует заглушить на DEV все каналы, кроме email. Сценарий
`on DEV sends email only through loopback SMTP and always suppresses telegram` проверяет ровно
Telegram. Подмена, выпускающая `smsc` рядом с `email`, оставляет **весь набор integrator зелёным:
698/698**.

Последствие: реальный SMS/другой внешний side effect из DEV при случайном расширении исключения.
Нужна компактная типизированная проверка каждого поддержанного не-email канала через публичный
`dispatchOutgoing` (`telegram`, `max`, `smsc`, `web_push`; `sms` — алиас той же SMS-ветки, если он
остаётся публично допустимым входом) с наблюдением suppression и отсутствия вызова адаптера.

Доказательство — инъекция D. Файл-отчёт непойманной:
`docs/_TODO/AUDIT_L5_ROUND2_2026-09-15.md`, раздел «Инъекция D».

### MUST FIX 4 — коррекция канона оставила две активные противоположные редакции

Новая строка `AGENTS.md:595` сама по себе описывает штатное поведение кода: все DEV-каналы no-op,
кроме email к `127.0.0.1`, `::1` или `localhost`; `deliveryAdapter.ts:125-145` проверяет уже
разрешённый clinic/platform SMTP перед `sendMail`.

Но в том же каноническом файле `AGENTS.md:561-563` по-прежнему сказано: «локальный DEV подавляет
внешнюю отправку целиком». Второй активный operational-документ повторяет это в
`docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md:258`. Это противоречит §1b.2 и реальному Mailpit-пути.
`AGENTS.md` §0 пп. 3-5 требует удалить конфликтующие активные редакции и оставить во вторичных
документах ссылку, а не отдельный пересказ.

Точная команда, которой найдено расхождение:

```bash
rg -n -i -e 'локальн(ый|ого) DEV.*подавл' -e 'DEV.*подавл.*целиком' -e 'development.*no-op' -e 'development.*доставк' -e 'development.*delivery' -e 'петлев.*SMTP' AGENTS.md CLAUDE.md .cursor docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md README.md apps/integrator/src
```

Результат в активных инструкциях: `AGENTS.md:561`, `AGENTS.md:595`,
`docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md:258`. Поэтому утверждение correction-report
«единственное нормативное совпадение — новая строка» неверно.

## Классификация и оценка нового теста по §10a/§10b

- Поведение DEV/TEST/production — повторяемое, проверялось тестом и fault/input injection.
- Состояние §1b.2 и активных дублей — качество разового действия, проверялось чтением и точным `rg`;
  тест текста не создавался.
- Новый сценарий `TEST suppresses a non-allowlisted email recipient before the adapter` **не
  дублирует** Telegram-сценарий: он закрывает отдельный channel-specific обход, который первый аудит
  воспроизвёл двумя инъекциями.
- Oracle независим: пункт Л5 требует TEST allowlist; дорогой молчаливый отказ — передача письма
  постороннему получателю; конечное наблюдаемое следствие проверяется на публичной границе
  `dispatchOutgoing` по результату suppression и отсутствию вызова provider adapter.
- Тест не фиксирует текст, DTO или порядок внутренних вызовов и входит в обычный Vitest-набор
  integrator. По линейке владельца он полезен, но недостаточен для двух соседних классов C/D.

## Инъекции: 6 всего, 2 пойманы, 4 не пойманы

Для A-F использовалась одна точная команда целевого файла:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/integrator exec vitest run src/shared/testDeliverySafety.test.ts"
```

### Инъекция A — ПОЙМАНА

В `dispatchPort.ts` строка

```ts
if (intendedChannel === 'email') return intent;
```

временно вынесена из `if (isLocalDevelopmentDeliverySuppressed())` перед ним. Результат:
`1 failed | 8 passed (9)`; покраснел новый сценарий, получив `{}` вместо suppression.

### Инъекция B — ПОЙМАНА

TEST-стена временно заменена дословно на:

```ts
if (
  intendedChannel !== 'email' &&
  !isTestDeliveryRecipientAllowed(intendedChannel, recipient)
) {
```

Результат: `1 failed | 8 passed (9)`; покраснел новый сценарий.

### Инъекция C — НЕ ПОЙМАНА: пустой email allowlist стал allow-all

В `testDeliverySafety.ts` email-ветка временно заменена дословно на:

```ts
return identifiers.emails.size === 0 ||
  (value !== null && identifiers.emails.has(normalizeEmail(value)));
```

Целевой файл остался зелёным: `9 passed (9)`. Проверка всего integrator:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/integrator test"
```

Результат: `Test Files 127 passed | 2 skipped (129)`,
`Tests 698 passed | 2 expected fail | 2 skipped (702)`.

Для доказательства последствия временно добавлен audit-сценарий с
`NODE_ENV=production`, `TEST=true`, отсутствующим `TEST_ACCOUNT_EMAILS` и email
`outside@example.org`. Та же целевая команда дала `1 failed | 9 passed (10)`: адаптер был достигнут,
получен `{}` вместо suppression. Audit-сценарий и мутация удалены.

Файл-отчёт непойманной: `docs/_TODO/AUDIT_L5_ROUND2_2026-09-15.md`, этот раздел.

### Инъекция D — НЕ ПОЙМАНА: DEV выпускает SMSC рядом с email

DEV-исключение временно заменено дословно на:

```ts
if (intendedChannel === 'email' || intendedChannel === 'smsc') return intent;
```

Целевой файл остался зелёным: `9 passed (9)`. Та же команда всего integrator дала:
`Test Files 127 passed | 2 skipped (129)`,
`Tests 698 passed | 2 expected fail | 2 skipped (702)`.

Временный audit-сценарий `NODE_ENV=development`, канал `smsc` дал
`1 failed | 9 passed (10)`: адаптер был достигнут и вернул `{}` вместо suppression. Audit-сценарий
и мутация удалены.

Файл-отчёт непойманной: `docs/_TODO/AUDIT_L5_ROUND2_2026-09-15.md`, этот раздел.

### Инъекция E — НЕ ПОЙМАНА: `VITEST=true` в развёрнутом TEST

Без изменения production-кода временно добавлен audit-сценарий:

```ts
process.env.NODE_ENV = 'production';
process.env.TEST = 'true';
process.env.VITEST = 'true';
// configured allowlist; recipient = outside@example.org
```

Та же целевая команда дала `1 failed | 9 passed (10)`: неразрешённый email достиг адаптера и вернул
`{}`. Исходные 9 тестов зелёные и отдельным unit-утверждением требуют именно отключить TEST-гейт при
`VITEST=true`; поэтому защита не просто отсутствует, а инвертирована. Audit-сценарий удалён.

Файл-отчёт непойманной: `docs/_TODO/AUDIT_L5_ROUND2_2026-09-15.md`, этот раздел.

### Инъекция F — НЕ ПОЙМАНА: `VITEST_WORKER_ID` в развёрнутом DEV

Без изменения production-кода временно добавлен audit-сценарий:

```ts
process.env.NODE_ENV = 'development';
process.env.VITEST_WORKER_ID = '1';
// channel = smsc
```

Та же целевая команда дала `1 failed | 9 passed (10)`: SMSC достиг адаптера и вернул `{}` вместо
suppression. Исходные 9 тестов зелёные и отдельным unit-утверждением требуют отключить DEV-гейт при
`VITEST_WORKER_ID`. Audit-сценарий удалён.

Файл-отчёт непойманной: `docs/_TODO/AUDIT_L5_ROUND2_2026-09-15.md`, этот раздел.

## Ветка production — исполнение

Временный audit-сценарий использовал настоящий `createDefaultDispatchPort` и
`createEmailDeliveryAdapter`, внешний SMTP-host `smtp.external.example`, а `sendMail` подменял только
на сетевой границе. Он последовательно выполнил `NODE_ENV=production` с `TEST` отсутствующим и с
`TEST=false`; оба раза получил `{}`, два вызова `sendMail` и два подтверждения provider delivery.

Точная команда:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/integrator exec vitest run src/shared/testDeliverySafety.test.ts"
```

Результат с временным сценарием: `Test Files 1 passed (1)`, `Tests 10 passed (10)`. Сценарий удалён.
Это подтверждает прежнее production-поведение для обеих требуемых форм `TEST` — absent и false.

## Итоговая проверка восстановленного candidate

Все временные product/test-инъекции отменены. Проверка восстановления:

```bash
git diff --exit-code -- apps/integrator/src/infra/adapters/dispatchPort.ts apps/integrator/src/shared/testDeliverySafety.ts apps/integrator/src/shared/testDeliverySafety.test.ts apps/integrator/src/integrations/email/deliveryAdapter.ts
```

Результат: exit `0`.

Чистый целевой набор после восстановления:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/integrator exec vitest run src/shared/testDeliverySafety.test.ts src/infra/adapters/dispatchPort.test.ts src/integrations/email/deliveryAdapter.unit.test.ts src/infra/runtime/worker/outgoingDeliveryWorker.reminderGeneration.d21.test.ts"
```

Результат: `Test Files 4 passed (4)`, `Tests 53 passed (53)`.

## ВОПРОСЫ ВЛАДЕЛЬЦУ

Нет. Все MUST FIX следуют из дословного пункта Л5 и обязательных §0/§10a/§10b.

`NODE_ENV` отсутствующий при `TEST=true` не создаёт отдельной находки: текущий TEST-гейт определяется
`TEST=true` и остаётся fail-closed. При одновременно отсутствующих/false `TEST` и отсутствующем
`NODE_ENV` код идёт по production-пути, но §1 задаёт для DEV обязательный `NODE_ENV=development`, а
бриф требует неизменность production только при `NODE_ENV=production`; расширять authority не стал.

## НЕ СДЕЛАНО

- Продуктовый код и существующие тесты не исправлялись; оставлен только этот audit-artifact.
- PROD не читался и не изменялся.
- Настройки и runtime TEST не читались и не изменялись.
- DEV-БД не читалась и не изменялась; миграции не применялись, preflight не требовался.
- Полный CI, `scripts/ci-record.mjs`, автоматические UI-тесты и второй Next-сервер не запускались.
- Строка вердикта в `feat` не записывалась.

## Строка вердикта для ведущего

`FAIL — Л5 круг 2: 6 инъекций, 2 пойманы и 4 не пойманы; TEST/DEV стены отключаются runner-флагами, тест не держит пустой TEST_ACCOUNT_EMAILS и другие DEV-каналы, а канон сохраняет две противоположные активные редакции.`

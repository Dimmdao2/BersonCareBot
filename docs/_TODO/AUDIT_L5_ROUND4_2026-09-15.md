Классификация по §24.4: **тест** — меняется повторяемое поведение процесса доставки, поэтому findings принимаются только по наблюдаемому выходу `createDefaultDispatchPort().dispatchOutgoing()`; отдельная проверка согласованности активного канона классифицирована как разовое состояние по §0.

# Независимый аудит Л5, круг 5

Дата: 2026-09-15. Candidate: `5579c12c0` поверх `3e65e46ab` и `b9efbc254`, ветка
`wt/dev-mail-trap`. Имя файла сохранено ровно по brief ведущего.

Authority: `docs/_TODO/LEADS_AND_COMMUNICATION_VISIBILITY_2026-09-14.md`, «Очередь до цели»,
пункт 5 (Л5), и обязательные `AGENTS.md` §0, §1b.2, §10a, §10b, §24.

## Вердикт

**FAIL. MUST FIX 1.** Исполняемая коррекция проходит матрицу среды и тестовую линейку:
отсутствующий `NODE_ENV` не открывает стену TEST; положительно опознанный Vitest-runner
(`NODE_ENV=test`, `VITEST=true`) остаётся рабочим; DEV выпускает только email к петлевой SMTP-
границе; TEST пропускает исходного allowlisted recipient без редиректа; production без `TEST`
не заглушён. После снятия параметризованного email-ряда обе стороны почтовой стены сохранились,
и каждая точечная поломка красит ровно один сценарий. Полный integrator-набор зелёный.

Гейт не проходит из-за активной документации: канон уведомлений всё ещё одновременно требует
DEV-allowlist `TEST_ACCOUNT_*` и разрешает аварийным алертам обход dev-фильтра. Оба требования
противоречат более новой §1b.2 и пункту Л5, где DEV-email не зависит от `TEST_ACCOUNT_EMAILS`, а
все непочтовые каналы DEV заглушены без исключения по классу сообщения.

## MUST FIX

1. **Удалить несовместимую DEV-редакцию из активного канона уведомлений и его реестра.**

   Достижимый сценарий 1: исполнитель следует активному
   `docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md:601-605` и применяет `TEST_ACCOUNT_*` к DEV-email.
   Тогда письмо на адрес живой заявки, которого намеренно нет в DEV allowlist, не доходит даже до
   петлевого Mailpit — ровно исходный разрыв Л5. Инъекция этого правила в pre-fork gate уронила
   наблюдаемое утверждение `on DEV email reaches the network boundary only through loopback SMTP`:
   `1 failed | 18 passed`; цепочка вернула `{ suppressedByEnvironment: true }` вместо вызова
   email-адаптера.

   Достижимый сценарий 2: исполнитель следует
   `docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md:817-845` и
   `docs/CURRENT_AUTHORITY_MAP.md:59`, где аварийный алерт идёт «мимо dev-фильтра». Тестовые intents
   имеют `outboundCapability=operator_alert`; точная инъекция исключения для operator-alert
   Telegram уронила наблюдаемое утверждение `на DEV протёкший VITEST_WORKER_ID стену не снимает`:
   `1 failed | 18 passed`, настоящий `{ chatId: 555000111 }` дошёл до адаптера.

   Нарушенное требование: `AGENTS.md` §0 требует при новой редакции удалить конфликтующие активные
   формулировки, а §1b.2 и Л5 требуют ровно одного DEV-исключения — email к loopback SMTP, без
   `TEST_ACCOUNT_EMAILS`; остальные каналы остаются no-op. `CURRENT_AUTHORITY_MAP.md:59` прямо
   объявляет `OWNER_PRODUCT_RULES.md` источником уведомлений, поэтому это активный конфликт, не
   историческая цитата. Исправление должно согласовать §23, §28 и строку реестра с §1b.2, не менять
   уже правильный product-код и тесты.

## Матрица среды через настоящий dispatch

Одноразовый harness вызывал настоящий `createDefaultDispatchPort().dispatchOutgoing()` дважды в
каждой клетке с Telegram intent и recording adapter. `R` — настоящий неразрешённый recipient
`555000111`; `A` — allowlisted recipient `700000001`; «да» означает, что именно исходный recipient
дошёл до адаптера.

Точная команда:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/integrator exec vitest --run src/shared/auditL5Round5EnvironmentMatrix.test.ts --reporter=verbose"
```

Результат команды: `1 passed` файл, `24 passed` теста. Harness после чтения результата удалён: по
§10a постоянный тест полной таблицы обстоятельств запуска не нужен.

| `NODE_ENV` | `TEST` | `VITEST` | R до адаптера | A до адаптера | Результат |
| --- | --- | --- | --- | --- | --- |
| `production` | `true` | `true` | нет | да | TEST-стена не снята лишним `VITEST` |
| `production` | `true` | не задан | нет | да | TEST |
| `production` | `false` | `true` | да | да | production |
| `production` | `false` | не задан | да | да | production |
| `production` | не задан | `true` | да | да | production |
| `production` | не задан | не задан | да | да | production |
| `development` | `true` | `true` | нет | нет | DEV решает раньше TEST/VITEST |
| `development` | `true` | не задан | нет | нет | DEV |
| `development` | `false` | `true` | нет | нет | DEV |
| `development` | `false` | не задан | нет | нет | DEV |
| `development` | не задан | `true` | нет | нет | DEV |
| `development` | не задан | не задан | нет | нет | DEV |
| `test` | `true` | `true` | да | да | положительно опознанный Vitest-runner |
| `test` | `true` | не задан | нет | да | TEST-like процесс fail-closed |
| `test` | `false` | `true` | да | да | test process без TEST-стенда |
| `test` | `false` | не задан | да | да | test process без TEST-стенда |
| `test` | не задан | `true` | да | да | test runner без TEST-стенда |
| `test` | не задан | не задан | да | да | test process без TEST-стенда |
| не задан | `true` | `true` | **нет** | да | потерянный `NODE_ENV` не снимает TEST-стену |
| не задан | `true` | не задан | нет | да | TEST-like процесс fail-closed |
| не задан | `false` | `true` | да | да | production-default |
| не задан | `false` | не задан | да | да | production-default |
| не задан | не задан | `true` | да | да | production-default |
| не задан | не задан | не задан | да | да | production-default |

DEV-email проверен постоянным сценарием через настоящий dispatch и `EmailDeliveryAdapter`: при
`127.0.0.1` `sendMail` вызван один раз; после подмены разрешённого SMTP на
`smtp.external.example` цепочка вернула
`development_non_loopback_smtp_host`, нового сетевого вызова не было.

## Инъекции

Каждая строка прогонялась одной и той же точной командой целевого набора:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/integrator exec vitest --run src/shared/testDeliverySafety.test.ts --reporter=dot"
```

| # | Внесено | Поймано наблюдаемым выходом | Не поймано |
| ---: | --- | --- | ---: |
| 1 | При `NODE_ENV` unset + `TEST=true` доверять одному `VITEST` и снять TEST-стену | `стенд TEST, потерявший строку NODE_ENV, тоже не открывается`: `1 failed / 18 passed`; R дошёл до адаптера | 0 |
| 2 | Любой `TEST=true` считать стендом, включая собственный Vitest-runner | `собственный процесс раннера стендом не является и доставку не глушит`: `1 failed / 18 passed`; ожидаемый R не дошёл | 0 |
| 3 | TEST-email сверять с `TEST_ACCOUNT_MAX_IDS` | `TEST delivers an allowlisted recipient unchanged`: `1 failed / 18 passed`; разрешённое письмо не дошло | 0 |
| 4 | Разрешить конкретный посторонний TEST-email | `TEST suppresses a non-allowlisted email recipient before the adapter`: `1 failed / 18 passed`; постороннее письмо дошло | 0 |
| 5 | Разрешить Telegram рядом с DEV-email | `на DEV протёкший VITEST_WORKER_ID стену не снимает`: `1 failed / 18 passed`; R дошёл | 0 |
| 6 | Снять отказ для непетлевого DEV SMTP | `on DEV email reaches the network boundary only through loopback SMTP`: `1 failed / 18 passed`; внешний SMTP вернул успешный dispatch | 0 |
| 7 | TEST-MAX сверять с Telegram allowlist | `on TEST the max channel admits only its own list`: `1 failed / 18 passed`; чужой recipient дошёл | 0 |
| 8 | Вернуть из активного §23 TEST-account allowlist на DEV-email | DEV-email/loopback-сценарий: `1 failed / 18 passed`; цепочка заглушена до адаптера | 0 |
| 9 | По активному §28 пропустить operator-alert Telegram мимо DEV-стены | DEV/VITEST_WORKER_ID-сценарий: `1 failed / 18 passed`; R дошёл | 0 |

Итого по точной таблице: **команда выше выполнена с 9 инъекциями; поймано 9, не поймано 0**.
Строки 5 и 9 различают общий channel-bypass и отдельный message-class bypass: это разные ветви,
которые допускают разные активные формулировки. Каждая инъекция красит ровно один сценарий; после
снятия email-ряда дублей с двумя красными сценариями нет. Все временные production-изменения
восстановлены через `apply_patch`.

## Годность тестов по §10a / §10b

- Все изменённые сценарии подают intent в публичный `dispatchOutgoing()` и проверяют конечный side
  effect адаптера либо его отсутствие; helper-результаты и текст production-кода не читаются.
- Email исключён из параметризованного TEST-ряда. Allow-сторону держит один сценарий с проверкой
  неизменённых recipient/message; deny-сторону — один сценарий отсутствия adapter side effect.
  Инъекции 3 и 4 красят их раздельно и по одному.
- Telegram отсутствует в общей DEV-таблице; его единственную DEV-клетку держит средовой ряд с
  `VITEST_WORKER_ID`. Инъекции 5 и 9 красят этот один наблюдаемый сценарий.
- `max`, `vk`, `smsc`, `web_push` имеют разные channel/list решения. Инъекция 7 красит только MAX.
- Соседний `dispatchPort.test.ts` сценарий clinic credential probe не является дублем: его конечный
  эффект — исключение `CLINIC_CHANNEL_PROBE_SUPPRESSED` вместо ложного «канал доставляет», тогда как
  Л5 проверяет утечку исходного recipient к адаптеру.
- Точный поиск проверок текста в изменённом файле выполнен командой:

  ```bash
  rg -n "readFile|readFileSync|toContain\\(|indexOf\\(|match\\(/|source.*text|\\.sql" apps/integrator/src/shared/testDeliverySafety.test.ts
  ```

  Результат: exit `1`, строк нет. Автоматизированных UI-тестов в candidate нет.

## Активные формулировки §0

Поиск выполнен тремя способами.

Лексический индекс:

```bash
node /home/dev/brain/tools/code-search.mjs "development delivery all external channels suppressed email loopback" --repo bcb -k 30
```

Он вернул действующие `dispatchPort.ts`, `testDeliverySafety.ts`, тесты и соседние документы.

Смысловой поиск:

```bash
bash /home/dev/brain/tools/codeq.sh "active documentation says local development suppresses every external delivery including email" --repo bcb --k 20 --semantic
```

Он сообщил `coverage=0% (вектор вес 0.00)` и дал lexical fallback без надёжного ответа, поэтому
результат не использован как доказательство пустоты.

Точный широкий поиск активных документов:

```bash
rg -n -i 'DEV[^\n]{0,180}(достав|отправ|почт|email|SMTP|канал)|development[^\n]{0,180}(delivery|send|email|SMTP|channel)' AGENTS.md CLAUDE.md .cursor/rules docs/ARCHITECTURE docs/RULES --glob '*.md' --glob '*.mdc'
```

Он подтвердил согласованные `AGENTS.md:561`, `AGENTS.md:597`,
`SERVER CONVENTIONS.md:183`, `LOCAL_DEV_AND_AGENT_TESTING.md:258`, а также нашёл конфликтующие
активные `OWNER_PRODUCT_RULES.md:601-605`, `:817-845`. `DOCTOR_BROADCASTS.md:3` сам помечен
`SUPERSEDED AS NOTIFICATION POLICY` и finding не является.

Обратные ссылки:

```bash
rg -n 'OWNER_PRODUCT_RULES|SERVER CONVENTIONS|LOCAL_DEV_AND_AGENT_TESTING|testDeliverySafety|Изоляция отправок' README.md docs/README.md docs/CURRENT_AUTHORITY_MAP.md docs/_TODO/LEADS_AND_COMMUNICATION_VISIBILITY_2026-09-14.md
```

`CURRENT_AUTHORITY_MAP.md:59` не только объявляет `OWNER_PRODUCT_RULES.md` единственным источником
уведомлений, но и сам повторяет конфликт «мимо dev-фильтра». Поэтому MUST FIX 1 доказан точным
поиском, смысловым поиском и реестровой обратной ссылкой.

## Проверки восстановленного candidate

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/integrator exec vitest --run src/shared/testDeliverySafety.test.ts --reporter=dot"
```

Результат после коррекции и до инъекций: `1 passed` файл, `19 passed` тестов.

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm test"
```

Результат после удаления временного harness и восстановления всех инъекций:
`127 passed | 2 skipped` файлов; `708 passed | 2 expected fail | 2 skipped` тестов. Fail-closed
редакция не сломала тесты integrator вне целевого файла.

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/integrator exec tsc --noEmit && pnpm --dir apps/integrator exec eslint src/shared/testDeliverySafety.ts src/shared/testDeliverySafety.test.ts src/infra/adapters/dispatchPort.ts src/integrations/email/deliveryAdapter.ts"
```

Результат: exit `0`.

```bash
git diff -- apps/integrator/src/shared/testDeliverySafety.ts apps/integrator/src/shared/testDeliverySafety.test.ts apps/integrator/src/infra/adapters/dispatchPort.ts apps/integrator/src/integrations/email/deliveryAdapter.ts
```

Результат после инъекций: строк нет; production-код и постоянные тесты восстановлены.

```bash
git diff --name-only c42d48776..HEAD | rg '(^|/)migrations?/|\.sql$'
```

Результат: exit `1`, строк нет; миграций и прав в candidate нет, rollback-only preflight не применим.

## ВОПРОСЫ ВЛАДЕЛЬЦУ

Нет. MUST FIX 1 прямо следует из обязательного §0, §1b.2 и более нового решения Л5; продуктового
выбора для исправления активных дублей не требуется.

## НЕ СДЕЛАНО

- Продуктовый код и постоянные тесты аудитором не исправлялись.
- Конфликтующие активные документы не исправлялись: это correction для ведущего, а не продуктовый
  fix аудитора.
- PROD не читался, не изменялся и не проверялся; TEST runtime и его настройки не читались и не
  изменялись.
- DEV/TEST БД, миграции и привилегии не затрагивались; preflight не запускался.
- Живых отправок, второго Next-сервера и автоматических UI-тестов не было.
- Полный CI не запускался по прямому запрету brief.
- Строка вердикта в `feat` не записывалась. Текст ведущему:
  `FAIL — Л5 round 5: исполняемая матрица и полный integrator-набор зелёные, email-дубль снят без потери защиты; MUST FIX 1 — активные OWNER_PRODUCT_RULES §23/§28 и CURRENT_AUTHORITY_MAP всё ещё требуют DEV allowlist и обход dev-фильтра, что противоречит §1b.2 и Л5.`

Классификация по §24.4: **тест** — меняется повторяемое поведение процесса доставки, поэтому вывод принимается по наблюдаемому выходу `createDefaultDispatchPort().dispatchOutgoing()`.

# Независимый аудит Л5, круг 4

Дата: 2026-09-15. Candidate: `3e65e46ab` поверх `b9efbc254`, ветка `wt/dev-mail-trap`.
Authority: `docs/_TODO/LEADS_AND_COMMUNICATION_VISIBILITY_2026-09-14.md`, «Очередь до цели»,
пункт 5 (Л5), и обязательные `AGENTS.md` §0, §1b.2, §10a, §10b, §24.

## Вердикт

**FAIL. MUST FIX 1.** Продуктовая коррекция проходит матрицу среды: отсутствующий `NODE_ENV`
не открывает стену TEST; положительно опознанный Vitest-runner (`NODE_ENV=test`, `VITEST=true`)
остаётся рабочим; DEV выпускает к сетевой границе только email, где непетлевой SMTP гасится;
TEST пропускает allowlisted recipient неизменённым; production без `TEST` не заглушён. Полный
integrator-набор также зелёный. Но параметризованный TEST-ряд `email` повторяет уже существующий
standalone-сценарий allowlisted email на той же публичной границе: одна точечная поломка красит оба.

## MUST FIX

1. **Убрать дублирующую TEST-email клетку одного класса.**

   Достижимая поломка: ветка `email` в `isTestDeliveryRecipientAllowed()` начинает сверять адрес
   с чужим `TEST_ACCOUNT_MAX_IDS`, поэтому разрешённое TEST-письмо молча не доходит до адаптера.
   Инъекция была внесена в production-код заменой `identifiers.emails` на
   `identifiers.maxIds`. На одном и том же выходе `dispatchOutgoing()` покраснели сразу два
   сценария:

   - `TEST delivers an allowlisted recipient unchanged`;
   - `on TEST the email channel admits only its own list`.

   Точная команда:

   ```bash
   /home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/integrator exec vitest --run src/shared/testDeliverySafety.test.ts --reporter=dot"
   ```

   Наблюдаемый результат: `2 failed | 18 passed (20)`; в обоих случаях recording adapter получил
   `[]` вместо исходного `{ email: 'owner@example.org' }`. Это один класс решения, один публичный
   слой и один side effect, а не defense-in-depth. Standalone-сценарий дополнительно проверяет
   неизменность recipient/message, поэтому полезный oracle остаётся там; общий ряд `email`
   дублирует его и нарушает §10a «один сценарий не размножается» / §10b «fault injection один раз
   на независимый класс». Минимальная коррекция — исключить `email` из параметризованного списка,
   как уже сделано для `telegram`; точный способ выбирает исполнитель.

## Матрица среды через настоящий dispatch

Одноразовый harness вызывал настоящий `createDefaultDispatchPort().dispatchOutgoing()` с Telegram
intent и recording adapter. `R` — настоящий неразрешённый recipient `555000111`; `A` — allowlisted
recipient `700000001`; «да» означает, что именно этот исходный recipient дошёл до адаптера.
Для DEV это проверка непочтового канала; email отдельно проходит через настоящий
`EmailDeliveryAdapter`, который разрешает `sendMail` только для `127.0.0.1`, `::1`, `localhost`.

Точная команда:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/integrator exec vitest --run src/shared/auditL5Round4EnvironmentMatrix.test.ts --reporter=verbose"
```

Результат команды: `1 passed` файл, `25 passed` тестов — 24 клетки и контроль полноты. Harness
после чтения вывода удалён: постоянный тест обстоятельств запуска по §10a не нужен.

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
| `test` | `true` | не задан | нет | да | сомнительный TEST-like процесс fail-closed |
| `test` | `false` | `true` | да | да | test process без TEST-стенда |
| `test` | `false` | не задан | да | да | test process без TEST-стенда |
| `test` | не задан | `true` | да | да | test runner без TEST-стенда |
| `test` | не задан | не задан | да | да | test process без TEST-стенда |
| не задан | `true` | `true` | **нет** | да | потерянный `NODE_ENV` не снимает TEST-стену |
| не задан | `true` | не задан | нет | да | TEST-like fail-closed |
| не задан | `false` | `true` | да | да | production-default |
| не задан | `false` | не задан | да | да | production-default |
| не задан | не задан | `true` | да | да | production-default |
| не задан | не задан | не задан | да | да | production-default |

Соседняя клетка `NODE_ENV=development`, `TEST=true`, `VITEST_WORKER_ID=1` проверена постоянным
сценарием: recipient до адаптера не дошёл. Инъекция разрешения Telegram на DEV уронила только этот
сценарий (`1 failed | 19 passed`). DEV-email с петлевым SMTP вызвал `sendMail` один раз; после
подмены хоста на `smtp.external.example` цепочка вернула
`development_non_loopback_smtp_host`, а второго сетевого вызова не было.

## Инъекции

Каждая строка прогонялась одной и той же точной командой целевого набора:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/integrator exec vitest --run src/shared/testDeliverySafety.test.ts --reporter=dot"
```

| # | Внесено | Поймано наблюдаемым выходом | Не поймано |
| ---: | --- | --- | --- |
| 1 | Возвращён прежний fallback: вне явно `production/development` доверять одному `!VITEST` | `стенд TEST, потерявший строку NODE_ENV, тоже не открывается`: `1 failed / 19 passed` | 0 |
| 2 | Любой `TEST=true` объявлен стендом, исключение собственного runner удалено | `собственный процесс раннера стендом не является`: `1 failed / 19 passed` | 0 |
| 3 | DEV-гейт разрешает `telegram` рядом с `email` | `на DEV протёкший VITEST_WORKER_ID стену не снимает`: `1 failed / 19 passed` | 0 |
| 4 | MAX сверяется с `TEST_ACCOUNT_TELEGRAM_IDS` | `on TEST the max channel admits only its own list`: `1 failed / 19 passed` | 0 |
| 5 | Email сверяется с `TEST_ACCOUNT_MAX_IDS` | **два сценария**: standalone allowlisted email и параметризованный email-ряд, `2 failed / 18 passed` — MUST FIX 1 | 0 |

Итого по точной таблице выше: **5 инъекций, 5 поймано, 0 не поймано**. У последней инъекции
два красных сценария вместо одного — это доказательство дублирования, а не дополнительная защита.
Все временные изменения production-кода восстановлены текстовыми patch; финальный `git diff --check`
до создания этого отчёта не вывел ошибок, `git status --short` был пуст.

## Проверка тестов по §10a / §10b

- Исправленные четыре ряда среды проверяют конечный side effect адаптера, не helper.
- Telegram отсутствует в общей DEV-таблице каналов и держится ровно одним сценарием leaked
  `VITEST_WORKER_ID`; инъекция №3 красит один тест.
- Удалённый сценарий «TEST suppresses a real recipient instead of redirecting it» не нужен:
  отсутствие adapter side effect уже наблюдается в TEST-матрице каналов.
- Ряды `max`, `vk`, `smsc`, `web_push` имеют собственные channel/list решения и не дублируют друг
  друга. Инъекция MAX→Telegram красит один ряд.
- Ряд `email` дублирует standalone allowlisted-email путь — MUST FIX 1.
- В изменённом тесте нет чтения текста production-кода, внутренних helper-assertions и UI-проверок.

## Активные формулировки §0

Точный поиск:

```bash
rg -n -i -e 'DEV[^\n]{0,120}(подавлен|no-op|не (?:уходит|отправ|шл))' -e '(подавлен|no-op|не (?:уходит|отправ|шл))[^\n]{0,120}DEV' -e 'development[^\n]{0,120}(delivery|достав|no-op|send)' AGENTS.md CLAUDE.md .cursor docs/ARCHITECTURE docs/RULES --glob '*.md' --glob '*.mdc'
```

В активном каноне найдены согласованные редакции: `AGENTS.md:597` разрешает только email в
loopback SMTP, `docs/ARCHITECTURE/SERVER CONVENTIONS.md:183` говорит «ничего, кроме письма в
петлевой SMTP-приёмник». Старое «подавлена целиком» встречается только как процитированная
историческая находка в `AUDIT_L5_ROUND3_2026-09-15.md`; по §0 audit record не переписывается.

Лексический `code-search` и попытка смыслового поиска выполнены командами:

```bash
node /home/dev/brain/tools/code-search.mjs "development delivery all external channels suppressed test environment" --repo bcb -k 20
bash /home/dev/brain/tools/codeq.sh "active documentation says local development suppresses every external delivery including email" --repo bcb --k 20 --semantic
```

Первый вернул действующие `testDeliverySafety.ts`, `dispatchPort.ts` и согласованный server-канон;
второй сообщил `coverage=0% (вектор вес 0.00)` и дал только lexical fallback без активного
конфликта. Обратные ссылки проверены командой:

```bash
rg -n 'SERVER CONVENTIONS|LOCAL_DEV_AND_AGENT_TESTING|testDeliverySafety|Изоляция отправок' README.md docs/README.md docs/CURRENT_AUTHORITY_MAP.md docs/_TODO/LEADS_AND_COMMUNICATION_VISIBILITY_2026-09-14.md
```

`README.md`, `docs/README.md` и `CURRENT_AUTHORITY_MAP.md` ведут к `SERVER CONVENTIONS`; второй
активной редакции «DEV подавляет всё, включая email» по этим трём способам не найдено.

## Проверки восстановленного candidate

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/integrator exec vitest --run src/shared/testDeliverySafety.test.ts --reporter=dot"
```

Финальный результат после всех откатов: `1 passed` файл, `20 passed` тестов.

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm test"
```

Результат полного integrator-набора: `127 passed | 2 skipped` файлов;
`709 passed | 2 expected fail | 2 skipped` тестов. Fail-closed редакция не сломала тесты
интегратора вне целевого файла.

```bash
git diff --name-only c42d48776..3e65e46ab
```

Результат: ровно три candidate-файла — `testDeliverySafety.ts`,
`testDeliverySafety.test.ts`, `SERVER CONVENTIONS.md`.

```bash
git diff --name-only c42d48776..3e65e46ab | rg '(^|/)migrations?/|\.sql$'
```

Результат: exit `1`, строк нет; миграций и прав в candidate нет, поэтому rollback-only preflight
не применим.

## ВОПРОСЫ ВЛАДЕЛЬЦУ

Нет. MUST FIX 1 имеет прямой authority в обязательных §10a/§10b и не расширяет продуктовый scope.

## НЕ СДЕЛАНО

- Продуктовый код и постоянные тесты аудитором не исправлялись.
- PROD не читался, не изменялся и не проверялся; TEST runtime и его настройки не менялись.
- DEV/TEST БД, миграции и привилегии не затрагивались; preflight не запускался.
- Живых отправок, второго Next-сервера и автоматических UI-тестов не было.
- Полный CI не запускался по прямому запрету брифа.
- Строка вердикта в `feat` не записывалась. Текст ведущему:
  `FAIL — Л5 round 4: продуктовая матрица и полный integrator-набор зелёные; MUST FIX 1 — TEST-email allowlist дублируется standalone-сценарием и параметризованным рядом, одна инъекция красит оба.`

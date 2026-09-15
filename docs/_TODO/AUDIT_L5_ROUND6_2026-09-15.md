# Адверсарный аудит Л5, круг 6 — почтовая клетка DEV и активные тексты

Дата: 2026-09-15. Candidate: `fcfd437d1` (`wt/dev-mail-trap`). База сравнения:
`feat/doctor-ui-rebuild`.

Oracle: `docs/_TODO/LEADS_AND_COMMUNICATION_VISIBILITY_2026-09-14.md`, пункт Л5 — дословное
распоряжение владельца: «на DEV почтовый канал делай тот же что на тест - у нас mailtip» и его
инженерная граница: DEV выпускает только `email` к петлевому SMTP без `TEST_ACCOUNT_EMAILS`, все
остальные каналы DEV молчат.

## Вердикт

**FAIL. MUST FIX 2.** Исполняемая почтовая клетка не регрессировала: целевой набор зелёный, а все три
заданные независимые поломки пойманы ровно одним сценарием каждая. Цитаты владельца в §23 и §28 не
потеряны. Но документационная коррекция не закрыла находку круга 5: внутри активного канона и двух
явно зарегистрированных активных документов остались предписания применять к DEV тестовые аккаунты
и обходить DEV-гейт по классу аварийного сообщения. Кроме того, новая врезка утверждает, что на TEST
§28 пункт 1 действует дословно; код и история доказывают обратное — более новое распоряжение владельца
от 15.09 глушит отправку операторского алерта при `TEST=true` до чтения каналов и аудитории.

## MUST FIX

1. **Удалить старую DEV-редакцию из всех активных источников, а не оставлять рядом с новой врезкой.**

   Достижимый сценарий: следующий исполнитель читает заголовок и действующую прозу
   `OWNER_PRODUCT_RULES.md:592,601-605` либо активный delivery-план и возвращает
   `TEST_ACCOUNT_EMAILS` на DEV. Тогда письмо живой заявки, отсутствующее в списке, снова не дойдёт
   даже до Mailpit. По соседним `OWNER_PRODUCT_RULES.md:831,842-844,1284-1285` либо по верхней строке
   активного delivery-плана он может вернуть исключение для `operator_alert`; тогда Telegram/MAX/SMS/
   web-push на DEV дойдут живым людям из скопированных данных.

   Точные оставшиеся места:

   - `docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md:592` — заголовок всё ещё говорит «на DEV/TEST — только
     на тестовые аккаунты»;
   - там же `:601-605` — `TEST_ACCOUNT_*` всё ещё назначены deploy-env одновременно DEV/TEST, а один
     gate якобы фильтрует все каналы обеих сред;
   - там же `:831`, `:842-844`, `:1284-1285` — активные формулировки «мимо dev-фильтра» и
     «не распространяются» остались вокруг более узкого уточнения пункта 3;
   - `docs/_TODO/OUTBOUND_DELIVERY_ALERTING_PLAN.md:5` повторяет «мимо dev-фильтра»; этот файл прямо
     зарегистрирован для `Delivery/alerting` в `docs/CURRENT_AUTHORITY_MAP.md:57`;
   - `docs/_TODO/NOTIFICATION_DELIVERY_TARGET_SHAPE_2026-07-27.md:14-16` продолжает называть §23
     DEV/TEST-фильтром тестовых аккаунтов; этот файл прямо назван целевой формой в
     `docs/CURRENT_AUTHORITY_MAP.md:59`.

   Ещё одна такая строка есть в незархивированном
   `docs/_TODO/NOTIFICATION_ALERTING_DESIGN_2026-07-26.md:3`, но текущий authority-map на неё не
   ссылается; FAIL от её классификации не зависит.

   Нарушенное требование: `AGENTS.md` §1b.2, строки 595-600, разрешает на DEV только email к
   loopback SMTP и не даёт исключений по классу сообщения. `AGENTS.md` §0, строки 188-197, требует
   переписать существующее правило, удалить конфликтующие активные формулировки и точным `rg`
   убедиться, что второй редакции не осталось. Строки 202-203 прямо называют исправление одного
   зеркала недостаточным.

2. **Убрать ложное утверждение, что на TEST аварийный алерт по §28 пункту 1 идёт во все каналы.**

   `OWNER_PRODUCT_RULES.md:858-865` теперь говорит: фильтр не глушит алерт на TEST, и «на TEST и в
   бою пункт 1 действует дословно». Фактический публичный путь `dispatchOperatorAlert()` в
   `apps/webapp/src/modules/operator-alerts/dispatchOperatorAlert.ts:172-184` при `env.TEST` пишет
   журнал и сразу возвращает `{ dispatched: false, reason: 'test_mode' }` до чтения конфигурации,
   аудитории и fan-out. Это не случайный остаток: коммит `cc1befa98` добавил ранний выход по
   дословному распоряжению владельца 15.09 «режим ТЕСТ подавляет только проверки бэкапов — надо
   дописать чтобы не орал», а `e334d42f9` добавил обязательный журнал подавления.

   Достижимый сценарий: исполнитель верит активному §28 и снимает ранний TEST-гейт; тестовый стенд
   снова будит владельца ложными аварийными алертами — именно отказ, который закрыло более позднее
   решение 15.09. Нарушенное требование: `AGENTS.md` «Как решать, что делать», строки 67-83 — при
   конфликте побеждает более поздний owner-текст, несовместимая старая проза удаляется; §0,
   строки 188-197 — исправление должно убрать активные дубли.

   Для production-пути с `TEST=false` утверждение подтверждено кодом: critical-конфиг включает
   `telegram`, `max`, `web_push`, `sms`, `email` (`operatorHealthAlertConfig.ts:59-73,93-112,184-187`),
   а `dispatchOperatorAlert.ts:229-345` проходит все пять ветвей. Но `cc1befa98` отдельно фиксирует,
   что новый прод на момент коммита жил с `TEST=true`; PROD не инспектировался по прямому запрету
   brief, поэтому живое состояние нового прода этим аудитом не заявляется.

## Проверка трёх утверждений врезки

| Утверждение | Итог | Доказательство не из врезки |
| --- | --- | --- |
| В коде нет обхода гейта среды по классу сообщения | PASS | `dispatchPort.ts:238-268` решает DEV только по среде и каналу (`email`/не `email`), затем TEST по получателю. Гейт вызывается до adapter selection в `:353-369`. Единственная проверка `operator_security/operator_alert` в `:101-105` выбирает platform credential и не обходит environment gate. |
| До 15.09 DEV глушил и почту | PASS | `git show 13b1aba5e^:apps/integrator/src/infra/adapters/dispatchPort.ts` показывает прежнюю ветку DEV с безусловным `return SUPPRESS` для любого `intendedChannel`; `13b1aba5e` от 15.09 впервые разрешил email до loopback-проверки. |
| На TEST и в бою §28 пункт 1 действует дословно и не ослаблен | **FAIL для TEST; PASS только для production-кода с `TEST=false`** | `git show cc1befa98 -- ...dispatchOperatorAlert.ts` и текущие строки `172-184` доказывают безусловное подавление operator alert при `TEST=true`. При `TEST=false` конфиг и fan-out сохраняют все пять каналов. |

## Активные тексты: точный, смысловой поиск и обратные ссылки

Лексический индекс:

```bash
node /home/dev/brain/tools/code-search.mjs "DEV TEST_ACCOUNT_EMAILS email allowlist development delivery" --repo bcb -k 30
node /home/dev/brain/tools/code-search.mjs "emergency operator alert bypass dev environment filter message class" --repo bcb -k 30
```

Вывод: индекс `2026-09-15T17:00:03.795Z` нашёл `testDeliverySafety.ts`, `dispatchPort.ts`,
`LOCAL_DEV_AND_AGENT_TESTING.md`, `LEADS_AND_COMMUNICATION_VISIBILITY_2026-09-14.md`, operator-alert
код и соседние документы. Индекс старше коррекции `fcfd437d1`, поэтому как доказательство пустоты не
использовался.

Смысловой поиск:

```bash
bash /home/dev/brain/tools/codeq.sh "active documentation requires TEST_ACCOUNT allowlist for email on DEV development" --repo bcb --k 30 --semantic
bash /home/dev/brain/tools/codeq.sh "active notification rules allow emergency operator alert to bypass development environment delivery suppression" --repo bcb --k 30 --semantic
```

Вывод обоих запросов: `coverage=0% (вектор вес 0.00)`, lexical fallback; пустоты он не доказывает.

Точный поиск по активному контуру:

```bash
rg -n -i 'TEST_ACCOUNT_(EMAILS|TELEGRAM_IDS|MAX_IDS|PHONE_NUMBERS)|DEV[^\n]{0,220}(allowlist|разреш[её]нн|фильтр тестов|фильтр.*аккаунт)|development[^\n]{0,220}(allowlist|test account|filter)|dev-фильтр|мимо[^\n]{0,120}(dev|development)[^\n]{0,80}(фильтр|гейт|стен)' AGENTS.md CLAUDE.md .cursor/rules docs --glob '*.md' --glob '*.mdc' --glob '!docs/archive/**' --glob '!docs/audit/**' --glob '!docs/_TODO/AUDIT_*.md' --glob '!docs/_TODO/**/AUDIT*.md' --glob '!docs/_TODO/**/LOG.md' --glob '!docs/REPORTS/**'
```

Вывод содержит перечисленные выше конфликтующие строки
`OWNER_PRODUCT_RULES.md:592,601-605,831,842-844,1285`,
`OUTBOUND_DELIVERY_ALERTING_PLAN.md:5`,
`NOTIFICATION_DELIVERY_TARGET_SHAPE_2026-07-27.md:16` и
`NOTIFICATION_ALERTING_DESIGN_2026-07-26.md:3`. Поэтому пустой результат не заявляется.

Обратные ссылки из реестров:

```bash
rg -n 'CURRENT_AUTHORITY_MAP|OUTBOUND_DELIVERY_ALERTING_PLAN|NOTIFICATION_ALERTING_DESIGN|NOTIFICATION_DELIVERY_TARGET_SHAPE|OWNER_PRODUCT_RULES' README.md docs/README.md docs/CURRENT_AUTHORITY_MAP.md docs/INITIATIVES.md docs/TODO.md docs/_TODO/NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md
```

Вывод: `docs/README.md:3` назначает `CURRENT_AUTHORITY_MAP.md` точкой входа; карта в `:57` назначает
`OUTBOUND_DELIVERY_ALERTING_PLAN.md` текущему delivery/alerting, а в `:59` назначает
`OWNER_PRODUCT_RULES.md` единственным продуктовым каноном и ссылается на
`NOTIFICATION_DELIVERY_TARGET_SHAPE_2026-07-27.md` как целевую форму. Именно поэтому найденные
строки — активные расхождения, а не архивный шум.

## Цитаты владельца в §23 и §28

Сравнение выполнено именно с указанной базой:

```bash
git diff --no-ext-diff --unified=3 feat/doctor-ui-rebuild..fcfd437d1 -- docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md
```

Вывод меняет только добавленную DEV-врезку и агентскую прозу пункта 3 §28; существующие owner-цитаты
§23 и §28 не удалены и не изменены.

Дополнительная машинная сверка всех фрагментов в `«…»` внутри двух разделов:

```bash
node --input-type=module -e 'import fs from "node:fs"; import {execFileSync} from "node:child_process"; const p="docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md"; const cur=fs.readFileSync(p,"utf8"); const base=execFileSync("git",["show","feat/doctor-ui-rebuild:"+p],{encoding:"utf8"}); const pick=(s)=>{let take=false; return s.split("\n").filter((line)=>{if(/^## (23|28)\./.test(line)) take=true; else if(/^## \d+\./.test(line)) take=false; return take;}).join("\n");}; const quotes=(s)=>Array.from(pick(s).matchAll(/«[\s\S]*?»/g),(m)=>m[0]); const b=quotes(base), c=quotes(cur); const missing=b.filter((x)=>!c.includes(x)); console.log(JSON.stringify({baseQuotes:b.length,currentQuotes:c.length,missingOrChanged:missing.length},null,2)); if(missing.length) console.log(missing.join("\n---\n"));'
```

Вывод: `baseQuotes: 74`, `currentQuotes: 78`, `missingOrChanged: 0`. Четыре дополнительных
фрагмента появились во врезке/пояснениях; ни один базовый фрагмент не потерян и не изменён.

## Регрессия исполняемой части

Blind kill-set был записан до чтения существующего теста:

1. вернуть предыдущую форму `isTestDeployment`, доверявшую `VITEST` при отсутствующем `NODE_ENV`;
2. снять loopback-проверку выбранного SMTP-хоста;
3. открыть на DEV один непочтовый канал (`max`).

Базовый и восстановленный прогон выполнялись одной командой:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/integrator exec vitest --run src/shared/testDeliverySafety.test.ts --reporter=dot"
```

Оба результата: `1 passed` файл, `19 passed` тестов. Матрица использует настоящий
`createDefaultDispatchPort().dispatchOutgoing()` и наблюдает конечный side effect адаптера либо его
отсутствие; helper-результат и текст исходника oracle не являются.

### Таблица инъекций

Каждая инъекция прогонялась той же командой выше, после чего production-файл восстанавливался через
`apply_patch`.

| # | Инъекция | Покрасневшее утверждение | Результат | Не поймано |
| ---: | --- | --- | --- | ---: |
| 1 | Вернуть предыдущую форму `isTestDeployment`: при `TEST=true`, `VITEST=true`, `NODE_ENV` unset считать процесс runner и снять TEST-стену | `стенд TEST, потерявший строку NODE_ENV, тоже не открывается` — настоящий `{ chatId: 555000111 }` дошёл до адаптера вместо `[]` | `1 failed / 18 passed` | 0 |
| 2 | Полностью снять проверку непетлевого SMTP-хоста в `EmailDeliveryAdapter` | `on DEV email reaches the network boundary only through loopback SMTP` — внешний SMTP вернул `{}` вместо `development_non_loopback_smtp_host` | `1 failed / 18 passed` | 0 |
| 3 | Разрешить `max` рядом с `email` в DEV-ветке pre-fork gate | `on DEV the max channel never reaches its adapter` — вызов вернул `{}` вместо suppression и дошёл до recording adapter | `1 failed / 18 passed` | 0 |

Итого по точной таблице: **3 инъекции; поймано 3; не поймано 0**. Каждая поломка покрасила ровно
один заявленный сценарий.

Проверка восстановления:

```bash
git diff -- apps/integrator/src/shared/testDeliverySafety.ts apps/integrator/src/infra/adapters/dispatchPort.ts apps/integrator/src/integrations/email/deliveryAdapter.ts apps/integrator/src/shared/testDeliverySafety.test.ts
```

Вывод: строк нет. Повторный целевой прогон: `1 passed`, `19 passed`.

Проверка теста против §10a:

```bash
rg -n 'readFile|readFileSync|toContain\(|indexOf\(|match\(/|source.*text|\.sql|jsdom|@testing-library' apps/integrator/src/shared/testDeliverySafety.test.ts
```

Вывод: exit `1`, строк нет. Тест не читает исходники/SQL и не является автоматическим UI-тестом.
Коррекция `fcfd437d1` исполняемые файлы и тесты не меняла:

```bash
git diff --name-only fcfd437d1^..fcfd437d1 -- apps/integrator/src/shared/testDeliverySafety.ts apps/integrator/src/shared/testDeliverySafety.test.ts apps/integrator/src/infra/adapters/dispatchPort.ts apps/integrator/src/integrations/email/deliveryAdapter.ts
```

Вывод: строк нет.

## ВОПРОСЫ ВЛАДЕЛЬЦУ

Нет. Оба MUST FIX разрешаются уже записанными правилами: DEV-клеткой Л5/§1b.2 и более поздним
распоряжением владельца 15.09 о молчащем TEST с сохранённым журналом. Нового продуктового выбора не
нужно.

## НЕ СДЕЛАНО

- Продуктовый код, постоянные тесты и активные каноны аудитором не исправлялись.
- PROD и TEST не читались, не запускались и не изменялись; живое состояние нового прода не заявляется.
- DEV/TEST БД, миграции, декларация привилегий и generated grants не затрагивались.
- Живых отправок, ручных триггеров и автоматических UI-тестов не было.
- Полный CI и полный integrator-набор не запускались по прямому запрету brief; выполнен только целевой
  файл через обязательный host-lock.
- Временные fault injection полностью откатились; в коммит входит только этот audit-файл.

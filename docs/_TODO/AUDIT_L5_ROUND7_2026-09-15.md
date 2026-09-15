# Адверсарный аудит Л5, круг 7 — вторая редакция снята или переставлена

Дата: 2026-09-15. Candidate: `358ba8e50` (`wt/dev-mail-trap`). База сравнения:
`feat/doctor-ui-rebuild`.

Oracle: `docs/_TODO/LEADS_AND_COMMUNICATION_VISIBILITY_2026-09-14.md`, Л5 — распоряжение владельца
15.09: «на DEV почтовый канал делай тот же что на тест - у нас mailtip».

## Вердикт

**PASS. MUST FIX 0.** Обе находки круга 6 закрыты: старая активная редакция про DEV/TEST-фильтр
заменена раздельным правилом для TEST и DEV, а §28 пункт 3 теперь совпадает с кодом для всех трёх сред.
Цитаты владельца 27.07 и 27.08 в §23/§28 не переписаны. Исполняемая регрессия подтверждена: целевой набор
зелёный, три независимые инъекции покраснели, временный diff откатан.

## MUST FIX

Нет.

Проверенные обязательные строки канона: `AGENTS.md` §0, строки 188-197 — исправление правила переписывает
старую редакцию и удаляет конфликтующие активные формулировки; §1b.2, строки 595-600 — DEV реально не
инициирует доставку наружу, кроме email в петлевой SMTP; §24.4-§24.5 — разовое действие проверяется взглядом,
поведение — blind fault injection.

## Что искал по активным текстам

Карта authority:

```bash
sed -n '1,260p' docs/CURRENT_AUTHORITY_MAP.md
```

Вывод: `docs/CURRENT_AUTHORITY_MAP.md:57` назначает `docs/_TODO/OUTBOUND_DELIVERY_ALERTING_PLAN.md`
для Delivery/alerting; `:59` назначает `docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md` единственным каноном
уведомлений и ссылается на `docs/_TODO/NOTIFICATION_DELIVERY_TARGET_SHAPE_2026-07-27.md`.

Точный поиск по активному контуру:

```bash
rg -n -i 'TEST_ACCOUNT_(EMAILS|TELEGRAM_IDS|MAX_IDS|PHONE_NUMBERS)|DEV[^\n]{0,220}(allowlist|разреш[её]нн|фильтр тестов|фильтр.*аккаунт|тестов(ые|ых)? аккаунт)|development[^\n]{0,220}(allowlist|test account|filter)|dev-фильтр|мимо[^\n]{0,120}(dev|development)[^\n]{0,80}(фильтр|гейт|стен)|обход[^\n]{0,160}(гейт|фильтр)[^\n]{0,160}(класс|сообщ)' AGENTS.md CLAUDE.md .cursor/rules docs --glob '*.md' --glob '*.mdc' --glob '!docs/archive/**' --glob '!docs/audit/**' --glob '!docs/_TODO/AUDIT_*.md' --glob '!docs/_TODO/AUDIT_*' --glob '!docs/_TODO/**/AUDIT*.md' --glob '!docs/_TODO/**/LOG.md' --glob '!docs/REPORTS/**'
```

Релевантный вывод по зарегистрированным источникам: `OWNER_PRODUCT_RULES.md:592-618` теперь разделяет
TEST и DEV; старая строка `:594-596` осталась только как дословная цитата владельца 27.07, ниже прямо
заменена решениями 27.08 и 15.09. `OUTBOUND_DELIVERY_ALERTING_PLAN.md:5` и
`NOTIFICATION_ALERTING_DESIGN_2026-07-26.md:3` говорят, что прежняя формулировка «мимо dev-фильтра»
отменена. `NOTIFICATION_DELIVERY_TARGET_SHAPE_2026-07-27.md:14-17` указывает: TEST — фильтр на тестовые
аккаунты, DEV — только письмо в петлевую ловушку. Старые совпадения вне authority (`APP_RESTRUCTURE_*`,
owner walkthrough, historical logs/runs) не задают текущее правило.

Смысловой/лексический поиск:

```bash
node /home/dev/brain/tools/code-search.mjs "DEV TEST_ACCOUNT_EMAILS allowlist development delivery active documentation" --repo bcb -k 30
node /home/dev/brain/tools/code-search.mjs "operator alert bypass development environment gate message class dev filter" --repo bcb -k 30
```

Вывод: индекс `2026-09-15T17:15:02.922Z` нашёл `testDeliverySafety.ts`, `dispatchPort.ts`,
`LOCAL_DEV_AND_AGENT_TESTING.md`, Л5-план, operator-alert код и тесты; новых активных предписаний
применять `TEST_ACCOUNT_*` к DEV или обходить гейт по классу сообщения не нашёл.

Обратные ссылки:

```bash
rg -n 'CURRENT_AUTHORITY_MAP|OUTBOUND_DELIVERY_ALERTING_PLAN|NOTIFICATION_ALERTING_DESIGN|NOTIFICATION_DELIVERY_TARGET_SHAPE|OWNER_PRODUCT_RULES' README.md docs/README.md docs/CURRENT_AUTHORITY_MAP.md docs/INITIATIVES.md docs/TODO.md docs/_TODO/NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md
```

Вывод: `docs/README.md:3` и `docs/INITIATIVES.md:16` ведут в `CURRENT_AUTHORITY_MAP.md`; карта в
`:57-59` перечисляет текущие active sources выше.

## §28 пункт 3 против кода

| Среда | Итог | Доказательство из кода |
| --- | --- | --- |
| Бой (`TEST` снят, `NODE_ENV=production`) | PASS | `operatorHealthAlertConfig.ts:59-65,93-112,184-187` держит critical channels `telegram/max/web_push/sms/email` включёнными и locked; `dispatchOperatorAlert.ts:187-220` читает конфиг и аудиторию, затем `:229-335` проходит telegram/max/sms/email, а `:337-380` — web_push. |
| TEST | PASS | `dispatchOperatorAlert.ts:172-184` пишет `operator_alert_suppressed_test_mode` и возвращает `{ dispatched: false, reason: 'test_mode' }` до чтения конфигурации и аудитории. |
| DEV | PASS | `dispatchPort.ts:243-255` при `NODE_ENV=development` пропускает к адаптеру только `email`; `deliveryAdapter.ts:136-146` гасит email до `sendMail`, если выбранный SMTP-хост не `127.0.0.1`, `::1` или `localhost`. Непочтовые каналы на DEV не доходят до адаптера независимо от класса сообщения. |

## Цитаты владельца в §23 и §28

Сравнение с указанной базой:

```bash
git diff --no-ext-diff --unified=3 feat/doctor-ui-rebuild..358ba8e50 -- docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md
```

Вывод: изменена агентская проза §23, §28 и §31.1; owner-цитаты не переписаны. Машинная сверка:

```bash
node --input-type=module -e 'import fs from "node:fs"; import {execFileSync} from "node:child_process"; const p="docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md"; const cur=fs.readFileSync(p,"utf8"); const base=execFileSync("git",["show","feat/doctor-ui-rebuild:"+p],{encoding:"utf8"}); const pick=(s)=>{let take=false; return s.split("\n").filter((line)=>{if(/^## (23|28)\./.test(line)) take=true; else if(/^## \d+\./.test(line)) take=false; return take;}).join("\n");}; const quotes=(s)=>Array.from(pick(s).matchAll(/«[\s\S]*?»/g),(m)=>m[0]); const b=quotes(base), c=quotes(cur); const missing=b.filter((x)=>!c.includes(x)); console.log(JSON.stringify({baseQuotes:b.length,currentQuotes:c.length,missingOrChanged:missing.length},null,2)); if(missing.length) console.log(missing.join("\n---\n"));'
```

Вывод: `baseQuotes: 74`, `currentQuotes: 80`, `missingOrChanged: 0`.

## Регрессия исполняемой части

Blind kill-set был записан до чтения существующего теста:

1. вернуть старую форму `isTestDeployment`, где `TEST=true`, `VITEST=true`, `NODE_ENV` unset считается runner;
2. снять петлевую проверку выбранного SMTP-хоста;
3. открыть на DEV непочтовый канал `max`.

Базовый и восстановленный прогон:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/integrator exec vitest --run src/shared/testDeliverySafety.test.ts --reporter=dot"
```

Вывод до инъекций: `Test Files 1 passed (1)`, `Tests 19 passed (19)`. После отката инъекций:
`Test Files 1 passed (1)`, `Tests 19 passed (19)`.

Проверка на запрещённый source-text/UI-test:

```bash
rg -n 'readFile|readFileSync|toContain\(|indexOf\(|match\(/|source.*text|\.sql|jsdom|@testing-library' apps/integrator/src/shared/testDeliverySafety.test.ts
```

Вывод: exit `1`, строк нет.

### Таблица инъекций

| # | Инъекция | Покрасневшее утверждение | Результат | Не поймано |
| ---: | --- | --- | --- | ---: |
| 1 | В `isTestDeployment()` доверить `VITEST=true` при отсутствующем `NODE_ENV` | `стенд TEST, потерявший строку NODE_ENV, тоже не открывается`: получатель `{ chatId: 555000111 }` дошёл до адаптера вместо `[]` | `1 failed / 18 passed` | 0 |
| 2 | Отключить `isLoopbackSmtpHost()` в email adapter | `on DEV email reaches the network boundary only through loopback SMTP`: внешний SMTP вернул `{}` вместо `development_non_loopback_smtp_host` | `1 failed / 18 passed` | 0 |
| 3 | Разрешить `max` рядом с `email` в DEV-gate | `on DEV the max channel never reaches its adapter`: результат `{}` вместо `{ suppressedByEnvironment: true }` | `1 failed / 18 passed` | 0 |

Проверка отката временных правок:

```bash
git diff -- apps/integrator/src/shared/testDeliverySafety.ts apps/integrator/src/infra/adapters/dispatchPort.ts apps/integrator/src/integrations/email/deliveryAdapter.ts apps/integrator/src/shared/testDeliverySafety.test.ts
```

Вывод: строк нет.

## НЕ СДЕЛАНО

- Продуктовый код, постоянные тесты и активные каноны аудитором не исправлялись.
- PROD и TEST не читались, не запускались и не изменялись.
- DEV/TEST БД, миграции, декларация привилегий и generated grants не затрагивались.
- Живых отправок, ручных триггеров и автоматических UI-тестов не было.
- Полный CI не запускался; выполнен только целевой файл через `/home/dev/brain/host-orch/run-tests.sh`.

## ВОПРОСЫ ВЛАДЕЛЬЦУ

Нет.

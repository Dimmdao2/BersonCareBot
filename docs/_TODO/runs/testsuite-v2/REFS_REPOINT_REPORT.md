# Отчёт — перевод 11 битых ссылок блока #1081 на разделы `AGENTS.md`

(ветка `wt/testsuite-refs`, база `7f402c5b5`)

## Что сделано

11 ссылок на 4 удалённых файла `.cursor/rules/*` в `docs/_TODO/runs/testsuite-v2/*.md` заменены на
`[`AGENTS.md` §N](../../../../AGENTS.md#якорь)` — по образцу маршрутной таблицы `.cursor/rules/000-start-here.mdc`.
`docs/_TODO/TEST_SUITE_AUDIT_2026-07-29.md` таких ссылок не содержал (проверено `grep`) — трогать было нечего.

| Удалённый файл | Разделов найдено | Куда переведено |
| --- | --- | --- |
| `.cursor/rules/host-psql-database-url.mdc` (6×) | 6 файлов, по 1 ссылке | [`AGENTS.md` §6 «Host: PostgreSQL и DATABASE_URL»](../../../../AGENTS.md#6-host-postgresql-и-database_url) |
| `.cursor/rules/dev-prod-isolation-no-real-creds.mdc` (3×) | 3 файла, по 1 ссылке | [`AGENTS.md` §1b «Безопасность dev-среды: изоляция от прод и реальных каналов»](../../../../AGENTS.md#1b-безопасность-dev-среды-изоляция-от-прод-и-реальных-каналов) |
| `.cursor/rules/webapp-tests-lean-no-bloat.mdc` (1×) | `V9_ROLE_GUARDS_BRIEF.md` | [`AGENTS.md` §11 «Webapp-тесты: компактность»](../../../../AGENTS.md#11-webapp-тесты-компактность) |
| `.cursor/rules/pre-push-ci.mdc` (1×) | `M_MECHANICS_BRIEF.md` | [`AGENTS.md` §9 «Full CI gate»](../../../../AGENTS.md#9-full-ci-gate) |

Разделы искали по содержанию правила (не по похожему названию файла):

- `host-psql-database-url` — про голый `psql "$DATABASE_URL"` без загрузки env → §6 целиком об этом (сбой без env,
  жёсткое требование сначала грузить env-файл, шаблоны prod/dev).
- `dev-prod-isolation-no-real-creds` — про запрет реальных кредов/доставки в dev и изоляцию DEV/TEST от PROD →
  §1b целиком об этом (реальные креды только на проде, dev не шлёт реальные сообщения, прод не трогать из dev).
- `webapp-tests-lean-no-bloat` — про раздутие webapp-тестов (импорты `page.tsx`, число файлов) → §11 «Webapp-тесты:
  компактность», единственный раздел именно про это.
- `pre-push-ci` — упомянут рядом с `test-execution-policy.md` в контексте гейта перед пушем в брифе про Stryker/
  CI-гейты механики набора → §9 «Full CI gate» — единственный раздел, задающий, когда обязателен полный CI перед
  push/deploy/merge.

Файлы `.cursor/rules/tests-check-behaviour-not-circumstances.mdc` и `.cursor/rules/test-execution-policy.md` не
трогал — они существуют и на первый завязан механический гейт запуска агентов.

## Изменённые файлы (8)

- `docs/_TODO/runs/testsuite-v2/B2_BASELINE_REFRESH_BRIEF.md`
- `docs/_TODO/runs/testsuite-v2/B2B_ETALON_GENERATOR_BRIEF.md`
- `docs/_TODO/runs/testsuite-v2/B2A_REFRESH_ROLE_ASSUMPTION_BRIEF.md`
- `docs/_TODO/runs/testsuite-v2/V9_ROLE_GUARDS_BRIEF.md`
- `docs/_TODO/runs/testsuite-v2/B_FIX_ROUND2_BRIEF.md`
- `docs/_TODO/runs/testsuite-v2/B_DISPOSABLE_PG_BRIEF.md`
- `docs/_TODO/runs/testsuite-v2/B_BLIND_AUDIT_BRIEF.md`
- `docs/_TODO/runs/testsuite-v2/M_MECHANICS_BRIEF.md`

Правки — только замена ссылки в строке «Правила:»/«Правила репозитория...»; остальной текст брифов не менялся.

## Механическая проверка — резолвится ли каждый `AGENTS.md#якорь`

Одноразовый скрипт (`node`): парсит все заголовки `AGENTS.md`, строит GitHub-style якоря (нижний регистр, пробелы →
`-`, вырезаны символы вне букв/цифр/`_`/`-`), затем для списка файлов ищет все `AGENTS.md#якорь` и печатает
`OK`/`BROKEN`; exit-код 1 при любом `BROKEN`.

**До правки** (те же 8 файлов, до перевода ссылок — самих `AGENTS.md#якорь` там ещё не было, что и является
исходной проблемой: ссылки указывали на удалённые файлы, а не на якоря):

```
$ node /tmp/check_anchors.mjs docs/_TODO/runs/testsuite-v2/{B2_BASELINE_REFRESH,B2B_ETALON_GENERATOR,B2A_REFRESH_ROLE_ASSUMPTION,V9_ROLE_GUARDS,B_FIX_ROUND2,B_DISPOSABLE_PG,B_BLIND_AUDIT,M_MECHANICS}_BRIEF.md
(пусто — совпадений AGENTS.md#... нет)
exit: 0
```

**После правки:**

```
$ node /tmp/check_anchors.mjs docs/_TODO/runs/testsuite-v2/{B2_BASELINE_REFRESH,B2B_ETALON_GENERATOR,B2A_REFRESH_ROLE_ASSUMPTION,V9_ROLE_GUARDS,B_FIX_ROUND2,B_DISPOSABLE_PG,B_BLIND_AUDIT,M_MECHANICS}_BRIEF.md
docs/_TODO/runs/testsuite-v2/B2_BASELINE_REFRESH_BRIEF.md: #6-host-postgresql-и-database_url -> OK
docs/_TODO/runs/testsuite-v2/B2_BASELINE_REFRESH_BRIEF.md: #1b-безопасность-dev-среды-изоляция-от-прод-и-реальных-каналов -> OK
docs/_TODO/runs/testsuite-v2/B2B_ETALON_GENERATOR_BRIEF.md: #6-host-postgresql-и-database_url -> OK
docs/_TODO/runs/testsuite-v2/B2B_ETALON_GENERATOR_BRIEF.md: #1b-безопасность-dev-среды-изоляция-от-прод-и-реальных-каналов -> OK
docs/_TODO/runs/testsuite-v2/B2A_REFRESH_ROLE_ASSUMPTION_BRIEF.md: #6-host-postgresql-и-database_url -> OK
docs/_TODO/runs/testsuite-v2/B2A_REFRESH_ROLE_ASSUMPTION_BRIEF.md: #1b-безопасность-dev-среды-изоляция-от-прод-и-реальных-каналов -> OK
docs/_TODO/runs/testsuite-v2/V9_ROLE_GUARDS_BRIEF.md: #11-webapp-тесты-компактность -> OK
docs/_TODO/runs/testsuite-v2/B_FIX_ROUND2_BRIEF.md: #6-host-postgresql-и-database_url -> OK
docs/_TODO/runs/testsuite-v2/B_DISPOSABLE_PG_BRIEF.md: #6-host-postgresql-и-database_url -> OK
docs/_TODO/runs/testsuite-v2/B_BLIND_AUDIT_BRIEF.md: #6-host-postgresql-и-database_url -> OK
docs/_TODO/runs/testsuite-v2/M_MECHANICS_BRIEF.md: #9-full-ci-gate -> OK
exit: 0
```

Все 11 якорей (6× §6 + 3× §1b + 1× §11 + 1× §9) резолвятся в реальные заголовки `AGENTS.md`.

Дополнительно — `grep` по всем 4 удалённым именам файлов в изменённых файлах и в `TEST_SUITE_AUDIT_2026-07-29.md`
после правки даёт 0 совпадений (только в `REFS_REPOINT_BRIEF.md` — брифе этого же задания, вне scope правки).

## Разделы, для которых не нашлось подходящего места

Не встретилось: для всех 4 удалённых файлов подходящий раздел `AGENTS.md` нашёлся однозначно и по содержанию, а
не по похожему имени. Находок «правило не переехало» нет.

## НЕ СДЕЛАНО

- Push и merge не выполнялись, галочки `TEST_SUITE_AUDIT_2026-07-29.md` не ставились — вне scope брифа.
- Текст плана/брифов, кроме самих ссылок, не менялся и не «улучшался».
- Продуктовый код и `AGENTS.md` не трогались.
- Ссылки на `.cursor/rules/tests-check-behaviour-not-circumstances.mdc` и `.cursor/rules/test-execution-policy.md`
  оставлены как есть — оба файла существуют, трогать их не входило в задание.
- Ссылки внутри `docs/_TODO/runs/testsuite-v2/REFS_REPOINT_BRIEF.md` (счётчики `6 × ...` / `3 × ...` и т.д. в самом
  брифе этого задания) не трогались — это описание задачи, а не ссылка, требующая перевода.

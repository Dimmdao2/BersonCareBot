# Повторный независимый гейт — исполнимость пути A→B0 после починки FAIL-B

**Дата:** 2026-08-20 · **Ветка:** `wt/restore-ab-20260820` · **Коммит под аудитом:** `e57089e0f` (13 файлов, +44027).
**Аудитор:** независимый гейт (Opus), НЕ автор работы. Прошлый вердикт: `AUDIT_RESTORE_AB_2026-08-20.md` (FAIL-B).
Отчёт фиксера: `AB_PATH_EXECUTABLE_FIX_2026-08-20.md`. Только чтение дерева + git-сверки; к TEST/DEV/проду не подключался
(запрет брифа), `pnpm run ci` не запускался.

## ВЕРДИКТ: **PASS. Прежний FAIL-B снят.**

Полный сброс TEST снова исполним по именам файлов и флагам: все `\ir`-включения резолвятся, все внешние артефакты
пути существуют, переписанная функция эквивалентна замене и прав не расширяет, запрещённое не вернулось, обезличивания
нет. Единственный остаточный риск (устаревший снимок `generated/prod-to-target/*.sql`) назван фиксером ЧЕСТНО и **ловится
преflight-ом fail-closed до любого разрушения** — молча путь не сломает. Каждый пункт ниже — командой.

---

## A. Права не протащены под видом восстановления — **PASS**

10 SQL-файлов сверены хешем против удалившего коммита `bfe6b48f0^` — **все 10 байт-в-байт идентичны** (sha256 совпал
построчно), значит по определению ни один `GRANT/REVOKE/CREATE ROLE/ALTER ROLE/OWNER TO/BYPASSRLS/CREATE POLICY/DISABLE
RLS` не добавлен относительно оригинала: содержимое — ровно оригинал.

```
for f in <10 restored .sql>; do
  [ "$(git show e57089e0f:$f|sha256sum)" = "$(git show bfe6b48f0^:$f|sha256sum)" ] && echo MATCH || echo DIFFER
done
→ MATCH ×10
```

Единственный не-байт-идентичный файл — `deploy/host/cutover-postgres-port-context.sh` (переписана одна функция). Его
diff против `9ebea6963^` не содержит НИ ОДНОГО privilege-стейтмента:

```
diff <(git show 9ebea6963^:…port-context.sh) <(git show e57089e0f:…port-context.sh) \
  | grep '^>' | grep -iE 'GRANT|REVOKE|CREATE ROLE|ALTER ROLE|OWNER TO|BYPASSRLS|CREATE POLICY|DISABLE ROW LEVEL'
→ единственное совпадение — слово «granted» ВНУТРИ комментария, не стейтмент.
```

Установка прав делегирована `generate-cli.mjs --shared-role-baseline` + `reconcile-access.mjs` — тем же живым
инструментам, что зовёт `deploy-test.sh` на каждом деплое; оба выдают строго declaration-bounded доступ, инлайн-GRANT-ов
в скрипте нет. **A: PASS.**

## B. Переписанная функция эквивалентна и прав не расширяет — **PASS**

Диф минимален и чист: убран вызов `initial-cutover.mjs`, добавлены `$generator`/`$reconcile` в существующий guard-цикл
и в install-функцию — `pg_dump -Fc`+`pg_restore --list` проверка бэкапа, затем `generate-cli --shared-role-baseline | psql`
и `reconcile-access.mjs --env test --db bersoncarebot_test --admin-socket … --admin-port 5432`.

1. **Эквивалентность для базы, уже прошедшей initial cutover.** `reconcile-access.mjs` самодокументируется: «Repeatable
   access reconcile for one database that has **already completed initial cutover**. It never runs legacy cleanup,
   zero-state, target-login cleanup, or database restore.» Обнуление прав, которое раньше делал zero-state, теперь по
   построению делает предыдущий шаг того же пути — `restore-test-db-from-dump.sh` через `dropdb`+`createdb`+`pg_restore
   --no-acl`. Критично: **блок экспорта кредов логинов сохранён байт-в-байт** (`export ${password_prefix}_WEBAPP_STAFF_PASSWORD=…`
   и ещё четыре, `password_prefix=BCB_TEST`) и стоит на верхнем уровне скрипта ДО вызова функции — значит `reconcile-access.mjs`
   (наследует `process.env`) получает ровно те же креды, что получал бы `initial-cutover.mjs`. Это те же имена
   `BCB_TEST_*_PASSWORD`, которые `deploy-test.sh` кладёт в `RECONCILE_ENV` для своего reconcile.
2. **`deploy-test.sh` реально использует ровно эту пару.** `deploy-test.sh:226` — `generate-cli … --shared-role-baseline
   | psql`; блок ниже — `reconcile-access.mjs --env test --db "$DB" --admin-socket /var/run/postgresql --admin-port 5432`.
   Совпадает с новым вызовом в port-context дословно по флагам.
3. **Контракт `--backup-file` и вызывающая сторона не изменились.** Разбор аргументов скрипта (`--environment|--database|--backup-file|--operational-connection-limit`),
   валидация `--backup-file` (абсолютный новый путь, выделенная директория) — идентичны оригиналу. Вызывающий
   `run_port_context_test_release` (`deploy-test-saas.sh:3269-3271`) передаёт `--backup-file "$access_backup"` — этот файл
   коммитом `e57089e0f` НЕ трогался.
4. **Прав не расширяет.** См. A: privilege-стейтментов в дифе нет; `generate-cli --shared-role-baseline`+`reconcile` —
   те же declaration-bounded инструменты, что уже гоняет `deploy-test.sh`. Новый `pg_dump` идёт как `runuser -u postgres`
   — это снятие бэкапа, не выдача прав.

**B: PASS.** (Функциональная семантика после ЖИВОГО прогона по-прежнему не доказана — запрет брифа; фиксер это честно
назвал. Гейт-B про исполнимость пути, а не про успешность живого прогона.)

## C. Исполнимость целиком — **PASS**

Все `\ir`-включения цепочки cutover резолвятся (проверено рекурсивным обходом графа от обоих корней —
`pre-cutover-data-stage-assertions.sql` и `prod-to-target-cutover.sql`):

```
prod-to-target-cutover.sql → cutover-start, schema-pre, cutover-data, ledgers-and-baseline,
  runtime-settings, schema-post, cutover-finish;
  cutover-data.sql:246 → known-missing-media.sql;  cutover-data.sql:926 → patient-membership-manifest.sql;
pre-cutover-data-stage-assertions.sql:11 → patient-membership-manifest.sql
→ 9 включений, 0 MISS
```

Внешние артефакты port-context (из его же guard-цикла `for path in …`): `provision-…-mtls-material.sh`,
`bootstrap-c4-test-env.mjs`, `apply-postgres-mtls.sh`, `probe-…-mtls.mjs`, `generate-cli.mjs`, `reconcile-access.mjs`,
`port-context-cutover-sequence.sh` — **все существуют**; зависимости `reconcile` (`port-context/contract.sql`,
`generated/org-allowlist.bersoncarebot_test.sql`) — существуют. Два файла, названные прошлым гейтом отсутствующими на
пути движка (`deploy-test-saas.sh:3492` `pre-cutover-data-stage-assertions.sql`, `:3269` `cutover-postgres-port-context.sh`)
— **оба на месте**. `bash -n` чист на всех 5 задействованных скриптах. Заявленное фиксером «27/27» — его бухгалтерия;
по МОЕМУ пересчёту (9 `\ir` + 7 guard-артефактов + 2 зависимости reconcile + 2 ранее отсутствовавших вызова движка)
**0 MISSING** по каждому перечислению. **C: PASS.**

## D. Обезличивания нет — **PASS**

```
grep -rniE 'anonymiz|anonymis|обезлич|маскир|\bmask\b|pseudonym|scrub|redact|\bfaker\b|\bfake\b' <11 restored> → пусто
```
Ни анонимизации, ни маскировки, ни подмены телефонов/почт. **D: PASS.**

## E. Названный риск назван честно и полно; преflight ловит расхождение — **ПОДТВЕРЖДЕНО**

4 файла `generated/prod-to-target/*.sql` **действительно** заморожены на момент удаления (17.08): они хешем идентичны
`bfe6b48f0^` (см. A), то есть НЕ пересчитаны против сегодняшнего DEV. Прямой ответ на вопрос брифа — **устаревший снимок
НЕ сломает шаг владельца молча:**

- преflight `check:prod-to-target-cutover` (`refresh-prod-to-target-cutover.mjs --check`) рендерит артефакты из ЖИВОГО
  `bcb_webapp_dev` и **побайтно** сверяет с закоммиченными; на любом расхождении печатает `DRIFT <file>` и вызывает
  `fail()` (throw → ненулевой exit);
- он стоит в обёртке `deploy-test-full-reset.sh:37` под `set -euo pipefail`, в субшелле, **до** `exec bash
  "$SHARED_RESET_ENGINE"` (строка 42) — то есть ДО любого разрушения. Стале-снимок → преflight красный → обёртка падает,
  движок не стартует.

Классификация фиксера («снимок, замороженный на 17.08, обязан заново пройти check перед реальным прогоном») —
честная и полная. **E: риск назван корректно, fail-closed преflight его ловит.**

## F. Запрещённое не вернулось — **PASS**

```
git show --name-only --pretty=format: e57089e0f \
  | grep -iE 'a0-greenfield|a1-rls|verify-a0|verify-a1|greenfield|drizzle-migrations|/migrations/|migrations/core'
→ NONE
```
Коммит трогает только 11 deploy/ops-файлов + 2 дока; ни одного файла миграции, ни семейства A0/A1/greenfield.
Grep содержимого восстановленных SQL по тем же маскам — пусто. **F: PASS.**

## Тест-половина — написан статический guard исполнимости пути

Существующий `deploy-test-full-reset.test.mjs` (4/4) заглушает движок и **не резолвит** реальный `\ir`-граф и внешние
артефакты port-context — то есть повторное молчаливое удаление любого восстановленного шага оставило бы его зелёным.
Это ровно класс дефекта FAIL-B. Написан новый **`deploy/host/prod-to-target-cutover-path-resolvable.test.mjs`** (2/2):

1. рекурсивно резолвит `\ir`-граф от обоих корней движка (`PRE_CUTOVER_DATA_ASSERTIONS`, `CUTOVER_MIGRATION`, читаются
   из самого `deploy-test-saas.sh`) и требует, чтобы каждый include существовал; плюс требует наличие 7 известных
   генерируемых/секвенсерных узлов, чтобы удаление вместе с родителем не скрыло регрессию;
2. парсит guard-цикл `cutover-postgres-port-context.sh`, требует существования всех repo-относительных артефактов и
   присутствия `generator`+`reconcile`; регрессионный запрет на исполняемую ссылку на удалённый `initial-cutover.mjs`
   (комментарий, объясняющий удаление, разрешён).

Это проверка исполнимости пути (структурный инвариант), не текста поведения источника — не нарушает AGENTS.md §10a и не
требует живого окружения. Fault-injection: удаление `runtime-settings.sql` → тест краснеет с `unresolved \ir include …
runtime-settings.sql`; после восстановления снова 2/2. Дерево чистое.

## Что проверял (воспроизводимость)

```bash
# A: хеш-сверка 10 файлов vs bfe6b48f0^; diff port-context.sh vs 9ebea6963^ + grep privilege-keywords
# B: чтение reconcile-access.mjs (self-doc, allowedArgs), deploy-test.sh:226/reconcile-блок, arg-parse port-context.sh,
#    caller deploy-test-saas.sh:3269-3271, сохранённый export-блок BCB_TEST_*_PASSWORD
# C: рекурсивный обход \ir; ls guard-артефактов; bash -n ×5; node --test resolvable-guard
# D: grep анонимизации по 11 файлам
# E: check:prod-to-target-cutover рендер+побайт-сверка (refresh-…mjs:154-176); deploy-test-full-reset.sh:34-42 порядок под set -e
# F: git show --name-only маски запрещённого; grep содержимого
```

## НЕ СДЕЛАНО / вне гейта

- Живой прогон full-reset не гонял (запрет брифа) — вывод об исполнимости статический, но однозначный: все имена/флаги
  на месте, пара reconcile получает те же креды.
- Функциональная работоспособность TEST после сброса (в т.ч. переустановка `app_ext.port_context_capabilities` под
  TEST-логины) не доказана — тот же открытый класс риска, что фиксер назвал; гейт его не увеличивает и не закрывает.
- К проду/TEST/DEV не подключался.

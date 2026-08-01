# Б2 — снять дрейф эталона `a0-greenfield` (ворота G0/0175) — ОТЧЁТ

**Бриф:** [`B2_BASELINE_REFRESH_BRIEF.md`](B2_BASELINE_REFRESH_BRIEF.md). **Ветка:** `wt/testsuite-b2` (создана от
`c079e8907`, точка ветвления совпадает с `feat/doctor-ui-rebuild` на этом боксе). **Прод не трогался, не читался.**

## Итог одной строкой

**Задача не выполнена.** Оба привилегированных шага (`migrate-dev.sh --execute` и
`refresh-a0-greenfield-baseline.mjs`) упираются в **канонический boundary этого бокса**: агентская сессия
запущена с `NoNewPrivs=1` на уровне процесса, поэтому `sudo -n -u postgres …` отклоняется ядром до всякой
проверки пароля/прав — не специфичная для этой задачи ошибка, а задокументированный ранее «зазор оснастки»
(см. «Прецеденты» ниже). Обходить его (членство в группе `docker`, отдельный контейнер и т.п.) не пытался —
это ровно тот boundary, который канон велит не обходить.

## Что сделано

1. **Подтверждён дрейф до попытки refresh** (дословно):
   ```
   > node scripts/check-a0-greenfield-baseline.mjs && node --test scripts/a0-greenfield-baseline.test.mjs
   check-a0-greenfield-baseline: drizzle_historical_hash_drift:0175_p0_8_b4_roles_1_is_staff_wall_rls
    ELIFECYCLE  Command failed with exit code 1.
   ```
2. **Сверено, что DEV (`/home/dev/dev-projects/BersonCareBot`, ветка `feat/doctor-ui-rebuild`) уже на том же
   коммите `c079e8907`**, что и точка ветвления `wt/testsuite-b2`; `diff -rq` каталогов
   `apps/webapp/db/drizzle-migrations` и `apps/webapp/migrations` между DEV-чекаутом и этим клоном — пусто
   (миграции идентичны, «привести DEV к ветке» содержательно не требует новых файлов).
3. **`migrate-dev.sh --preflight`** (из DEV-чекаута, где реально лежит `apps/webapp/.env.dev`) — зелёный:
   ```
   migrate-dev preflight: PASS (exact local DEV; no changes made)
   ```
4. **`migrate-dev.sh --execute`** — упал на первом привилегированном шаге (инспекция роли `app_owner`):
   ```
   sudo: The "no new privileges" flag is set, which prevents sudo from running as root.
   sudo: If sudo is running in a container, you may need to adjust the container configuration to disable the flag.
   FATAL: cannot inspect DEV app_owner role
   ```
   Никаких изменений в DEV не произошло — скрипт сам fail-closed остановился до `pnpm migrate`; проверено
   `git status`/отсутствием побочных объектов, кроме собственного lock-файла `/tmp/bcb-dev-migrate.1001.lock`.
5. **`refresh-a0-greenfield-baseline.mjs --confirm-local-dev-schema-refresh --env-file=…/.env.dev`** — упал на
   первом привилегированном чтении метаданных источника (`/usr/bin/sudo` → root-owned `psql`/`pg_dump`):
   ```
   refresh-a0-greenfield-baseline: source_database_probe_failed:sudo: The "no new privileges" flag is set,
   which prevents sudo from running as root.
   sudo: If sudo is running in a container, you may need to adjust the container configuration to disable the flag.
   ```
   Скрипт не записал ни `schema.sql`, ни `migration-manifest.json`, ни `seed.sql` — упал до всякой записи.
   **`sourceCommit` нового эталона: отсутствует, эталон не менялся.** `git status` в `docs/ARCHITECTURE/DB_DUMPS/`
   после попытки — чисто, файлы эталона байт-в-байт те же, что были на `HEAD`.
6. **Гейт `check:saas-a0-greenfield-baseline` перепрогнан после попытки** — вывод дословно идентичен пункту 1
   (дрейф `0175_p0_8_b4_roles_1_is_staff_wall_rls` сохраняется, `exit 1`). Это ожидаемо: раз эталон не
   обновлялся, состояние не изменилось.

## Прецеденты (тот же класс блокировки, уже зафиксирован в репо раньше)

- `docs/_TODO/OUTBOUND_DELIVERY_ALERTING_PLAN.md:151` — «агенты под песочницей `no new privileges` НЕ могут
  дотянуться до Postgres (`sudo` заблокирован …). Класс дефектов, который живёт именно в базе, агенты сейчас
  проверить не в состоянии — это зазор оснастки, а не лень исполнителей.»
- `docs/_TODO/runs/tariff/S7_3_TEST_LADDER_RUN.md:72-90` — идентичная ошибка `sudo: The "no new privileges" flag
  is set`, тот же вывод: `sudo -u postgres` недоступен, `migrate-dev.sh` не может выдать мигратору членство в
  `app_owner`; и явное правило: «Границы 1–3 — намеренные, канонические. Обходить их (например, через членство
  в группе `docker`) агент не стал: это ровно тот boundary, который канон и ставит.»

Я следовал тому же правилу: не пытался эскалировать привилегии через `docker`-группу (пользователь `dev` в ней
состоит, `id` показывает `990(docker)`) или иной обходной путь.

## НЕ СДЕЛАНО (обязательный раздел)

- **Эталон `a0-greenfield` не обновлён.** `refresh-a0-greenfield-baseline.mjs` падает на первом привилегированном
  чтении (`sudo -u postgres`), не доходя до генерации `schema.sql`/`migration-manifest.json`/`seed.sql`.
  Причина: `NoNewPrivs=1` в этой агентской сессии, не связана с содержимым эталона или с миграцией 0175.
- **`check:saas-a0-greenfield-baseline` НЕ зелёный.** Дрейф `0175_p0_8_b4_roles_1_is_staff_wall_rls` сохраняется
  без изменений — приёмочный критерий не достигнут.
- **`verify:saas-a0-greenfield-baseline` не запускался.** Он требует уже обновлённого эталона (шаг 2 брифа), а
  тот не был получен; запуск на дрейфующем эталоне не доказал бы ничего нового сверх пункта 6 выше.
- **`migrate-dev.sh --execute` не завершился.** Упал на инспекции роли `app_owner` тем же `sudo`-блоком; DEV
  не изменена (это подтверждено, а не просто предположено).
- **Харнесс одноразовой базы из `wt/testsuite-b` (коммит `5aec73dd8`) не запускался.** Сам коммит не найден ни в
  этом клоне, ни в `origin` этого клона (= локальный чекаут `BersonCareBot`, ветка `origin/wt/testsuite-b` после
  `git fetch --all` его не содержит); найден только в отдельном чужом воркер-клоне `bcb-wt-portsmoke` (это не
  принадлежит скоупу Б2 — трогать/копировать оттуда не стал). Дальше: даже будь коммит доступен здесь, харнесс
  строит disposable-PostgreSQL кластер из эталона, который не был обновлён, — прогон воспроизвёл бы либо тот же
  0175-дрейф (не новую информацию), либо тот же `sudo`-блок на своём privileged-шаге. Живой прогон не выполнялся,
  время сборки шаблона не измерено.
- **`sourceCommit` нового эталона не назван** — эталон не менялся, назвать нечего.
- Чек-боксы плана (Б2 и связанные) не трогал; push/merge не делал.

## Что нужно, чтобы прогон стал возможен (по убыванию удобства)

- Владелец/оператор с реальным `sudo` (сессия без `NoNewPrivs`) выполняет ровно те же две команды —
  `bash deploy/host/migrate-dev.sh --execute` (из `/home/dev/dev-projects/BersonCareBot`) и
  `node scripts/refresh-a0-greenfield-baseline.mjs --confirm-local-dev-schema-refresh --env-file=…/.env.dev`
  (из ветки `wt/testsuite-b2`) — вручную, как ранее делал лид для `OUTBOUND_DELIVERY_ALERTING_PLAN.md`.
- Либо агентской сессии на этом боксе выдаётся окружение без `NoNewPrivs` — это решение владельца по оснастке,
  не то, что можно исправить внутри задачи Б2.

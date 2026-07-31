# Б2а — генератор эталона исходит из устаревшего допущения о роли подключения

(run: `worker-b2a-refresh-role`, клон `bcb-wt-docs3`, ветка `wt/testsuite-b2`)

**План (authority):** [`docs/_TODO/TEST_SUITE_AUDIT_2026-07-29.md`](../../TEST_SUITE_AUDIT_2026-07-29.md),
раздел «ПОРЯДОК РАБОТ v2», блок Б, пункт **Б2** (ворота G0/0175).

**Строка плана, дающая оракул:** Б1а — «эталон `a0-greenfield` + миграции поверх… **запрещён дамп ЖИВОЙ базы**
(`bcb_webapp_dev`, TEST, прод), эталон схемы — разрешён». И канон эталона
[`docs/ARCHITECTURE/DB_DUMPS/a0-greenfield/README.md`](../../../ARCHITECTURE/DB_DUMPS/a0-greenfield/README.md):
«Role normalization допускает ровно шесть известных позиций в двух `reference_catalog_seed_owner` policies и
**останавливается при любой иной форме/позиции**».

## Диагноз уже сделан лидом — не переделывай его, проверь и используй

Обновление эталона падает fail-closed:

```bash
node scripts/refresh-a0-greenfield-baseline.mjs --confirm-local-dev-schema-refresh \
  --env-file=/home/dev/dev-projects/BersonCareBot/apps/webapp/.env.dev
# refresh-a0-greenfield-baseline: reference_catalog_policy_role_shape_changed:reference_categories
```

Причина — **устаревшее допущение генератора, а не дрейф схемы**:

- `scripts/a0-greenfield-baseline-lib.mjs:201` берёт `sourceRole` из **имени пользователя в `DATABASE_URL`**;
- сегодня это `bcb_dev_runtime_staff_login`;
- а сама политика в DEV жёстко ссылается на `app_owner`:
  `((CURRENT_USER = 'app_owner'::name) AND (NOT (EXISTS (SELECT 1 FROM reference_catalog_snapshot_receipts …`
- проверка `:249-253` требует, чтобы `sourceRole` встречался в каждой из двух политик ровно три раза
  (` TO <role> ` плюс два `CURRENT_USER = '<role>'::name`) — при `bcb_dev_runtime_staff_login` их ноль.

То есть генератор писался, когда роль подключения к DEV совпадала с ролью в политике. Она перестала совпадать,
и нормализация под disposable-владельца больше не находит, что нормализовать.

## Что нужно сделать

1. **Установить, какая форма правильна сегодня** — по миграциям, создающим эти политики, а не по догадке:
   роль в политике действительно стабильна (`app_owner` одинаков во всех средах) или она обязана совпадать
   с ролью подключения. От этого зависит, что нормализовать и нужно ли нормализовать вообще.
2. **Привести генератор в соответствие** минимальной правкой: нормализовать ту роль, которая реально стоит в
   политике, а не ту, под которой подключились. **Ослаблять проверку нельзя** — она обязана по-прежнему
   останавливаться на неизвестной форме; менять надо допущение, а не строгость.
3. **Обновить README эталона**, если формулировка про «exact DEV migration-owner» перестала быть верной.
4. **Самотест:** тест `scripts/a0-greenfield-baseline.test.mjs:117` уже проверяет, что подмена формы даёт
   `reference_catalog_policy_role_shape_changed`. Он обязан остаться красным на подменённой форме — покажи
   дословный вывод до и после правки.

## ⛔ Границы

- **Привилегированный шаг выполняет лид, не ты.** Сам `refresh-…mjs` требует `sudo -n -u postgres`, а
  песочница агента ставит `NoNewPrivs=1` — ядро отклонит `sudo` до всякой проверки прав. Ты готовишь правку и
  доказываешь её тестом; обновление эталона запускает лид и приносит результат.
- **Схему в DEV не менять**, миграции не писать, политики не править. Правка только в генераторе/тесте/README.
- **Прод не трогать ничем.**
- Ветка `wt/testsuite-b2`, коммиты только в неё. **Push и merge не делать, галочки плана не ставить.**
- Отчёт: `docs/_TODO/runs/testsuite-v2/B2A_REFRESH_ROLE_REPORT.md`, раздел «НЕ СДЕЛАНО» обязателен.

**Правила:** `.cursor/rules/host-psql-database-url.mdc`, `.cursor/rules/dev-prod-isolation-no-real-creds.mdc`,
`.cursor/rules/tests-check-behaviour-not-circumstances.mdc`, `.cursor/rules/test-execution-policy.md`.

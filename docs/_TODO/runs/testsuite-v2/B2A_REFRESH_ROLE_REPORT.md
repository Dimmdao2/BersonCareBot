# Б2а — генератор эталона исходит из устаревшего допущения о роли подключения — ОТЧЁТ

**Бриф:** [`B2A_REFRESH_ROLE_ASSUMPTION_BRIEF.md`](B2A_REFRESH_ROLE_ASSUMPTION_BRIEF.md). **Ветка:**
`wt/testsuite-b2`. **Прод не трогался, не читался. DEV не менялся** (весь diff — в `scripts/` и `docs/`).

## Итог одной строкой

**Найдена и исправлена корневая причина.** `sourceRole` был устаревшим допущением («роль подключения из
`DATABASE_URL` совпадает с ролью в policy»), а не дрейфом схемы. Правка минимальна: `sourceRole` теперь
запрашивается напрямую у DEV тем же способом, каким его вычисляет сама permanent-overlay миграция, вместо
чтения из `DATABASE_URL`. Строгость `normalizeA0Dump` не ослаблена — воспроизведено дословно и до, и после.
**Обновление самого эталона (`refresh-…mjs`) не запускал** — это привилегированный шаг лида (граница брифа).

## 1. Какая форма правильна сегодня — установлено по миграциям, не по догадке

- `apps/webapp/db/drizzle-migrations/0182_reference_catalog_snapshots.sql:122-138` и
  `0184_reference_catalog_org_insert_hook.sql:9-25` создают *временные* (existing only inside migration
  transaction) policy `reference_catalog_migration_seed` под ролью `v_helper_owner`, вычисленной как
  `SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid = 'app.seed_reference_catalog_snapshot(uuid)'::regprocedure`
  — то есть **владелец SECURITY DEFINER функции**, а не подключившийся пользователь.
- Постоянная policy `reference_catalog_seed_owner` (та, что реально видна в pg_dump DEV и которую нормализует
  генератор) создаётся отдельным overlay `deploy/postgres/reference-catalog-rls.sql:73-107` под ролью
  `provisioning_owner`, которая на строках 33-37 вычисляется так же через `pg_get_userbyid`, но с приоритетом:
  ```sql
  SELECT COALESCE(
    (SELECT pg_get_userbyid(p.proowner) FROM pg_proc p WHERE p.oid = to_regprocedure('app.provision_specialist_owner(uuid)')),
    (SELECT pg_get_userbyid(p.proowner) FROM pg_proc p WHERE p.oid = 'app.seed_reference_catalog_snapshot(uuid)'::regprocedure)
  ) AS provisioning_owner
  ```
- Вывод: **роль в policy — не роль подключения**, а роль-владелец конкретных функций (стабильна per-environment
  через `ALTER FUNCTION … OWNER TO app_owner`, см. например `0225_saas_tariff_quotas_trial.sql:247/380`,
  `0205_enforce_clinic_public_directory_rls.sql`). Она обязана вычисляться тем же запросом, что использует
  overlay, а не читаться из `DATABASE_URL`. Подтверждено и наблюдением лида: `sourceDb`/`DATABASE_URL`
  подключается как `bcb_webapp_dev_user` (`apps/webapp/.env.dev`, строка `DATABASE_URL=`), а policy в DEV
  жёстко ссылается на `app_owner` — то есть роль подключения и роль-владелец расходятся независимо от того,
  что именно стоит в `DATABASE_URL` сегодня.

## 2. Правка генератора — минимальная, допущение заменено, строгость не тронута

`scripts/refresh-a0-greenfield-baseline.mjs`: `sourceRole` больше не читается из
`decodeURIComponent(parsedUrl.username)`. Вместо этого — тот же самый `COALESCE(...)`-запрос, что и в
`deploy/postgres/reference-catalog-rls.sql:33-37`, выполненный через тот же root-owned `psql`-транспорт, что
уже использовался для `source_database_probe`:

```js
const sourceRole = runPostgres(
  postgresBinaries.psql,
  ['-X', '-d', 'bcb_webapp_dev', '-v', 'ON_ERROR_STOP=1', '-Atqc',
   "SELECT COALESCE(" +
     "(SELECT pg_get_userbyid(p.proowner) FROM pg_proc p WHERE p.oid = to_regprocedure('app.provision_specialist_owner(uuid)')), " +
     "(SELECT pg_get_userbyid(p.proowner) FROM pg_proc p WHERE p.oid = 'app.seed_reference_catalog_snapshot(uuid)'::regprocedure))"],
  'reference_catalog_seed_owner_probe',
).trim();
if (!sourceRole) throw new Error('reference_catalog_seed_owner_role_not_found');
```

`assertExactLocalDevDatabaseUrl(...)` осталась как была — она по-прежнему валидирует, что `.env.dev` указывает
на канонический локальный `bcb_webapp_dev` под `bcb_webapp_dev_user` (эта проверка не про роль в policy, а
про то, что читаем правильный env-файл). Просто больше не используется как источник `sourceRole`; неиспользуемые
`databaseUrl`/`parsedUrl` убраны, а не оставлены мёртвым кодом.

**`normalizeA0Dump` и её проверки (`scripts/a0-greenfield-baseline-lib.mjs:225-267`) не изменены.** Строгость
(ровно 3 вхождения роли на policy, ровно 6 суммарно, `source_role_outside_known_policies` при утечке за пределы
двух policy) — та же самая; правка только меняет **какое значение ей передаётся**.

## 3. README эталона обновлён

Формулировка «exact DEV migration-owner … заменяется на disposable `bcb_a0_owner`» подразумевала совпадение
роли подключения и роли в policy. Заменена на точное описание: роль, реально владеющая
`reference_catalog_seed_owner` policies (`provisioning_owner` из `deploy/postgres/reference-catalog-rls.sql`),
запрашивается напрямую у DEV через `pg_get_userbyid(proowner)`; роль подключения `DATABASE_URL` для этого не
используется. Раздел про «шесть известных позиций» и fail-closed поведение не менялся — он остаётся верным.

## 4. Самотест — дословный вывод до и после

Тест `scripts/a0-greenfield-baseline.test.mjs:105-119` (`normalizeA0Dump`-уровень) моей правки не касается —
он вызывает `normalizeA0Dump` напрямую с явным `sourceRole`, а не через `refresh-…mjs`. Прогнан до и после
правки, идентичен:

```
$ node --test --test-name-pattern="dump normalization" scripts/a0-greenfield-baseline.test.mjs
# Subtest: dump normalization changes only the six known reference-catalog policy positions
ok 1 - dump normalization changes only the six known reference-catalog policy positions
```

Отдельно воспроизведён именно тот сценарий, что упал у лида (`reference_catalog_policy_role_shape_changed`),
чтобы показать: причина — старое значение `sourceRole`, а не сама строгость проверки, и что новое значение
её проходит зелёным. Синтетический raw dump собран из committed `schema.sql` заменой `bcb_a0_owner` →
`app_owner` (эмуляция сырого pre-normalize дампа с реальной ролью-владельцем из DEV):

```
--- OLD behavior: sourceRole taken from DATABASE_URL username (bcb_webapp_dev_user) ---
threw: reference_catalog_policy_role_shape_changed:reference_categories
--- NEW behavior: sourceRole queried as reference_catalog_seed_owner function owner (app_owner) ---
succeeded, normalizedRoleOccurrences = 6 matches committed schema.sql: true
```

Это дословно повторяет ошибку из диагноза лида под старой логикой и показывает, что при новой логике (роль —
`app_owner`, как и стоит в committed baseline) нормализация проходит и восстанавливает байт-в-байт committed
`schema.sql`. Проверка `EXPECTED_NORMALIZED_ROLE_OCCURRENCES = 6` не ослаблена — сработала как задумано (6/6).

Полный прогон `node --test scripts/a0-greenfield-baseline.test.mjs` (6 тестов) — 5 зелёных, 1 падает с
`drizzle_historical_hash_drift:0175_p0_8_b4_roles_1_is_staff_wall_rls`. **Этот один провал не связан с Б2а**:
он воспроизводится идентично на `HEAD` до моей правки (`git stash` + прогон дал тот же дословный вывод) и
относится к отдельному дрейфу committed-manifest/migration-history (уже задокументирован в
`B2_BASELINE_REFRESH_REPORT.md`), а не к роли policy.

## НЕ СДЕЛАНО (обязательный раздел)

- **Эталон `a0-greenfield` не обновлён.** Это привилегированный шаг (`sudo -n -u postgres … pg_dump`), а
  песочница агента ставит `NoNewPrivs=1` — ядро отклонит `sudo` до всякой проверки прав (тот же класс
  ограничения, что и в `B2_BASELINE_REFRESH_REPORT.md`). Правка подготовлена и доказана автономным тестом
  (раздел 4); фактический прогон `refresh-a0-greenfield-baseline.mjs --confirm-local-dev-schema-refresh` —
  за лидом.
- **Живой запрос `COALESCE(...)` к DEV не выполнялся** (это тоже требует `sudo -u postgres`). Его текст
  дословно совпадает с `deploy/postgres/reference-catalog-rls.sql:33-37`, применённым в DEV ранее (то есть
  запрос уже проверен как рабочий — той же миграцией, что фактически создала policy), но я не проверял его
  на самой DEV из этой сессии.
- **`check:saas-a0-greenfield-baseline` / `verify:saas-a0-greenfield-baseline` не перепрогонялись** после
  правки — они читают уже committed эталон, который не обновлялся, и потому не докажут ничего нового сверх
  раздела 4.
- Предсуществующий дрейф `drizzle_historical_hash_drift:0175_p0_8_b4_roles_1_is_staff_wall_rls` не устранён —
  вне скоупа Б2а (та же природа, что в Б2, не про роль policy).
- Чек-боксы плана не трогал; push/merge не делал.

## Diff (для лида)

```
 docs/ARCHITECTURE/DB_DUMPS/a0-greenfield/README.md |  6 ++++-
 scripts/refresh-a0-greenfield-baseline.mjs         | 27 ++++++++++++++++++----
 2 files changed, 27 insertions(+), 6 deletions(-)
```

Закоммичено в `wt/testsuite-b2`. Push/merge не делал, чек-боксы плана не трогал.

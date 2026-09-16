# Аудит S0а: платформенное чтение семейства ЛФК

> **Текущий статус 11.09.2026:** применение на именованной DEV-базе независимо перепроверено и получило
> **PASS 7/7** — см. раздел «Повторный live-аудит применения после reconcile». Первоначальный BLOCKED ниже
> сохранён как исторический результат первого аудита, когда политика ещё не была применена.

**Кандидат:** `49fe1c4d8` от `feat/doctor-ui-rebuild@cf16f7845`
**Authority:** `EXERCISE_STORE_PLAN.md` §5 S0а, И1, И2
**Роль:** `auditor-live`

## Классификация до проверки

1. Повторяемое поведение: `app_staff` с org-context читает платформенного родителя и всех детей.
2. Повторяемое поведение: tenant isolation скрывает чужого родителя и всех детей.
3. Повторяемое поведение: `app_staff` не может INSERT/UPDATE/DELETE платформенный слой.
4. Повторяемое поведение: без org-context платформенный слой скрыт.
5. Повторяемое поведение: `app_patient` не получает ambient-доступ к платформенному слою.
6. Повторяемое поведение: прикладной `exercise_catalog` gate скрывает платформенный слой во всех докторских дверях.
7. Повторяемое поведение: owner-trigger не допускает расхождения владения родителя и детей; согласованное семейство читается целиком.
8. Качество разового действия для diff/регенерации и повторяемое поведение для tenant predicate invariant.
9. Качество разового действия: одинаковый полный privilege-suite на базе и кандидате.
10. Качество разового действия: committed diff ограничен четырьмя заявленными privilege-файлами.

## Blind kill-set

Составлен по authority до чтения кандидатного diff, production-кода и существующих тестов.

- K1: убрать разрешающую SELECT-ветку для платформенных строк → staff-каталог молча теряет платформенного родителя или одного из детей.
- K2: разрешить staff читать любую organization-строку → доктор видит карточку или ребёнка чужой клиники.
- K3: распространить платформенный предикат на запись → доктор меняет, удаляет либо создаёт платформенный контент.
- K4: убрать требование непустого org-context → техническая staff-сессия без клиники видит платформенный слой.
- K5: адресовать платформенную политику пациенту или PUBLIC → пациент получает ambient-видимость вместо definer-шва.
- K6: не применить прикладной `exercise_catalog` gate в одной из докторских дверей → выключенная клиника видит платформенную карточку через эту дверь.
- K7: отключить/обойти согласование ownership родителя и ребёнка либо пропустить дочернюю SELECT-политику → каталог видит неполное или смешанное семейство.
- K8: изменить declaration без синхронной регенерации либо ослабить tenant-предикат другой таблицы → механический gate не краснеет и пропускает privilege drift/regression.

## Результат

**BLOCKED / не land-ready.** Код кандидата даёт требуемую RLS-семантику в rollback-only проверке на живой
DEV, но точное объявление кандидата нельзя было применить к текущему DEV штатным reconciler: DEV уже содержит
более позднее удаление `public.be_service_location_availability`, а кандидат от старой базы всё ещё объявляет эту
таблицу. Reconcile атомарно откатился, четыре политики S0а в фактическом каталоге DEV отсутствуют, и сохранённый
acceptance-test закономерно красный на положительном чтении.

### Применение на DEV

- `bash deploy/host/migrate-dev.sh --preflight --runtime-env-root /home/dev/dev-projects/BersonCareBot` → PASS:
  `pending=0`, `total=173`, `verified-objects=332`, `foreign-ledger-rows=10`; проверка rollback-only.
- `--runtime-env-root` действительно preflight-only (`deploy/host/migrate-dev.sh:161-164`). Штатный путь
  применения декларации, который сам `migrate-dev.sh` вызывает на строке 331, —
  `node deploy/postgres/privileges/reconcile-access.mjs --env dev --db bcb_webapp_dev --admin-socket /var/run/postgresql --admin-port 5432`.
  Он был запущен из candidate checkout под host-lock и с DEV credential env, полученным штатным parser из
  `/home/dev/dev-projects/BersonCareBot`; результат: `ERROR: relation "public.be_service_location_availability" does not exist`.
  По контракту reconciler весь прогон находился в одной транзакции; каталог после ошибки подтверждает rollback.
- Причина расхождения доказана командой
  `git show --format='%H%n%s' --no-patch 27b2cf02e` →
  `27b2cf02e3f198db692eca3c4a09906bf6c990dc`,
  `feat(#1102): услуга включается только тогда, когда её кто-то делает`; этот более поздний коммит удалил
  отношение из schema/declaration. Команда
  `git merge-base --is-ancestor 49fe1c4d8 27b2cf02e; echo $?` → `0`, то есть состояние DEV новее фиксированной
  базы кандидата. Продуктовый rebase/regeneration аудитор не делал.
- Каталог после отката, запрос
  `WITH rels(tablename) AS (VALUES ('lfk_exercises'), ('lfk_exercise_media'), ('lfk_exercise_regions'), ('lfk_exercise_load_types')) SELECT rels.tablename, count(p.policyname) FROM rels LEFT JOIN pg_policies p ON p.schemaname='public' AND p.tablename=rels.tablename AND p.policyname LIKE 'rev10_platform_lfk_read_%' GROUP BY rels.tablename ORDER BY rels.tablename;`
  под `postgres@bcb_webapp_dev` → `0` для каждой из четырёх таблиц.

### Периметр

1. **1 → BLOCKED →** запросы под `app_staff@bcb_webapp_dev` после
   `app.begin_port_context(... target_role='app_staff', organization_id=<staff_org>)`:
   `SELECT count(*) FROM public.lfk_exercises WHERE id=<platform_uuid>;` и те же запросы по
   `lfk_exercise_media.exercise_id`, `lfk_exercise_regions.exercise_id`,
   `lfk_exercise_load_types.exercise_id`. С четырьмя точными candidate `FOR SELECT TO app_staff`-политиками,
   созданными в той же транзакции, результат → `1|1|1|1`; после `ROLLBACK` и на фактически установленном
   каталоге результат родителя → `0`, поэтому обязательная persistent live-приёмка не пройдена.
2. **2 → PASS →** под тем же `app_staff` и org-context запросы
   `SELECT count(*) ... WHERE id=<foreign_org_row_uuid>` / `WHERE exercise_id=<foreign_org_row_uuid>` →
   `0|0|0|0` для родителя, media, regions, load types. Fault K2 (платформенный `USING` заменён на
   `current_user='app_staff'`) → `PROOF_FOREIGN_PARENT: '1' !== '0'`.
3. **3 → PASS →** под тем же `app_staff` и org-context:
   `INSERT INTO public.lfk_exercises (... owner_kind, organization_id ...) VALUES (..., 'platform', NULL, ...)`
   → SQLSTATE `42501`; `UPDATE public.lfk_exercises SET title='forbidden' WHERE id=<platform_uuid> RETURNING 1`
   → `0` строк; `DELETE FROM public.lfk_exercises WHERE id=<platform_uuid> RETURNING 1` → SQLSTATE `42501`.
   Fault K3 (временная permissive `FOR ALL`-политика на platform rows) → assertion
   `unexpected psql outcome (0)` на INSERT: запрещённая запись прошла.
4. **4 → PASS →** под session login staff с `SET LOCAL ROLE app_staff`, но без
   `app.begin_port_context`, запрос
   `SELECT count(*) FROM public.lfk_exercises WHERE id=<platform_uuid>` → SQLSTATE `42501`.
   Отдельный запрос `SELECT app.current_org_id()` в той же роли → SQLSTATE `42501`
   (`accepted organization context required`), а не `NULL`: синтаксический член `IS NOT NULL` сам по себе
   избыточен, но поведение fail-closed обеспечено context gate/accessor. Fault K4 (в транзакции одновременно
   ослаблены restrictive context gate, org-policy и platform non-null gate) → запрос вернул `1`, assertion
   `unexpected psql outcome (0)` покраснел.
5. **5 → PASS →** под patient session login с `SET LOCAL ROLE app_patient` запрос
   `SELECT count(*) FROM public.lfk_exercises WHERE id=<platform_uuid>` → SQLSTATE `42501`.
   Candidate policy адресована только `app_staff`; существующий `c4d_platform_library_read`/definer-шов не
   менялся. Fault K5 (временные SELECT ACL + platform-policy для `app_patient`) → запрос вернул `1`, assertion
   `unexpected psql outcome (0)` покраснел.
6. **6 → PASS →** `git merge-base --is-ancestor c6c95e825 cf16f7845; echo $?` → `0`; тарифный gate уже входит
   в базу кандидата, а candidate diff application-код не меняет. Команда
   `pnpm --dir apps/webapp exec vitest run src/app-layer/guards/workspaceModuleAccess.rehabilitation.audit.unit.test.ts`
   → `1` файл PASS, `38` тестов PASS. Fault K6 (`rehabilitation: clinical && mechanicIsVisible(exerciseCatalog)`
   временно заменён на `rehabilitation: clinical`) → тот же прогон: `1` FAIL,
   `does not leak organization A exercise-catalog override into organization B`, expected `false`, received
   `true`; продуктовый файл восстановлен.
7. **7 → PASS →** запросы пункта 1 с точными candidate-policy дали `1|1|1|1`. Запрос
   `INSERT INTO public.lfk_exercise_media (... owner_kind, organization_id ...) VALUES (..., 'organization', <foreign_org>)`
   для platform-parent → SQLSTATE `23514`, constraint marker `lfk_child_owner_mismatch`.
   Fault K7a (media platform-policy `USING false`) → `PROOF_PLATFORM_MEDIA: '0' !== '1'`; fault K7b
   (временное `DISABLE TRIGGER ..._owner_guard`) → mismatch INSERT завершился с кодом `0`, assertion
   `unexpected psql outcome (0)` покраснел.
8. **8 → PASS →** `pnpm run check:db-privileges-generated` → PASS для DEV/TEST/PROD artifacts и port-context;
   `node --test deploy/postgres/privileges/tenant-predicate-invariant.test.mjs` → `5` PASS, `0` FAIL,
   включая встроенный self-fault «generator refuses once tenant predicate removed». Fault K8: временная строка
   `-- AUDIT FAULT: generated artifact drift` в DEV artifact → `check:db-privileges-generated` FAIL,
   `строка 2`, `расхождений 1`; artifact восстановлен.
9. **9 → PASS →** точная база `cf16f7845`:
   `/home/dev/brain/host-orch/run-tests.sh "pnpm run test:db-privileges"` → `344` tests, `177` PASS,
   `6` FAIL, `161` SKIP. Кандидат до добавления acceptance-test той же командой → те же
   `344/177/6/161` и те же шесть имён: `crossesTenantWall`, недоступная tenant-функция, ON CONFLICT seam,
   billing relation roles, lock-column wall, invoice-draft amount seam. После добавления opt-in acceptance-test
   команда выбрала `349` tests → `177` PASS, `6` FAIL, `166` SKIP: пять новых сценариев штатно SKIP без флага.
   Заявление воркера о шести докандидатных падениях подтверждено.
10. **10 → PASS →**
    `git diff --name-status cf16f7845e5f4a85c97663c4a7692ae2f7be83f0..49fe1c4d8ef22602dd0dc42e2493bfd6b46b4bd5`
    → ровно `declaration.ts` и три `deploy/postgres/generated/privileges.*.sql`;
    `git diff --stat ...` → `4 files changed, 36 insertions(+), 1 deletion(-)`. Application, schema,
    migrations и candidate tests не менялись.

### Acceptance-test и fault injection

Сохранён `deploy/postgres/privileges/platform-lfk-read.devDbProof.test.mjs`. Oracle — owner-plan S0а/И1/И2;
дорогая молчаливая поломка — чужие данные, ambient patient access или мутация referential platform-карточки;
публичная граница — реальный PostgreSQL под runtime role. Файл opt-in, принимает только именованную
`bcb_webapp_dev`, все fixtures живут внутри `BEGIN ... ROLLBACK`, после suite отдельно проверяется отсутствие
остатка. Весь K1–K8 пойман: K1/K2/K3/K4/K5/K7a/K7b — assertions live-proof, K6 — существующий application gate,
K8 — generated/invariant gates; каждый named class дал красное соответствующее утверждение.

- С точными candidate policies внутри rollback-only транзакций:
  `RUN_PLATFORM_LFK_READ_DB=1 node --test deploy/postgres/privileges/platform-lfk-read.devDbProof.test.mjs`
  → `5` PASS, `0` FAIL.
- На фактическом каталоге после неуспешного reconcile та же команда → `5` tests, `4` PASS, `1` FAIL:
  `PROOF_PLATFORM_PARENT: '0' !== '1'`. Это намеренно сохранённый красный acceptance handoff, а не принятый fix.

### Очистка

- Запрос под `postgres@bcb_webapp_dev`
  `SELECT count(*) FROM <lfk_table> WHERE owner_kind='platform' AND organization_id IS NULL` →
  `lfk_exercises=0`, `lfk_exercise_media=0`, `lfk_exercise_regions=0`, `lfk_exercise_load_types=0`.
- `SELECT count(*) FROM pg_policies WHERE policyname LIKE 'audit\\_%' ESCAPE '\\' OR policyname LIKE 'rev10_platform_lfk_read_%'`
  → `0`.
- `SELECT t.tgrelid::regclass, t.tgname, t.tgenabled FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='app' AND p.proname='enforce_lfk_child_owner'`
  → четыре child-owner triggers, каждый `tgenabled='O'`.
- Временные DDL/data были транзакционными; временная поломка application-кода и generated artifact восстановлены.

## Finding

**F1 / BLOCKER:** exact candidate declaration несовместима с более новым фактическим DEV schema и потому не
может быть штатно reconciled; обязательная установленная live-проверка S0а остаётся красной. Достижимое
последствие: после landing без интеграционного обновления `app_staff` продолжит получать `0` platform rows.
Нужен интеграционный rebase/перегенерация декларации на актуальном `feat`, затем штатный reconcile и повтор
сохранённого live-proof. Это продуктовая/integration-правка вне полномочий аудитора.

---

## Повторный live-аудит применения после reconcile — 11.09.2026

**Проверяемый committed candidate:** `4204dfc8c4c8408b639d8474920b644a730f2833`
**Authority:** `EXERCISE_STORE_PLAN.md` §5 S0а, И1, И2; brief «Аудит применения S0а на DEV»
**Роль:** `auditor-live`

### Классификация до проверки

1. Качество разового действия: четыре политики реально существуют в каталоге именованной DEV-БД.
2. Качество разового действия: фактические policy-поля совпадают с declaration и его generated projection.
3. Повторяемое поведение: сохранённый PostgreSQL proof проверяет чтение, tenant isolation и write denial.
4. Качество существующего acceptance-test: временная поломка фактической DEV-policy обязана покрасить proof.
5. Качество разового действия: generated artifacts побайтно совпадают с declaration.
6. Повторяемое security-поведение: реальный `app_staff` не пишет в platform layer при сохранённых соседних
   политиках и ACL.
7. Качество разового действия: каждый DB-вызов направлен только в `bcb_webapp_dev` через локальный socket.

Новый тест не создавался: сохранённый proof поймал фактическую fault injection на публичной PostgreSQL-границе.

### Периметр — итог 7/7 PASS

#### 1 → PASS → четыре policy реально существуют

Команда после восстановления инъекции:

```bash
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev \
  -v ON_ERROR_STOP=1 -P pager=off -c "SELECT tablename, policyname, cmd, roles, qual
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename IN ('lfk_exercises','lfk_exercise_media','lfk_exercise_regions','lfk_exercise_load_types')
   AND policyname LIKE 'rev10_platform_lfk_read_%'
 ORDER BY tablename, policyname;"
```

Полный вывод запрошенных полей:

```text
        tablename        |         policyname          |  cmd   |    roles    |                                                                                   qual
-------------------------+-----------------------------+--------+-------------+---------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 lfk_exercise_load_types | rev10_platform_lfk_read_98  | SELECT | {app_staff} | ((CURRENT_USER = 'app_staff'::name) AND (( SELECT app.current_org_id() AS current_org_id) IS NOT NULL) AND (owner_kind = 'platform'::text) AND (organization_id IS NULL))
 lfk_exercise_media      | rev10_platform_lfk_read_99  | SELECT | {app_staff} | ((CURRENT_USER = 'app_staff'::name) AND (( SELECT app.current_org_id() AS current_org_id) IS NOT NULL) AND (owner_kind = 'platform'::text) AND (organization_id IS NULL))
 lfk_exercise_regions    | rev10_platform_lfk_read_100 | SELECT | {app_staff} | ((CURRENT_USER = 'app_staff'::name) AND (( SELECT app.current_org_id() AS current_org_id) IS NOT NULL) AND (owner_kind = 'platform'::text) AND (organization_id IS NULL))
 lfk_exercises           | rev10_platform_lfk_read_101 | SELECT | {app_staff} | ((CURRENT_USER = 'app_staff'::name) AND (( SELECT app.current_org_id() AS current_org_id) IS NOT NULL) AND (owner_kind = 'platform'::text) AND (organization_id IS NULL))
(4 rows)
```

#### 2 → PASS → catalog совпадает с declaration

Команда:

```bash
sed -n '32759,32770p' deploy/postgres/privileges/declaration.ts
rg -n "rev10_platform_lfk_read" deploy/postgres/generated/privileges.bcb_webapp_dev.sql
```

Вывод declaration:

```text
function revision10PlatformLfkReadPolicy(tableKey: string, index: number): PolicyDecl[] {
  if (!REV10_PLATFORM_LFK_READ_RELATIONS.has(tableKey)) return [];
  return [{
    name: `rev10_platform_lfk_read_${index + 1}`,
    as: 'PERMISSIVE',
    cmd: 'SELECT',
    to: ['app_staff'],
    using: `(current_user = 'app_staff'::name AND app.current_org_id() IS NOT NULL`
      + ` AND "owner_kind" = 'platform' AND "organization_id" IS NULL)`,
    note: `staff may read, but not mutate, platform-owned LFK catalog rows in ${tableKey}`,
  }];
}
```

Вывод generated projection:

```text
14405:CREATE POLICY "rev10_platform_lfk_read_98" ON "public"."lfk_exercise_load_types" AS PERMISSIVE FOR SELECT TO "app_staff" USING ((current_user = 'app_staff'::name AND (SELECT app.current_org_id()) IS NOT NULL AND "owner_kind" = 'platform' AND "organization_id" IS NULL));
14448:CREATE POLICY "rev10_platform_lfk_read_99" ON "public"."lfk_exercise_media" AS PERMISSIVE FOR SELECT TO "app_staff" USING ((current_user = 'app_staff'::name AND (SELECT app.current_org_id()) IS NOT NULL AND "owner_kind" = 'platform' AND "organization_id" IS NULL));
14487:CREATE POLICY "rev10_platform_lfk_read_100" ON "public"."lfk_exercise_regions" AS PERMISSIVE FOR SELECT TO "app_staff" USING ((current_user = 'app_staff'::name AND (SELECT app.current_org_id()) IS NOT NULL AND "owner_kind" = 'platform' AND "organization_id" IS NULL));
14530:CREATE POLICY "rev10_platform_lfk_read_101" ON "public"."lfk_exercises" AS PERMISSIVE FOR SELECT TO "app_staff" USING ((current_user = 'app_staff'::name AND (SELECT app.current_org_id()) IS NOT NULL AND "owner_kind" = 'platform' AND "organization_id" IS NULL));
```

Сравнение с полным `pg_policies`-выводом пункта 1 даёт те же `name/cmd/roles/qual`; различия только в
канонической печати PostgreSQL (`CURRENT_USER`, явные casts и alias scalar-subquery). Побайтную связь
declaration → generated artifact независимо подтверждает пункт 5.

#### 3 → PASS → сохранённый proof зелёный на применённой базе

Команда после финального восстановления policy:

```bash
RUN_PLATFORM_LFK_READ_DB=1 PLATFORM_LFK_READ_PROOF_DB=bcb_webapp_dev \
  node --test deploy/postgres/privileges/platform-lfk-read.devDbProof.test.mjs
```

Вывод:

```text
TAP version 13
# Subtest: staff with an organization context reads the complete platform family and no foreign family
ok 1 - staff with an organization context reads the complete platform family and no foreign family
# Subtest: staff cannot insert, update, or delete the referential platform layer
ok 2 - staff cannot insert, update, or delete the referential platform layer
# Subtest: staff without an organization context cannot see platform rows
ok 3 - staff without an organization context cannot see platform rows
# Subtest: the patient role has no ambient read of the platform LFK layer
ok 4 - the patient role has no ambient read of the platform LFK layer
# Subtest: the child-owner trigger rejects a child that disagrees with its platform parent
ok 5 - the child-owner trigger rejects a child that disagrees with its platform parent
1..5
# tests 5
# suites 0
# pass 5
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 668.315948
```

#### 4 → PASS → proof красный на сломанной DEV-policy, затем policy возвращена

Временная поломка и обязательное восстановление выполнялись одной foreground-командой с
`trap restore_policy EXIT HUP INT TERM`. Существенные команды:

```bash
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev \
  -v ON_ERROR_STOP=1 -c "ALTER POLICY rev10_platform_lfk_read_101 ON public.lfk_exercises
  USING ((current_user = 'app_staff'::name));"
RUN_PLATFORM_LFK_READ_DB=1 PLATFORM_LFK_READ_PROOF_DB=bcb_webapp_dev \
  node --test deploy/postgres/privileges/platform-lfk-read.devDbProof.test.mjs
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev \
  -v ON_ERROR_STOP=1 -c "ALTER POLICY rev10_platform_lfk_read_101 ON public.lfk_exercises
  USING ((current_user = 'app_staff'::name AND (SELECT app.current_org_id()) IS NOT NULL
    AND owner_kind = 'platform' AND organization_id IS NULL));"
```

Вывод сломанного состояния и proof:

```text
ALTER POLICY
 current_database |         policyname          |  cmd   |    roles    |                qual
------------------+-----------------------------+--------+-------------+------------------------------------
 bcb_webapp_dev   | rev10_platform_lfk_read_101 | SELECT | {app_staff} | (CURRENT_USER = 'app_staff'::name)
(1 row)

not ok 1 - staff with an organization context reads the complete platform family and no foreign family
error: |-
  PROOF_FOREIGN_PARENT: the non-empty foreign row must stay hidden

  '1' !== '0'
expected: '0'
actual: '1'
...
# tests 5
# pass 4
# fail 1
FAULT_PROOF_EXIT=1
```

Вывод восстановления:

```text
ALTER POLICY
 current_database |         policyname          |  cmd   |    roles    |                                                                                   qual
------------------+-----------------------------+--------+-------------+---------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 bcb_webapp_dev   | rev10_platform_lfk_read_101 | SELECT | {app_staff} | ((CURRENT_USER = 'app_staff'::name) AND (( SELECT app.current_org_id() AS current_org_id) IS NOT NULL) AND (owner_kind = 'platform'::text) AND (organization_id IS NULL))
(1 row)
```

Затем полный postcheck пункта 1 вернул все четыре исходные policy, а повторный proof пункта 3 снова дал 5/5.

#### 5 → PASS → generated drift-gate зелёный

Команда:

```bash
pnpm run check:db-privileges-generated
```

Вывод:

```text
> berson-care-bot@1.0.0 check:db-privileges-generated
> node deploy/postgres/privileges/generate-cli.mjs --check && node deploy/postgres/privileges/generate-cli.mjs --all --check --port-context-only

ok bcb_webapp_dev/privileges: deploy/postgres/generated/privileges.bcb_webapp_dev.sql совпадает побайтно
ok bcb_webapp_dev/allowlist: deploy/postgres/generated/org-allowlist.bcb_webapp_dev.sql совпадает побайтно
ok bersoncarebot_test/privileges: deploy/postgres/generated/privileges.bersoncarebot_test.sql совпадает побайтно
ok bersoncarebot_test/allowlist: deploy/postgres/generated/org-allowlist.bersoncarebot_test.sql совпадает побайтно
ok therapysto_prod/privileges: deploy/postgres/generated/privileges.therapysto_prod.sql совпадает побайтно
ok therapysto_prod/allowlist: deploy/postgres/generated/org-allowlist.therapysto_prod.sql совпадает побайтно
--check: артефакты соответствуют декларации побайтно.
ok bcb_webapp_dev/portContext: deploy/postgres/generated/port-context-capabilities.bcb_webapp_dev.sql совпадает побайтно
ok bersoncarebot_test/portContext: deploy/postgres/generated/port-context-capabilities.bersoncarebot_test.sql совпадает побайтно
ok therapysto_prod/portContext: deploy/postgres/generated/port-context-capabilities.therapysto_prod.sql совпадает побайтно
--check: артефакты соответствуют декларации побайтно.
```

Это файловый generator-check; он не подключается ни к TEST, ни к PROD.

#### 6 → PASS → прежние стены на месте, platform write реально запрещена

Команда catalog inspection:

```bash
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev \
  -v ON_ERROR_STOP=1 -P pager=off -c "SELECT tablename, policyname, permissive, cmd, roles,
  (qual IS NOT NULL) AS has_using, (with_check IS NOT NULL) AS has_with_check
  FROM pg_policies WHERE schemaname='public'
  AND tablename IN ('lfk_exercises','lfk_exercise_media','lfk_exercise_regions','lfk_exercise_load_types')
  ORDER BY tablename, policyname;"
```

Вывод для обязательных соседних policy:

```text
lfk_exercise_load_types | rev10_context_gate_98          | RESTRICTIVE | ALL | {app_staff} | t | t
lfk_exercise_load_types | rev10_saas_org_dormant_p0_8_3  | PERMISSIVE  | ALL | {app_staff} | t | t
lfk_exercise_media      | rev10_context_gate_99          | RESTRICTIVE | ALL | {app_staff} | t | t
lfk_exercise_media      | rev10_saas_org_dormant_p0_8_4  | PERMISSIVE  | ALL | {app_staff} | t | t
lfk_exercise_regions    | rev10_context_gate_100         | RESTRICTIVE | ALL | {app_staff} | t | t
lfk_exercise_regions    | rev10_saas_org_dormant_p0_8_3  | PERMISSIVE  | ALL | {app_staff} | t | t
lfk_exercises           | rev10_context_gate_101         | RESTRICTIVE | ALL | {app_staff} | t | t
lfk_exercises           | rev10_saas_org_dormant_p0_8_3  | PERMISSIVE  | ALL | {app_staff} | t | t
```

Прямой write-proof использовал уже существующий active staff member и его declaration-owned capability,
открыл accepted port-context, затем реально исполнил:

```sql
INSERT INTO public.lfk_exercises (id, owner_kind, organization_id, catalog_scope, title)
VALUES (gen_random_uuid(), 'platform', NULL, 'catalog', 'S0a forbidden platform write proof');
```

Команда подключения: `sudo -n -u postgres psql -X -A -t -q -h /var/run/postgresql -p 5432
-d bcb_webapp_dev -v ON_ERROR_STOP=1`; перед INSERT в той же транзакции выполнены
`SET LOCAL SESSION AUTHORIZATION <staff-session-login>` и `app.begin_port_context(...)` для `app_staff`.
Вывод:

```text
WRITE_CONTEXT|app_staff@bcb_webapp_dev
ERROR:  42501: new row violates row-level security policy for table "lfk_exercises"
LOCATION:  ExecWithCheckOptions, execMain.c:2234
PLATFORM_WRITE_EXIT=3
```

Тот же inventory сохранил все restrictive context gates, tenant `FOR ALL ... WITH CHECK`, отдельные platform
`FOR SELECT` и существующие named-seam policy на parent/media. Точные declared write ACL:

```bash
rg -n '^GRANT .*lfk_(exercise_load_types|exercise_media|exercise_regions|exercises).* TO "app_staff";$' \
  deploy/postgres/generated/privileges.bcb_webapp_dev.sql
```

```text
14376:GRANT SELECT, DELETE ON TABLE "public"."lfk_exercise_load_types" TO "app_staff";
14377:GRANT INSERT ("exercise_id", "load_type", "organization_id", "owner_kind") ON TABLE "public"."lfk_exercise_load_types" TO "app_staff";
14418:GRANT SELECT, DELETE ON TABLE "public"."lfk_exercise_media" TO "app_staff";
14419:GRANT INSERT ("created_at", "exercise_id", "id", "media_type", "media_url", "organization_id", "owner_kind", "sort_order") ON TABLE "public"."lfk_exercise_media" TO "app_staff";
14458:GRANT SELECT, DELETE ON TABLE "public"."lfk_exercise_regions" TO "app_staff";
14459:GRANT INSERT ("exercise_id", "organization_id", "owner_kind", "region_ref_id") ON TABLE "public"."lfk_exercise_regions" TO "app_staff";
14499:GRANT SELECT ON TABLE "public"."lfk_exercises" TO "app_staff";
14500:GRANT INSERT ("catalog_scope", "contraindications", "created_at", "created_by", "description", "difficulty_1_10", "id", "is_archived", "load_type", "organization_id", "owner_kind", "region_ref_id", "tags", "title", "updated_at") ON TABLE "public"."lfk_exercises" TO "app_staff";
14501:GRANT UPDATE ("contraindications", "created_by", "description", "difficulty_1_10", "is_archived", "load_type", "region_ref_id", "tags", "title", "updated_at") ON TABLE "public"."lfk_exercises" TO "app_staff";
```

Фактические table-level grants:

```bash
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev \
  -v ON_ERROR_STOP=1 -P pager=off -c "SELECT table_name, privilege_type,
  string_agg(DISTINCT grantee, ',' ORDER BY grantee) AS grantees
  FROM information_schema.role_table_grants
  WHERE table_schema='public' AND grantee='app_staff'
  AND table_name IN ('lfk_exercises','lfk_exercise_media','lfk_exercise_regions','lfk_exercise_load_types')
  GROUP BY table_name, privilege_type ORDER BY table_name, privilege_type;"
```

```text
       table_name        | privilege_type | grantees
-------------------------+----------------+-----------
 lfk_exercise_load_types | DELETE         | app_staff
 lfk_exercise_load_types | SELECT         | app_staff
 lfk_exercise_media      | DELETE         | app_staff
 lfk_exercise_media      | SELECT         | app_staff
 lfk_exercise_regions    | DELETE         | app_staff
 lfk_exercise_regions    | SELECT         | app_staff
 lfk_exercises           | SELECT         | app_staff
(7 rows)
```

Фактические column-level write grants:

```bash
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev \
  -v ON_ERROR_STOP=1 -P pager=off -c "SELECT table_name, privilege_type,
  string_agg(column_name, ', ' ORDER BY column_name) AS columns
  FROM information_schema.role_column_grants
  WHERE table_schema='public' AND grantee='app_staff'
  AND table_name IN ('lfk_exercises','lfk_exercise_media','lfk_exercise_regions','lfk_exercise_load_types')
  AND privilege_type IN ('INSERT','UPDATE')
  GROUP BY table_name, privilege_type ORDER BY table_name, privilege_type;"
```

```text
       table_name        | privilege_type |                                                                                         columns
-------------------------+----------------+-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 lfk_exercise_load_types | INSERT         | exercise_id, load_type, organization_id, owner_kind
 lfk_exercise_media      | INSERT         | created_at, exercise_id, id, media_type, media_url, organization_id, owner_kind, sort_order
 lfk_exercise_regions    | INSERT         | exercise_id, organization_id, owner_kind, region_ref_id
 lfk_exercises           | INSERT         | catalog_scope, contraindications, created_at, created_by, description, difficulty_1_10, id, is_archived, load_type, organization_id, owner_kind, region_ref_id, tags, title, updated_at
 lfk_exercises           | UPDATE         | contraindications, created_by, description, difficulty_1_10, is_archived, load_type, region_ref_id, tags, title, updated_at
(5 rows)
```

Наборы колонок совпадают с generated declaration; reconcile не расширил write grants. Исторический table-level
DELETE на трёх child-таблицах также виден в declared output выше. Несмотря на сохранённые tenant write-grants,
platform-row закрыта отдельной SELECT-only policy и прежней tenant `FOR ALL ... WITH CHECK`: запрещённый INSERT
не оставил строку, транзакция была оборвана PostgreSQL на `42501`.

#### 7 → PASS → только локальная DEV-база; TEST/PROD не затронуты

Все DB-команды этого прохода перечислены в пунктах 1, 4 и 6 и содержат одновременно:
`-h /var/run/postgresql -p 5432 -d bcb_webapp_dev`. Proof дополнительно получил
`PLATFORM_LFK_READ_PROOF_DB=bcb_webapp_dev` и сам fail-closed отказывает при любом другом имени базы.

Команда target identity:

```bash
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev \
  -v ON_ERROR_STOP=1 -c "SELECT current_database() AS database,
  inet_server_addr() AS server_addr, current_setting('port') AS server_port;"
```

Вывод:

```text
    database    | server_addr | server_port
----------------+-------------+-------------
 bcb_webapp_dev |             | 5432
(1 row)
```

Пустой `server_addr` при явно заданном `-h /var/run/postgresql` подтверждает Unix-domain socket, не TCP.
`reconcile-access.mjs` в этом audit-pass не перезапускался; применённое воркером состояние проверялось
интроспекцией и поведением. `check:db-privileges-generated` читал файлы всех сред, но ни к одной БД не подключался.
Команд с `bersoncarebot_test`, `therapysto_prod`, адресами `135.*`, TEST/PROD env или remote host не было.

### Fault-injection tally

**Убито 1 / непойманных 0.** Ослабление фактически применённой policy до staff-only предиката поймано
на чужом tenant row; после восстановления тот же proof снова зелёный 5/5.

### НЕ ПРОВЕРЕНО

- TEST и оба PROD намеренно не открывались и не инспектировались: это запрещено brief; их runtime-состояние
  этим DEV-аудитом не утверждается.
- Owner UI-проход «включить тариф и увидеть постоянное платформенное упражнение» не выполнялся: brief проверяет
  DB-применение, а proof использует только rollback fixtures. Живая UI-приёмка остаётся отдельным milestone-gate.
- S0б, S0в, полный CI и application-код не входят в этот audit-pass и не проверялись.

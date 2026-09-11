# Аудит S0а: платформенное чтение семейства ЛФК

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

# Исправление исчерпывающей семантики жизненного цикла и purge (#987) — 28.08.2026

Ветка `wt/fix-lifecycle-purge-census-20260828`. Вход: принятый аудит
`docs/_TODO/runs/FINAL_EXHAUSTIVE_LIFECYCLE_CENSUS_AUDIT_2026-08-28.md`, оракул — этап 3 плана
`docs/_TODO/SYSTEMIC_RESIDUAL_AUDIT_AND_FIX_PLAN_2026-08-27.md`.

Границы соблюдены: UI, env, taskdb, домены, PROD и другие ветки не тронуты; деплоя нет; full CI не гонялся;
одноразовая БД не создавалась; TEST только на чтение; миграция к DEV/TEST **не применена** (весь живой прогон —
внутри транзакции с безусловным `ROLLBACK`). Hard purge остаётся выключенным продуктово-юридическим гейтом
PR-03: этап делает спящую машинерию верной и fail-closed, а не включает разрушительное поведение.

## Что сделано по каждой принятой находке

### 1. Журнал доставки и account purge

`notification_delivery_attempts` — удерживаемый 180 дней факт доставки, а не вторая запись об учётке. Сырую
личность человека несут ТРИ живые поверхности, а реестр называл только одну (`user_id`). Замерено на DEV /
TEST (read-only): `user_id` 7044 строк / 36 человек и 11222 / 40; `integrator_user_id` 537 / 110 и 536 / 110;
`metadata` 1956 / 41 и 3616 / 44.

Реализовано расширением ЕДИНСТВЕННОГО существующего механизма `ANONYMISE_ON_PURGE_COLUMNS`
(`apps/webapp/src/infra/platformUserFullPurge.ts`), а не новым журналом и не новой функцией: запись цели
получила необязательные `alsoNullColumns` и `scrubJsonColumns`, один общий исполнитель
`anonymisePurgedUserReferences` обнуляет обе колонки-ссылки и текстово заменяет id в документе `metadata` на
`PURGED_USER_JSON_TOKEN`. Скраб текстовый, потому что uuid лежит в свободном тексте документа, а не в
фиксированном ключе. Неотносящиеся факты доставки не удаляются; исход доставки живёт до своего штатного
180-дневного прохода.

`OQ-DELIVERY-ATTEMPT-USER-PURGE` снят: реестр объявляет `explicit-anonymise` на `user_id`, решение владельца
из брифа («убрать личность, сохранить неидентифицирующий исход») записано в реестре как факт, а не как вопрос.

### 2. Лимитер `auth.channel_link_start`

Это единственный scope, чей ключ — сырой platform user id. Реестр называл таблицу «ограниченной собственным
окном лимитера», и это верно лишь для ключа, по которому продолжают ходить: `app.auth_rate_limit_check_and_record`
чистит истёкшие строки ТЕКУЩЕЙ пары `(scope, key)`, а после последней попытки привязки — тем более после
удаления учётки — следующего вызова нет. Замер: 15 строк с 11 разными `role='client'` uuid на DEV, столько же
на TEST.

Использованы оба уже существующих корня, параллельного чистильщика не заведено:
`scopePrune: { retentionMs: 1ч, intervalMs: 5м, batchSize: 500 }` — та же форма и та же DB-функция, что у
`patient.client_boot_report`; ключ удалённого человека дополнительно уносится account purge через
`CONTENT_TABLES` (`auth_rate_limit_events.key`).

### 3. Столкновение личности пациента и сотрудника

Человек с живым специалистским корнем больше не проходит strict client hard purge. Перед любой разрушительной
работой `runWebappPurgeCoreInTransaction` вызывает `assertNoBlockingIdentityRoot` по объявленному списку
`IDENTITY_ROOT_TABLES` (сегодня — `be_specialists.id`) и падает закрыто с `PurgeIdentityRootConflictError`;
`strictPlatformUserPurge` отображает это в типизированный отказ `error: 'identity_in_use'` c
`identityConflicts` и аудит-строкой. Второй модели личности не заведено, данные врача не удаляются.

Доказано живьём на DEV (rollback-only): найден один реальный человек, одновременно client-учётка и специалист;
внутри той же транзакции после отказа специалист на месте (1 строка), расписание и приёмы целы.

### 4. Правда об organization purge

Продуктового сервиса удаления организации в репозитории нет — путь удаления это сам FK-граф от
`DELETE FROM be_organizations`, и именно против него написан `orgPurge` реестра. Второй сервис не заведён;
изменено поведение существующих связей миграцией
`apps/webapp/db/drizzle-migrations/20260828T131900_organization_purge_reaches_every_named_class.sql`:

- `outgoing_delivery_queue.organization_id` и `media_playback_stats_hourly.organization_id` — FK не было
  вообще, сырой uuid клиники просто переживал удаление. Добавлен FK `ON DELETE CASCADE`.
- `manual_patient_commands` доходил до клиники только через пару enrollment с умолчанием `NO ACTION`: строка
  отказывала и в удалении организации, и (F1) в удалении учётки любого пациента, когда-либо получавшего
  ручную команду. `org_enrollments` каскадится от обоих родителей, поэтому каскад от него — весь ответ; под
  проверяемую составную ссылку добавлен ведущий индекс `(organization_id, platform_user_id)`.
- `organization_slug_claims` и `organization_slug_rename_events` — обратный случай: они обязаны ПЕРЕЖИТЬ
  клинику. Колонка стала nullable, FK — `ON DELETE SET NULL`, строка остаётся несвязанным tombstone, который
  продолжает держать публичный slug и хранить доказательство владения им.
- Ярлыки реестра исправлены там, где FK и так каскадился: `user_phone_history` и
  `operator_health_failure_archive` были подписаны `not-org-scoped` при живом `ON DELETE CASCADE` —
  поведение было безопасным, написанное утверждение ложным.

**Tombstone, который база отказывается записать, — не tombstone.** Оба slug-стража
(`app.guard_organization_slug_claim_mutation`, `app.guard_organization_slug_rename_event_mutation`) стоят
`BEFORE DELETE OR UPDATE` и отклоняли любую мутацию долговечной строки: с неизменёнными стражами `SET NULL`
просто переносит отказ с ограничения на триггер. Замерено живьём до правки:

```
ERROR:  organization slug aliases are immutable outside same-organization reclaim
```

Стражи расширены (`CREATE OR REPLACE`, тот же владелец, второй гейт не заведён) ровно на один переход —
освобождение личности, и только когда на строке больше ничего не двигается: `organization_id → NULL` у обоих,
плюс `actor_platform_user_id → NULL` у аудита переименований. Без второго ни `SET NULL` этой миграции, ни
уже ожидающий actor-`SET NULL` из `20260828T085822_anonymise_audit_actors_on_account_delete.sql` не смогли бы
сработать: страж отказал бы, и удаление учётки не обезличило бы строку, а упало.

### 5. Исполнимые корни хранения

Разрешающий ярлык «любое имя с точкой» в `journalLifecycleRegistry.contract.test.ts` заменён проверкой против
реальности. Корень принимается ровно в трёх видах: метка из закрытого списка `RETENTION_SWEEP_TARGETS`;
`<jobKey>:<branch>`, где `jobKey` совпадает с подметающим заданием И модуль этого задания действительно
объявляет такую ветку (`MEDIA_PLAYBACK_STATS_RETENTION_BRANCHES`, `PRODUCT_ANALYTICS_RETENTION_BRANCHES`);
`schema.function`, которую УСТАНАВЛИВАЕТ `declaration.ts` и до которой достаёт capability с prune-назначением.
Дополнительно требуется `staleAfterSec > 0` у подметающего задания — то есть health signal, а не только
расписание. Тест источника не читает и второго стенда не заводит.

Запись оператора исправлена на настоящий prune-корень: архивный корень ПЕРЕНОСИТ живые отказы в таблицу и не
чистит её; 30-дневное окно применяет `app.prune_operator_health_failure_archive`, которую и вызывает
планировщик через `pruneArchivedOlderThanDays`.

Тем же гейтом найден НОВЫЙ экземпляр того же класса: `media_playback_resolution_events` и
`media_playback_client_events` объявляли 30-дневные окна, указывающие на ветки модуля, которых никто не
реализует, — удаления этих таблиц нет нигде в репозитории. Срок не выдуман: записан открытый вопрос
`OQ-PLAYBACK-EVENT-STORES-WINDOW`.

### 6. Rollback-only доказательство

`platformUserFullPurge.devDbProof.test.ts` расширен так, что выводит и физически проверяет структурированную
поверхность решений целиком:

- проверяются ВСЕ 164 структурированных non-journal решения, а не только 57 записей реестра
  (`structuredDecisionsChecked > 100`);
- добавлены FK-free классы: `explicit-delete` теперь читается из `CONTENT_TABLES` + `DIARY_TABLES` +
  `IDENTITY_TABLES` (раньше только из первого, из-за чего пять правдивых объявлений выглядели ложными),
  `explicit-anonymise` — из колонки и `alsoNullColumns`, отдельно проверяется скраб `metadata`;
- `via-parent` считается транзитивным замыканием каскадов, а не одним уровнем (настоящие двухуровневые цепочки
  `treatment_program_instance_stage_items → …_stages → …_instances` больше не выглядят ложными);
- добавлен org-оракул: FK к `public.be_organizations` и отдельно список отношений, физически несущих
  `organization_id`;
- исправлено собственное утверждение о полном числе строк для намеренно удаляемого platform user;
- живые классы `explicit-anonymise` не могут молча пропуститься: `provenExplicitAnonymise` требует непустого
  измерения;
- прежние именованные специалистские/бухгалтерские пути сохранены; каждый прогон по-прежнему безусловно
  откатывается.

Пять ранее записанных расхождений реестр/FK закрыты в продукте, схеме и реестре, а не приняты как известный
красный baseline: `media_files` получил честный вид `deferred-delete` (строки удаляются после коммита, после
S3); `message_log` внесён в `CONTENT_TABLES`, а остаточный statement сужен до легаси TEXT-колонки (то же
множество строк); три staff-actor FK закрывает уже ожидающая миграция `20260828T085822`, и проба теперь
приписывает их именно ей, сверяясь с живым ledger `drizzle.__drizzle_migrations`, а не глотает как «известное
красное». Ledger DEV отстаёт от HEAD на 9 миграций — поэтому эти FK на DEV всё ещё читаются как `NO ACTION`.

### 7. Мёртвое объявление

`public.user_email_setup_tokens` проверен независимо: таблицы нет ни в одной управляемой базе; писателя,
читателя и человеческого пути нет; имя встречается только в самом объявлении, реестре, сгенерированных
артефактах, документах и разовом `apps/webapp/scripts/consolidate-owner-identity.sql`; в Drizzle-схеме её нет.
Ушедшее объявление и структурированное решение удалены, мёртвая таблица ради census НЕ воссоздана. Артефакты
перегенерированы штатным `generate-cli.mjs --all`; диff — удалённый блок таблицы и детерминированный сдвиг
индекса политик (211 → 210).

**Census после правки: 221 объявленная физическая таблица = 57 записей реестра + 164 структурированных решения**
(`missing`, `undeclared`, `overlap` — пустые), против 222/58/164 до неё.

## Обязательный письменный анализ привилегий миграции

Файл: `apps/webapp/db/drizzle-migrations/20260828T131900_organization_purge_reaches_every_named_class.sql`,
10 statement-блоков. `GRANT`, `REVOKE`, ролевых и policy-операторов в файле НЕТ (проверено
`check-migration-privileges: OK (103 migration files)`); привилегии объявляются и сверяются только через
`deploy/postgres/privileges/`.

**Изменяемые объекты и исполняющий владелец.** Все десять блоков помечены
`-- BCB-MIGRATION-OWNER: app_object_owner`. Это правильная роль: все затронутые таблицы и `be_organizations`
принадлежат `app_object_owner` (замерено на DEV), обе заменяемые функции тоже принадлежат `app_object_owner`,
и схема `app` принадлежит ему же.

| Объект | Операция | Владелец объекта | RLS / FORCE RLS |
|---|---|---|---|
| `public.outgoing_delivery_queue` | ADD FK → `be_organizations` CASCADE | `app_object_owner` | `t` / `t` |
| `public.media_playback_stats_hourly` | ADD FK → `be_organizations` CASCADE | `app_object_owner` | `t` / `t` |
| `public.manual_patient_commands` | DROP+ADD составной FK → `org_enrollments` CASCADE, CREATE INDEX | `app_object_owner` | `t` / `t` |
| `public.organization_slug_claims` | DROP NOT NULL, DROP+ADD FK SET NULL | `app_object_owner` | `t` / `t` |
| `public.organization_slug_rename_events` | DROP NOT NULL, DROP+ADD FK SET NULL | `app_object_owner` | `t` / `t` |
| `app.guard_organization_slug_claim_mutation()` | CREATE OR REPLACE | `app_object_owner` | — |
| `app.guard_organization_slug_rename_event_mutation()` | CREATE OR REPLACE | `app_object_owner` | — |

**Привилегии, нужные для исполнения тела.** `ALTER TABLE … ADD/DROP CONSTRAINT`, `ALTER COLUMN … DROP NOT NULL`
и `CREATE INDEX` требуют владения таблицей — оно есть. Ссылающиеся FK дополнительно требуют `REFERENCES` на
`be_organizations` / `org_enrollments`: владение ими покрывает это. `CREATE OR REPLACE FUNCTION` в схеме `app`
требует `CREATE` на схеме и `USAGE` на языке `plpgsql`; собственные `CREATE`/`USAGE` владельца схемы в этой
базе отозваны (в `nspacl` записи `app_object_owner=UC/app_object_owner` нет), поэтому оба функциональных блока
несут `-- BCB-MIGRATION-SCHEMA-CREATE: app` и `-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql`: порт выдаёт ровно эти
две временные привилегии владельцу на время миграции и снимает их в том же прогоне. Без этих маркеров preflight
падал ровно так: `ERROR: permission denied for schema app`. `REHOME-FUNCTION` не нужен — обе функции уже
принадлежат `app_object_owner`.

**FORCE RLS и RI-триггеры.** У всех пяти таблиц и у `be_organizations` включены и `relrowsecurity`, и
`relforcerowsecurity`, поэтому вопрос «не заблокирует ли FORCE RLS проверку ссылочной целостности» обязателен.
Не заблокирует: проверки RI выполняются как владелец ссылаемой таблицы с флагом `SECURITY_NOFORCE_RLS`, то есть
FORCE RLS на `be_organizations` к ним не применяется. Эмпирическое подтверждение того же класса — 153 уже
существующих FK, ссылающихся на `be_organizations` в этой же базе, и живой rollback-only прогон каскада ниже.

**Изменения объявления.** Миграция не создаёт и не удаляет таблиц, не удаляет колонок, не заводит новых ролей
и seam-ов, поэтому добавлений в `declaration.ts` не требует. Единственное изменение объявления в этом проходе
не связано с миграцией: удалена строка мёртвой `public.user_email_setup_tokens`; артефакты перегенерированы
штатным CLI и совпадают побайтно (`--check`). Обе заменяемые функции остаются `SECURITY INVOKER`
(`prosecdef = f`) с `SET search_path TO 'pg_catalog'` и прежним ACL `app_object_owner=X/app_object_owner` —
`CREATE OR REPLACE` не меняет ни владельца, ни права, ни класс безопасности.

**Проба верификации.** Два блока несут `-- BCB-MIGRATION-VERIFY`: первый требует ровно пять ожидаемых
`confdeltype` (три `c`, два `n`), второй — присутствия разрешённого перехода в теле обеих функций. На живом
DEV обе пробы дают `f` (миграция не применена) и обе дают `t` внутри применённой и откаченной транзакции.

## Команды и результаты

Все прогоны — в переднем плане, до конца.

```
bash deploy/host/migrate-dev.sh --preflight --runtime-env-root /home/dev/dev-projects/BersonCareBot
→ PASS: "Drizzle owner-ordered migration validated and rolled back for \"bcb_webapp_dev\":
  pending=9 total=102 reapplied=0 foreign-ledger-rows=4 relabeled=0 dropped-foreign=0
  dropped-foreign-by-hash=0 unapplied=0"   (session_user=bcb_dev_migrator, current_user=app_object_owner)

VERIFY-пробы на живом DEV (миграция НЕ применена):        f | f
те же пробы внутри применённой и откаченной транзакции:    t | t

pnpm --dir apps/webapp exec vitest run src/modules/db-retention/journalLifecycleRegistry.contract.test.ts
→ 1 file passed, 9/9 tests passed

RUN_PLATFORM_USER_PURGE_DB=1 pnpm --dir apps/webapp exec vitest run \
  src/infra/platformUserFullPurge.devDbProof.test.ts
→ 1 file passed, 16/16 tests passed, пропусков нет
```

Полный поимённый список 16 зелёных случаев (verbose-прогон) включает, помимо прежних: «really de-identifies
the FK-free columns the purge promises to null», «scrubs the raw person id out of the retained delivery
documents», «checks every structured non-journal decision, not just the registry», «found a live person who is
both a client account and a specialist root», «fails the purge closed with a reason, and leaves specialist,
schedule and appointments intact».

Проба честно печатает восемь оставшихся расхождений и приписывает каждое ИМЕНОВАННОЙ ожидающей миграции,
сверенной с живым ledger (`registryDivergences` при этом пуст):

```
public.manual_patient_commands.organization_id          → 20260828T131900_…
public.media_playback_stats_hourly.organization_id      → 20260828T131900_…
public.organization_slug_claims.organization_id         → 20260828T131900_…
public.organization_slug_rename_events.organization_id  → 20260828T131900_…
public.outgoing_delivery_queue.organization_id          → 20260828T131900_…
public.online_intake_status_history.changed_by          → 20260828T085822_…
public.organization_slug_rename_events.actor_platform_user_id → 20260828T085822_…
public.system_settings_audit.changed_by                 → 20260828T085822_…
```

### Живая rollback-only демонстрация organization purge (named DEV)

Миграция применена внутри транзакции, организация удалена, всё откачено:

```
victim|a0000000-0000-4000-8000-000000000001
before|queue=102|hourly=10|claims=2|renames=2|claims_total=5|renames_total=2
after |queue_left=0|hourly_left=0|manual_left=0|claims_total=5|renames_total=2
       |claim_tombstones=2|rename_tombstones=2
tombstone|alias|bersoncare-probe-l7
tombstone|current|dmitryberson
rename-tombstone|bersoncare-probe-l7 → dmitryberson
rename-tombstone|dmitryberson → bersoncare-probe-l7
ROLLBACK
после отката DEV не изменился: queue=354, hourly=562, claims=5 (tombstones=0), renames=2, organizations=5,
public FK = 450; тела обоих стражей на DEV — прежние (обе пробы `f`).
```

Честная оговорка о границе этой демонстрации: `DELETE FROM be_organizations` дополнительно отказывают **24 FK,
лежащие ВНЕ четырёх названных брифом классов** (перечислены ниже как открытый вопрос). Чтобы демонстрация
измеряла именно названные классы, они сброшены на время той же откатываемой транзакции — это харнесс, не
изменение продукта, и в миграции их нет.

### Fault injection — все шесть, по одной, с откатом

Команда одна и та же: `pnpm --dir apps/webapp exec vitest run
src/modules/db-retention/journalLifecycleRegistry.contract.test.ts`.

| Инъекция | Результат |
|---|---|
| объявлена `public.bcb_probe_sms_deliveries`, решения нет | КРАСНЫЙ: `undecided = ["public.bcb_probe_sms_deliveries"]` |
| голая строка-исключение вместо структурированного решения | КРАСНЫЙ: «A bare reason string is how …» |
| отсутствует `userPurge` | КРАСНЫЙ: та же проверка обеих сторон |
| отсутствует `orgPurge` | КРАСНЫЙ: та же проверка обеих сторон |
| таблица классифицирована и реестром, и решением | КРАСНЫЙ: «A table cannot be both a journal and not a journal» |
| **несуществующий prune-корень с точкой** (`app.audit_missing_prune_target`) | **КРАСНЫЙ** (до этого прохода — зелёный, 9/9, класс пропускался) |

Baseline после отката — 9/9 зелёный; оба файла восстановлены побайтно (sha256 совпал); инъекций в дереве нет.

### Остальные гейты

```
node deploy/postgres/privileges/generate-cli.mjs --all --check   → артефакты совпадают побайтно
pnpm --dir apps/webapp exec tsc --noEmit                          → чисто (exit 0)
scoped eslint по всем изменённым .ts                              → чисто (exit 0)
node scripts/check-migration-privileges.mjs                       → OK (103 migration files)
node scripts/check-no-new-raw-sql.mjs                             → OK (production debt: 0)
node scripts/check-c4-migration-owned-function-bodies.mjs         → OK
node scripts/check-db-chokepoint.mjs                              → OK
node scripts/check-queue-port-boundary.mjs                        → OK
node --test deploy/postgres/privileges/migration-order.test.mjs   → 28/28 pass
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp run lint"  → PASS (244s, через host lock)
git diff --check                                                  → чисто
```

**Существующий красный ВНЕ этого скоупа, не вызванный этой работой:**
`apps/webapp/src/modules/auth/passwordAuth.route.test.ts:312` падает (403 вместо 200). Доказано
`git stash push --include-untracked` → тот же отказ на нетронутой ветке → `git stash pop`. Не чинилось: в плане
владельца такого пункта нет.

## Открытые вопросы владельцу (поведение НЕ менялось)

1. **`OQ-PLAYBACK-EVENT-STORES-WINDOW`.** `media_playback_resolution_events` и `media_playback_client_events`
   объявляли 30-дневное окно, для которого в репозитории нет ни одного удаления. Нужен либо настоящий срок с
   реализацией, либо решение «храним без окна». Срок не выдуман.
2. **Число в реестре против константы модуля.** `media_playback_stats_hourly`: реестр `days: 400`, модуль
   `PLAYBACK_HOURLY_STATS_RETENTION_DAYS = 90`. `media_hls_proxy_error_events`: реестр 30, модуль 90. Это
   вопрос политики хранения, а не дефект кода; бриф прямо запрещает выдумывать сроки, поэтому не тронуто.
3. **24 FK отказывают в удалении организации вне названных классов.** Замерено на DEV по замыканию каскада от
   `be_organizations`: `be_clinic_services → be_package_items / be_patient_package_items`,
   `reference_items → lfk_complexes / lfk_exercises / symptom_trackings`, `tests → test_results /
   test_set_items`, `media_folders → media_files` и сам себя, `lfk_exercises → lfk_complex_exercises /
   lfk_complex_template_exercises`, `lfk_complex_templates / lfk_complexes → patient_lfk_assignments`,
   `symptom_trackings → lfk_complexes`, `treatment_program_templates → courses`, цепочка `saas_billing_*`.
   Ни один из них бриф не называл, и «починить» их — значит решить за владельца, что происходит с каталогом
   клиники и с пациентскими назначениями при её удалении. Требуется решение владельца отдельным пунктом плана.
4. **Каталожная уборка `pending-removal`.** Вместе с мёртвой `user_email_setup_tokens` ушла и её запись
   `disp: REMOVED`; три её оставшихся собрата с тем же `disp` свои записи сохранили. Нужно ли выносить их тем
   же способом — вопрос владельца, здесь не решался.

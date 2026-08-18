> **Retired-path notice.** Any command or path below that targets a pre-B0 retired database executor is preserved only as historical evidence; it is not runnable or current guidance. Other content in this document is unchanged. See [the current B0 retirement rule](/docs/archive/2026-08-no-disposable-db-retirement/RETIREMENT.md).

# Ч7 — blind audit значений runtime-настроек в БД

**Роль:** `auditor-live`
**Authority:** `docs/_TODO/SINGLE_ENTRY_CLEANUP_2026-08-01.md` § «Ч7. Значение настройки живёт в базе, в коде его нет»
**Ветка / продуктовый SHA / плановый SHA:** `wt/settings-values-db` / `d23028a50` / `cde1d0563`
**Вердикт: FAIL.** Product fix не выполнялся.

## Blind kill-set и классификация по AGENTS.md §24.4

Список составлен до чтения worker report, product diff и существующих тестов.

| ID | Именованная поломка | Последствие для человека | Тест или взгляд | Независимый oracle |
|---|---|---|---|---|
| K1 | Reader возвращает прежний default/пустое значение, когда global row отсутствует | Операция продолжает работать по скрытой политике вместо временной недоступности | **ТЕСТ:** fault injection missing row через публичный accessor/consumer | Authority Ч7: отсутствие строки не подменяется политикой |
| K2 | Reader возвращает default при ошибке БД | Сбой БД молча меняет runtime-поведение | **ТЕСТ:** repo/DB error injection через публичный accessor/consumer | Authority Ч7: «не пускаем пока не поднимется» |
| K3 | Реальный consumer продолжает читать env/default/hardcoded object, пока админка пишет БД | Изменение администратора не влияет на работу этого consumer | **ВЗГЛЯД:** полный census typed registry → accessors → callers; **ТЕСТ** только для найденного реального публичного пути | Путь человека №1 и repo rules §2–§4 |
| K4 | Anonymous configured accessor принимает credential-bearing или произвольный key | Аноним получает SMTP/API/OAuth secret или значение вне public allowlist | **ТЕСТ:** route/accessor security cases для credential key и unknown key | Путь человека №3 |
| K5 | Admin GET/PATCH переведены на публичную обрезанную projection | Администратор больше не может прочитать/изменить полную credential-bearing настройку через существующую дверь | **ТЕСТ:** настоящий admin route/wiring с правильным principal | Путь человека №3 |
| K6 | Миграции не применяются к существующей базе, не проходят на disposable базе, расходятся с journal либо перезаписывают значение администратора | Deploy ломается или возвращает уже изменённую политику к seed-значению | **ВЗГЛЯД + одноразовый runtime-check:** journal/introspection и два migration сценария (fresh + pre-existing customized row) | Ч7 DoD и правило миграций |
| K7 | Ключ есть в migration seed, но отсутствует в typed registry/accessor, либо registry runtime-key не имеет seed | Часть настроек недоступна или при чтении получает missing-row outage сразу после deploy | **ВЗГЛЯД:** сопоставление итоговой схемы/seed с typed registry; постоянный source-text test не писать | Ч7 DoD + AGENTS.md §2–§4 |
| K8 | Password/SMS/Telegram/MAX/public alternatives по-прежнему рекламируют или запускают выключенный/не настроенный канал либо не дают войти по разрешённому | Человек видит нерабочий способ входа или теряет разрешённый способ входа | **ТЕСТ:** route/decision behavior по каждому существующему caller path; точечная fault injection для независимых решений | Пути человека №3–№4 |
| K9 | Auth 2FA при missing row/DB error трактует setting как `false`, `true` или продолжает login | Сбой настройки либо отключает второй фактор, либо вслепую запирает персонал, либо пропускает вход | **ТЕСТ:** login/guard fault injection на недоступном setting | Ч7, дословное owner-решение и путь человека №2 |
| K10 | TTL/security delays тоже принудительно читаются из БД либо продуктовые настройки остаются code constants под видом исключения | Система не может безопасно дождаться БД или сохраняет второй источник продуктовой политики | **ВЗГЛЯД:** классификация оставшихся констант по явному исключению authority | Явное исключение Ч7 только для TTL/security delays |
| K11 | Этап удаляет voluntary TOTP либо преждевременно снимает platform enforcement | Изменяется не относящаяся к Ч7 модель 2FA | **ВЗГЛЯД:** diff/caller inspection; существующий behavior-test использовать только если он уже покрывает границу | Путь человека №5 |

## Findings

### F1 — настройки продолжают получать значения из кода при отсутствующей строке

**Сценарий и impact.** Если `listSettingsByScope('admin')` не возвращает обязательные строки, существующая
админская дверь не становится недоступной. Она собирает полноценную страницу из code defaults: например,
`video_presign_ttl_seconds=3600`, `video_default_delivery=auto`, maintenance/feature flags=`false`, SMTP port=587,
alert-конфиги и списки — hardcoded objects. Администратор видит не состояние БД, а третью политику и может принять
или сохранить решение на её основе. Это прямо нарушает Ч7: при отсутствующей строке операции нет ответа.

**Код:** `adminSettingsData.ts:46-77,206-255,280-339`.

**Команда / oracle:** authority требует rejection; текущий код возвращает большой synthesized object.

```text
pnpm --dir apps/webapp exec vitest run src/app/app/settings/adminSettingsData.unit.test.ts
→ 1 test failed: promise resolved instead of rejecting; среди значений initialPresignTtlSeconds=3600,
  initialDefaultDelivery=auto, patientAppMaintenanceEnabled=false, smtpOutboundUi.port=587.
```

Отдельно продуктовый коммит сам ввёл два не разрешённых authority исключения
`OPTIONAL_RUNTIME_SETTING_KEYS` (`runtimeConfig.ts:134-142,319-333`):

- у врача до первого сохранения `doctor_today_preferences` отсутствует штатно, но
  `doctorTodayPreferences.ts:18-21,53-57` подставляет `DEFAULT_DOCTOR_TODAY_PREFERENCES`;
- отсутствующий `patient_booking_url` превращается в `null`, после чего CTA скрывается, вместо недоступности
  операции.

```text
pnpm --dir apps/webapp exec vitest run src/modules/system-settings/runtimeSettingsNoSubstitution.unit.test.ts src/modules/operator-health/operatorHeartbeatConfig.unit.test.ts
→ 3 failed, 7 passed; оба missing-row acceptance oracle не получили RuntimeSettingUnavailableError.
```

Единственное исключение authority — TTL/security delays, нужные до ответа БД. Ни предпочтения врача, ни booking
URL, ни отображаемые админкой продуктовые значения в это исключение не входят.

### F2 — `operator_heartbeat_config` не зарегистрирован и всё ещё использует compiled policy

**Сценарий и impact.** На существующей базе строка `operator_heartbeat_config={}` сохраняется миграцией
`ON CONFLICT DO NOTHING`. Оба реальных consumer читают её, parser принимает пустой/частичный объект, а
`heartbeat.ts:47-60,73-100` подставляет зашитые 6/26 часов. Администратор не может исправить ключ через обычный
settings PATCH: ключ отсутствует в typed registry и route allowlist. Поэтому мониторинг может молча работать с
порогами из кода, а не из БД.

**Not-found proof:**

- exact: `rg -n "operator_heartbeat_config"` по `registry.ts`, `types.ts`, admin settings route, callers и `0301`;
  совпадения есть только в migration, константе/callers и audit-test, в registry/route — нет;
- semantic: `node /home/dev/brain/tools/code-search.mjs "operator heartbeat configuration admin setting registry accessor edit route" --repo bcb -k 15`;
- back-references: `deliveryHeartbeatObserver.ts` и `heartbeatReceiver.ts` вызывают
  `getConfigValue(OPERATOR_HEARTBEAT_CONFIG_KEY)`; стандартная дверь строится из registry/`ALLOWED_KEYS` и
  `PATCH_SCOPE_KEYS`.

**Команда / oracle:**

```text
pnpm --dir apps/webapp exec vitest run src/modules/system-settings/runtimeSettingsNoSubstitution.unit.test.ts src/modules/operator-health/operatorHeartbeatConfig.unit.test.ts
→ operatorHeartbeatConfig: expected RuntimeSettingUnavailableError, функция вернула compiled 21600.
```

Сопоставление migration ↔ typed registry дало единственный restricted mismatch:

```text
pnpm --dir apps/webapp exec tsx -e "import {readFileSync} from 'node:fs'; import {ALLOWED_KEYS} from './src/modules/system-settings/types'; import * as r from './src/modules/system-settings/runtimeConfig'; const keys=(f:string)=>[...readFileSync(f,'utf8').matchAll(/^\\s*\\('([^']+)'/gm)].map(m=>m[1]); const m300=new Set(keys('db/drizzle-migrations/0300_runtime_settings_values_live_in_db.sql')); const typed=new Set([...r.PUBLIC_RUNTIME_BOOLEAN_KEYS,...r.PUBLIC_RUNTIME_STRING_KEYS,...r.AUTHENTICATED_RUNTIME_BOOLEAN_KEYS,...r.AUTHENTICATED_RUNTIME_STRING_KEYS,...r.SERVER_RUNTIME_BOOLEAN_KEYS,...r.SERVER_RUNTIME_TOKEN_LIST_KEYS,...Object.keys(r.SERVER_RUNTIME_INTEGER_DEFINITIONS),...Object.keys(r.RUNTIME_BOOLEAN_SETTING_DEFINITIONS),...Object.keys(r.RUNTIME_INTEGER_SETTING_DEFINITIONS)]); const m301=new Set(keys('db/drizzle-migrations/0301_legacy_runtime_settings_values_live_in_db.sql')); const allowed=new Set(ALLOWED_KEYS as readonly string[]); console.log(JSON.stringify({m300:m300.size,typed:typed.size,m300NotTyped:[...m300].filter(k=>!typed.has(k)),typedNotM300:[...typed].filter(k=>!m300.has(k)),m301:m301.size,m301NotRegistry:[...m301].filter(k=>!allowed.has(k)),registryCount:allowed.size},null,2));"
→ m300=39; typed=40; typedNotM300=["patient_booking_url"];
  m301=28; m301NotRegistry=["operator_heartbeat_config"]; registryCount=120.
```

### F3 — `0302` перезаписывает уже заданные администратором пустые значения

**Сценарий и impact.** На существующей базе администратор явно оставил пустыми `support_contact_url` и
`patient_app_maintenance_message`. `0300` объявляет пустую строку валидным начальным DB-значением, но
`0302:110-124` не отличает seed от последующего решения администратора и заменяет его на
`/app/patient/support` и compiled maintenance message. После deploy пользователь получает политику, которую
администратор не задавал.

**Команда / oracle:** disposable PostgreSQL 16, minimal predecessor, fresh и pre-existing сценарии; test
ожидает сохранения всех трёх ранее заданных runtime values.

```text
node apps/webapp/scripts/audit-ch7-settings-values-db.acceptance.mjs
→ exit 1
  freshGlobalRowCounts="39|28"
  existingRuntimeValuesPreserved="true|false|false"
  existingRestrictedValuesPreserved="t"
  failure: expected true|true|true.
```

Non-empty runtime value и все три restricted значения сохраняются; finding ограничен именно достижимыми empty
admin values.

### F4 — public configured-accessors подменяют отсутствующую строку на `false`

**Сценарий и impact.** При удалённой/не заведённой строке `smsc_api_key`, `telegram_login_bot_username` или
`max_bot_api_key` функции `0302:5-64` выполняют `COALESCE(..., false)`. Анонимный login получает «канал не
настроен», канал исчезает и операция продолжает отвечать, хотя authority требует наблюдаемую недоступность без
выбора политики. Ошибка самой БД при этом корректно идёт наверх; finding — именно missing row.

**Команда / oracle:** тот же disposable acceptance-test удаляет `smsc_api_key` после migration.

```text
node apps/webapp/scripts/audit-ch7-settings-values-db.acceptance.mjs
→ missingSmsRow="f"; oracle expected runtime_setting_unavailable.
```

Security boundary при этом выдержан: `publicAclAndFunctionShape="false|true|true|true|true"`, а прямой
`SELECT value_json FROM system_settings` под `app_anon` падает. То есть credential leak/arbitrary-key accessor
не найден; проблема только в ложном policy answer.

### F5 — password login создаёт сессию до ответа обязательной 2FA-настройки

**Сценарий и impact.** Для staff без enrolled TOTP login сначала вызывает `setSessionFromUser`, который mint-ит
session cookie, и только затем читает `auth_2fa_enabled` (`email-password/login/route.ts:159-165`). При missing row
или DB error route падает, но аутентификационный side effect уже выполнен. После восстановления БД следующий
request может использовать сессию входа, который должен был временно отказать.

**Команда / oracle:** login должен reject и не вызывать session mint.

```text
pnpm --dir apps/webapp exec vitest run src/modules/auth/passwordAuth.route.test.ts
→ 1 failed, 7 passed: setSession called 1 time before
  runtime_setting_unavailable:auth_2fa_enabled.
```

Сам policy reader не выбирает `false`: отдельный
`platformPolicy.unit.test.ts` проходит. Finding — порядок side effects в реальном password caller, не reader.

### F6 — план ссылается на migration evidence, которое не выполняло `0300–0302`

Плановый commit `cde1d0563` честно оставляет Ч7 `[ ]` и пишет «не влито», но в качестве evidence ссылается на
worker report. В report строки 45-46 утверждают, что `smoke-s5-1-runtime-settings-contract.mjs` на disposable
PostgreSQL накатывает миграции по порядку. Фактически script применяет только `0186`, `0209`, `0228`, `0210`;
`0300`, `0301`, `0302` в нём отсутствуют. Поэтому указанное доказательство land/readiness ложно, даже хотя сам
старый smoke зелёный.

```text
rg -n "0300|0301|0302|apply\(" apps/webapp/scripts/smoke-s5-1-runtime-settings-contract.mjs
→ apply sites только для 0186, 0209, 0228, 0210; совпадений 0300/0301/0302 нет.

node apps/webapp/scripts/smoke-s5-1-runtime-settings-contract.mjs
→ S5 runtime settings private PostgreSQL migration proof: OK (aggregate-only).
```

Это finding по честности evidence, не дополнительный product defect. Новый воспроизводимый Ч7 acceptance-test
выше действительно применяет `0300–0302` и обнаруживает F3/F4.

## Результат blind kill-set

| ID | Результат | Evidence |
|---|---|---|
| K1 missing-row default | **FAIL** | F1: admin page, doctor preferences, booking URL |
| K2 DB-error default | PASS | configAdapter/runtime provider и 2FA policy propagируют injected error; fallback mutation краснит tests |
| K3 старый env/default consumer | **FAIL** | F1/F2; active webapp env-reader для TG/MAX не найден |
| K4 anonymous credential/arbitrary key | PASS | disposable ACL + три zero-arg boolean-only functions; прямой table SELECT запрещён |
| K5 admin переведён на public projection | PASS | admin accessor test требует full `smtp_outbound`, `smsc_api_key`, TG/MAX secret readers; platform route guard inspected |
| K6 migration/journal/fresh/existing/no-overwrite | **FAIL** | journal/fresh apply green, existing empty values overwritten (F3) |
| K7 migration ↔ typed registry | **FAIL** | `operator_heartbeat_config` отсутствует; `patient_booking_url` исключён из seed (F1/F2) |
| K8 password/SMS/TG/MAX/public alternatives | PASS кроме F5 | toggle/configured fault injections краснят; разрешённые/выключенные channel cases зелёные |
| K9 2FA unavailable fail-open | **FAIL** | policy propagates, но password login mint-ит session раньше required read (F5) |
| K10 только TTL/security constants | **FAIL** | operator heartbeat 6/26h и doctor preferences — продуктовые compiled values |
| K11 voluntary TOTP/platform enforcement unchanged | PASS | diff/callers: оба механизма сохранены; `0303` не входит в Ч7 |

## Независимые fault injections

Все временные product mutations откатаны; в рабочем дереве их нет.

| Kill | Mutation | Команда / oracle |
|---|---|---|
| K1/K2 | `configAdapter.requireReadValue` временно возвращал `''` на missing/error | `pnpm --dir apps/webapp exec vitest run src/modules/system-settings/configAdapter.unit.test.ts -t 'missing required row'` покраснел: resolved `''` вместо rejection |
| K8 public channel | public policy временно игнорировала `configured` | public policy test покраснел: SMS expected `false`, received `true` |
| K8 OAuth | OAuth provider временно игнорировал configured projection | три Google/Yandex/Apple cases покраснели |
| K5 admin boundary | admin detail временно переведён на cropped public accessor | admin accessor test покраснел на отсутствующей credential-backed capability |
| K9 2FA | `platformPolicy` временно ловил ошибку и возвращал `false` | `platformPolicy.unit.test.ts` покраснел: resolved `false` вместо rejection |

## Targeted tests и gates

После добавления audit acceptance tests:

```text
pnpm --dir apps/webapp exec vitest run src/modules/system-settings/configAdapter.unit.test.ts src/modules/system-settings/runtimeSettingsNoSubstitution.unit.test.ts src/modules/auth/publicAuthPolicy.unit.test.ts src/modules/auth/publicAuthSnapshot.unit.test.ts src/modules/auth/sessionCookie.unit.test.ts src/modules/auth/passkeyAuth.unit.test.ts src/modules/auth/passwordAuth.route.test.ts src/modules/auth/phoneStartFallback.route.test.ts src/modules/staff-security/platformPolicy.unit.test.ts src/modules/operator-health/operatorHeartbeatConfig.unit.test.ts
→ 10 files: 7 passed, 3 failed; 45 tests passed, 4 failed (F1, F2, F5).

pnpm --dir apps/webapp exec vitest run src/modules/auth/independentAuthMethodToggle.route.test.ts src/modules/auth/oauthAppleToggle.route.test.ts
→ 2 files / 3 tests passed.

pnpm --dir apps/webapp exec vitest run src/app/app/settings/adminSettingsData.unit.test.ts
→ 1 file / 1 test failed (F1).
```

Static/migration gates:

```text
bash apps/webapp/scripts/check-drizzle-journal-sync.sh
→ check-drizzle-journal-sync: OK

bash apps/webapp/scripts/check-legacy-migrations-frozen.sh
→ exit 0

node scripts/check-db-chokepoint.mjs
→ check-db-chokepoint: OK

pnpm --dir apps/webapp run typecheck
→ exit 0

pnpm --dir apps/webapp exec eslint .
→ exit 0; 0 errors, 2 pre-existing unused-disable warnings.

node scripts/check-no-new-raw-sql.mjs
→ exit 1 на pre-existing apps/webapp/src/infra/repos/saasBillingTariffSnapshot.devDbProof.test.ts;
  вне Ч7, совпадает с честно указанным worker blocker.

git diff --check
→ exit 0
```

Полный greenfield chain был запущен командой `pnpm run verify:saas-a0-greenfield-baseline`, но остановился до
pending migrations на baseline restore: `role "app_platform_settings" does not exist` (`schema.sql:24478`). Это
pre-existing verifier blocker, не finding Ч7. Fresh/minimal-predecessor применение именно `0300–0302` доказано
Ч7 acceptance-test; применение поверх полного исторического chain этим аудитом не доказано.

DEV/TEST/PROD базы и сервер не использовались. Product code не исправлялся. `d23028a50` является ancestor HEAD;
`git diff --stat d23028a50 HEAD -- $(git diff --name-only d23028a50^ d23028a50)` не показал последующих изменений
аудируемой product surface после синхронизации с `feat`.

## Не-findings после inspection

- DB errors в runtime/config readers не превращаются в `false`/`true`/empty; они propagates.
- Anonymous principal получает только закрытые boolean capabilities и не читает credential rows.
- Admin auth-channel detail остаётся на credential-backed accessor, а platform settings route сохраняет
  `requirePlatformOperationsApiContext`.
- Password/SMS/Telegram/MAX/OAuth toggle/configured решения, кроме F5, прошли targeted behavior tests.
- Voluntary TOTP и platform enforcement не удалены.
- `SYSTEM_SETTING_REGISTRY.defaultValue` содержит старые classification strings, но exact
  `rg -n "\\.defaultValue" apps/webapp/src` не нашёл runtime consumer; без caller это не отдельный finding.
- `TELEGRAM_BOT_TOKEN`/`TELEGRAM_BOT_USERNAME` ещё объявлены в `env.ts`, однако exact поиск по
  `rg -n "env\\.TELEGRAM_BOT_(TOKEN|USERNAME)|env\\.MAX_LOGIN_BOT_NICKNAME|env\\.MAX_BOT_API_KEY" apps/webapp/src`
  не нашёл consumer; reverse exact search самих имён нашёл только schema/object в `env.ts`, а semantic
  `code-search "runtime setting env fallback hardcoded default consumer system_settings"` вернул старый индексный
  snippet и docs/migrations, проверенные по текущему source. Dead declaration не превращена в finding.

## Оставленные audit artifacts

- `apps/webapp/scripts/audit-ch7-settings-values-db.acceptance.mjs` — disposable migration/ACL acceptance;
- audit tests в `configAdapter.unit.test.ts`, `runtimeSettingsNoSubstitution.unit.test.ts`,
  `adminSettingsData.unit.test.ts`, `publicAuthPolicy.unit.test.ts`, `passwordAuth.route.test.ts`,
  `platformPolicy.unit.test.ts`, `operatorHeartbeatConfig.unit.test.ts`;
- этот report.

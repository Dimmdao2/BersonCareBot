# Независимый аудит `TPB-09` + `D17` branding integration

**Дата:** 24.08.2026

**Ветка:** `wt/therapysto-night-20260823`

**Точный кандидат:** `c1bbb78b2197749909765e56dfab328bcb93f340`

**Owner plan:** `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/IMPLEMENTATION_PLAN.md`

**Итоговый вердикт:** **`PASS`**

`MUST FIX` не найдено. Product code, домены, DNS, TLS, nginx, TEST origins, runtime env и постоянное
состояние DEV не менялись. Все DB-проверки выполнены на именованной `bcb_webapp_dev` в транзакциях с
`ROLLBACK`; disposable database не создавалась.

## Кандидат и authority

### INSPECTION — stop-gate кандидата

Команда перед первым содержательным check и повторно после fault injections:

```bash
git rev-parse HEAD
git status --short
```

Результат до создания audit artifacts: `HEAD=c1bbb78b2197749909765e56dfab328bcb93f340`; product diff пуст,
изменены только два audit-test файла. Изменения product code во время аудита не обнаружены, поэтому `STALE`
не наступил.

Три названных в брифе commit являются предками точного кандидата; проверено командой
`git merge-base --is-ancestor <sha> HEAD` для каждого:

- `bd1da907f8e773737ac94bd4965fdaa22d60782f` — удаляет runtime-overlay definition;
- `3cbccb810d26ec9c98de7cd1bcead2abbad9815f` — добавляет late reconciliation migration;
- `c1bbb78b2197749909765e56dfab328bcb93f340` — добавляет rollback-only candidate preflight с canonical DEV env.

Owner boundary взята из актуального плана, включая позднее разрешение интеграции с
`feat/doctor-ui-rebuild`. Domain-dependent activation в authority аудита не входит.

Существующий отчёт `E1_EVIDENCE_TPB09_2026-08-24.md` использован только как указатель на проверки: текущие
пути и implementation trace сверены, decisive tests и собственные injections прогнаны заново.

## Scope A — закрывающий аудит `TPB-09`

### INSPECTION — источник identity и владение

Behavior tests ниже доказывают результат; inspection здесь нужна для статической связности источников.

1. `mailProfileForResolvedSurface()` строит branded profile из одного clinic-owned значения
   `surface.effectivePatientBrand.effectiveDisplayName` и сохраняет `organizationId`
   (`apps/webapp/src/modules/auth/mailProfile.ts`).
2. Patient-visible подпись письма и имя, переданное в calendar builder, используют один
   `patientVisibleNameForMailProfile(profile)`. Для branded profile это `profile.clinicName`
   (`sendBookingConfirmationEmail.ts`, `mailProfile.ts`).
3. В integrator тот же tenant-bound `profile.clinicName` входит в owner-provided
   `clinic_transactional_mail_template`; шаблон sender identity обязан содержать одновременно
   `{{clinicName}}` и `{{platformName}}` (`apps/integrator/src/integrations/email/mailProfile.ts`).
4. В текущем ICS нет отдельного RFC-поля `ORGANIZER`; patient-visible producer identity находится в
   `PRODID`. Именно оно получает то же clinic name. Отсутствие нового `ORGANIZER` не является разрывом
   `TPB-09`: owner plan требует config seam/ownership, а не новое календарное поле.
5. `org_custom_domain_hostname` объявлен `per_org`; clinic delivery keys читаются через tenant-bound
   credential root. Standard patient `name/origin` идут из deploy config, а не из clinic rows.

### TEST — decisive TPB-09 regressions

```bash
pnpm --dir apps/webapp exec vitest run \
  src/config/envDatabaseRuntime.unit.test.ts \
  src/modules/system-settings/orgCustomDomainHostname.unit.test.ts \
  src/modules/patient-booking/sendBookingConfirmationEmail.outbound.test.ts \
  src/modules/auth/mailProfileSurfaceIdentity.unit.test.ts
```

Финальный результат: **4 files passed, 23 tests passed**.

```bash
pnpm --dir apps/integrator exec vitest run \
  src/infra/runtime/worker/outgoingDeliveryWorker.scope.test.ts \
  src/infra/db/clinicDeliveryCredentials.unit.test.ts \
  src/integrations/email/mailProfile.unit.test.ts
```

Финальный результат: **3 files passed, 30 tests passed**. В частности, branded template получил
`clinicName` и `platformName`, а credential resolver сохранил exact organization argument.

### TEST — собственные TPB fault injections

Все product mutations были временными и откачены; после каждой проверялся пустой product diff.

| ID | Временная поломка | Результат неизменённой проверки |
| --- | --- | --- |
| `TPB-FI1` | `.ics` получил литерал `Therapygo` вместо `patientVisibleNameForMailProfile` | `sendBookingConfirmationEmail.outbound.test.ts`: **1 failed / 5 passed**, красный `PRODID` |
| `TPB-FI2` | возвращено имя вложения `bersoncare-booking-<id>.ics` | тот же файл: **2 failed / 4 passed**, обе проверки filename красные |
| `TPB-FI3` | patient surface name подменено staff-константой | `envDatabaseRuntime.unit.test.ts`: **1 failed / 6 passed**, deploy-name propagation красная |
| `TPB-FI4` | `org_custom_domain_hostname` подменён с `per_org` на `global` | `orgCustomDomainHostname.unit.test.ts`: **1 failed / 4 passed**, ownership красная |
| `TPB-FI5` | sender template получил `clinicName=platformName` | `mailProfile.unit.test.ts`: **1 failed / 4 passed**, ожидалось `Клиника / Therapygo` |

Это подтверждает, что заявленные TPB mutation checks действительно краснеют на релевантной поломке.

### INSPECTION — имена вложений и стабильная event identity

Команды:

```bash
rg -n "icsFilename\s*:|download\s*=.*\.ics|filename.*\.ics" \
  apps/webapp/src apps/integrator/src --glob '!**/*.test.*'
rg -n -i "(?:icsFilename|download|filename).{0,100}bersoncare|bersoncare.{0,100}(?:icsFilename|download|filename)" \
  apps/webapp/src apps/integrator/src --glob '!**/*.test.*'
```

Активные patient-visible имена — `booking-<id>.ics`, integrator default — `booking.ics`; второй поиск не
вернул совпадений.

Stable already-issued UID намеренно сохранён:

```bash
git diff --exit-code b9ec6a87c^ b9ec6a87c -- \
  apps/webapp/src/app/app/patient/cabinet/CabinetActiveBookings.tsx
git blame -L 67,78 -- \
  apps/webapp/src/app/app/patient/cabinet/CabinetActiveBookings.tsx
```

Первый command завершился `0`; строка
`bersoncare-booking-${booking.id}@bersoncare` принадлежит commit `a196627a0b` от 19.06.2026, тогда как
patient-visible `PRODID` обновлён позднее. Техническая event identity не была переписана ради branding.

### Вердикт Scope A

**`PASS`**. Config seam и clinic settings ownership реальны, tenant-bound; sender/template/ICS identity
сходятся на clinic profile; filenames нейтральны; стабильный UID сохранён. Reachable broken behavior не найдено.

## Scope B — `D17` delivery-root integration

### TEST — effective function на именованной DEV

Audit-only proof расширен так, чтобы материализовать pending candidate migrations и generated privileges в
одной транзакции, спросить живой catalog/body и вызвать функцию под обоими principals:

```bash
RUN_D17_INTEGRATOR_ROOTS_DB=1 node --test \
  deploy/postgres/privileges/integrator-narrow-delivery-roots.devDbProof.test.mjs
```

Финальный результат: **1 test passed**; `psql` завершил транзакцию `ROLLBACK`. Проверенные наблюдаемые значения:

- owner = `app_seam_settings_integrator_owner`;
- body содержит только narrow target-role array;
- `app_integrator_tenant_service`: `EXECUTE=true` и вызов с accepted exact-org context разрешён;
- `app_tenant_service`: `EXECUTE=false`, прямой вызов возвращает `42501`;
- без accepted context — `42501`;
- аргумент чужой организации — `42501`;
- SMTP, SMSC, Telegram, MAX, VK и `clinic_transactional_mail_template` реально прочитаны: count = `6`;
- narrow role не получил relation privileges на медицинские таблицы и не получил direct tariff helper execute;
- реальная reminder materialization door создала одну transport-ready pending queue row, которую rollback удалил.

### TEST — actual integrator path

Команда integrator suite выше дала **3 files / 30 tests PASS**. Совместно с DB proof она проверяет цепочку:

`outgoing_delivery_queue` → resolve row organization → `runWithOrganizationPrincipal(organizationId)` →
dispatch/mail profile → `fetchIntegratorClinicDeliveryCredentialValueJson` →
`app.read_integrator_clinic_delivery_credential`.

Fault injection `PATH-FI1` заменила tenant wrapper прямым dispatch. Arbiter-test покраснел:

```text
Expected: d0000000-0000-4000-8000-00000000000d
Received: c0000000-0000-4000-8000-00000000000c
```

После восстановления весь integrator suite снова зелёный. Следовательно appointment-reminder worker реально
сохраняет organization principal, нужный credential root, а не только имеет неиспользуемый DB helper.

### TEST — D17 fault injections

| ID | Временная поломка | Красный результат |
| --- | --- | --- |
| `D17-FI1` | effective generated gate изменён на broad `app_tenant_service` | proof упал с `42501 accepted port context required` на narrow path |
| `D17-FI2` | удалено exact equality `p_organization_id <> current_org` | assertion: `ALLOWED !== 42501` для foreign organization |
| `D17-FI3` | из allowlist удалён `clinic_transactional_mail_template` | proof упал `clinic credential key denied` |
| `PATH-FI1` | worker перестал устанавливать row tenant principal | scope-test увидел clinic C вместо clinic D |

Контроль, **не засчитанный как injection evidence**: первая попытка изменить роль только в final migration
осталась зелёной, потому что следующий generated privilege reconciliation корректно восстановил effective body
по declaration. После диагностики audit proof усилен проверкой `pg_get_functiondef`, а рабочая `D17-FI1`
посажена в effective generated gate и действительно покраснила проверку.

### INSPECTION — migration ownership и отсутствие overlay

```bash
rg -n "\b(GRANT|REVOKE)\b" \
  apps/webapp/db/drizzle-migrations/20260824T053353_reconcile_clinic_delivery_credential_root.sql
rg -n "CREATE OR REPLACE FUNCTION app\.read_integrator_clinic_delivery_credential" \
  deploy/postgres/integrator-server-runtime-config.sql
git show --format= bd1da907f8e773737ac94bd4965fdaa22d60782f -- \
  deploy/postgres/integrator-server-runtime-config.sql
```

Первые два поиска не вернули совпадений. Diff `bd1da907f…` показывает удаление runtime body, его
GRANT/REVOKE/OWNER lines и DOWN-path signature. Historical forward migrations содержат прежние определения,
но это последовательность журнала, не второй активный runtime overlay; последняя effective definition —
`20260824T053353_reconcile_clinic_delivery_credential_root.sql`, а EXECUTE принадлежит generated declaration.

Final migration статически содержит owner marker, narrow body gate, exact organization comparison и все шесть
ключей. Эти свойства независимо подтверждены живым DB proof, поэтому inspection не является единственным
доказательством security boundary.

### TEST — точный rollback-only candidate preflight

Запущена ровно команда из брифа:

```bash
bash deploy/host/migrate-dev.sh --preflight \
  --runtime-env-root /home/dev/dev-projects/BersonCareBot
```

Результат: exit `0`, явный `ROLLBACK`,
`pending=3 total=73 reapplied=0 foreign-ledger-rows=4 relabeled=0 dropped-foreign=0
dropped-foreign-by-hash=0 unapplied=0`, затем `migrate-dev preflight: PASS`. Эти числа относятся именно к
команде выше. В stdout/stderr не напечатано ни одного URL, password или secret value.

### TEST — `--runtime-env-root` boundary

Audit-only contract suite расширен и запущен:

```bash
node --test deploy/host/migrate-dev.test.mjs
```

Финальный результат: **13 tests passed**. Проверено:

- override принимается только с `--preflight`; `--execute` отвергается до вызовов;
- root не может быть symlink, оба env-файла должны быть regular non-symlink files;
- env URL читаются из отдельного canonical checkout;
- parser, privilege generator, owner migrator и Drizzle migration folder остаются в candidate checkout;
- подложенные parser/runner/migration sources из runtime env root не исполняются;
- rollback-only flag сохраняется;
- stdout, stderr и capture не содержат четыре marker secret values.

Fault injections:

- `ENV-FI1`: удалён preflight-only guard — execute-rejection test покраснел, фактический status стал `0`;
- `ENV-FI2`: удалён `! -L` root guard — symlink-root был принят со status `0`, test покраснел.

Обе мутации откачены, после чего полный contract suite снова дал 13/13 PASS.

Scoped lint новых audit checks:

```bash
pnpm exec eslint \
  deploy/host/migrate-dev.test.mjs \
  deploy/postgres/privileges/integrator-narrow-delivery-roots.devDbProof.test.mjs
```

Результат: exit `0`, замечаний нет.

### Вердикт Scope B

**`PASS`**. Effective function имеет требуемого owner, narrow caller/EXECUTE, broad-role denial, exact-org
boundary и полный allowlist; runtime overlay удалён, migration не владеет GRANT/REVOKE; actual reminder path
сохраняет tenant principal. Candidate preflight действительно rollback-only и не смешивает code sources с
runtime env checkout.

## Findings и ограничения

`MUST FIX`: **нет**.

Не выполнялись и не требуются для этого audit gate:

- постоянный `--execute` migrations;
- disposable DB или replay исторической migration chain;
- domain/DNS/TLS/nginx/TEST origin/runtime-env activation;
- provider send наружу;
- merge, push или deploy;
- полный CI: audit меняет только два scoped test файла и docs; выполнены их непосредственные suites,
  реальный rollback-only DEV preflight и DB proof.

## Финальный вердикт

**`PASS`** для точного кандидата `c1bbb78b2197749909765e56dfab328bcb93f340` по обоим scopes.

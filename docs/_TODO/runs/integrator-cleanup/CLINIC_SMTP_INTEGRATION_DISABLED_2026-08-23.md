# Клиника: SMTP ошибочно считался выключенным

**Ветка:** `wt/smtp-clinic-20260823`

**Оракул:** `docs/_TODO/OWNER_WALKTHROUGHS/2026-08-23_TEST_FULL_WALK.md`, шаг «Сохранить SMTP».

**Граница:** именованная DEV использована только для чтения причины и rollback-only preflight.
`--execute`, TEST, PROD, deploy и push не выполнялись.

## Причина

Гипотеза ведущего про пустой `catch` подтвердилась только в последней части цепочки. Настоящий отказ
возникал раньше:

1. `platform_integration_availability` действительно лежит в глобальной строке
   `app_runtime_settings` (`scope=admin`, `audience=server`, `organization_id IS NULL`) и содержит
   `email=true`.
2. `getSettingWithRuntimeFirst` вызывал общий root
   `app.read_webapp_server_runtime_setting(text,text)`, но его фиксированный allowlist не содержит
   `platform_integration_availability`. Root честно возвращал ноль строк.
3. Legacy fallback выполнялся под врачебным staff-принципалом. RLS не показывал ему глобальную admin-строку,
   поэтому fallback также возвращал ноль строк.
4. `parsePlatformIntegrationAvailabilityEnvelope(undefined)` бросал
   `RuntimeSettingUnavailableError: runtime_setting_unavailable:platform_integration_availability`.
5. Пустой `catch` в PATCH превращал этот инфраструктурный отказ в продуктовый ответ
   `403 integration_disabled`.

Живой след снят на именованной `bcb_webapp_dev` под тем же врачом и организацией, что в walkthrough:

```text
USE_REAL_DATABASE=1 RUN_CLINIC_INTEGRATION_AVAILABILITY_DB=1 \
  pnpm --dir apps/webapp exec vitest run \
  src/infra/repos/clinicPlatformIntegrationAvailability.devDbProof.test.ts

principal.platformUserId=b0021a38-fb86-45e9-9aec-d85014e932d4
principal.organizationId=a0000000-0000-4000-8000-000000000001
runtime-root row: absent
legacy fallback: absent
thrown: RuntimeSettingUnavailableError: runtime_setting_unavailable:platform_integration_availability
```

На фактическом прикладном пути SQLSTATE отсутствует: PostgreSQL не отказывает запросу, а RLS возвращает
пустой результат; исключение создаёт TypeScript-парсер. Роль прикладного подключения — `app_staff`,
principal class — `staff`. Контрольный прямой доступ к скрытой таблице под `app_pre_session` отдельно дал
`SQLSTATE 42501, permission denied for schema public`, но это не тот запрос, который бросал исключение в
странице врача.

Точные read-only команды, которыми проверены строка и ACL:

```text
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev \
  -v ON_ERROR_STOP=1 -Atqc "SELECT key || '|' || scope || '|' || audience || '|' ||
  (organization_id IS NULL)::text || '|' || value_json::text
  FROM public.app_runtime_settings
  WHERE key = 'platform_integration_availability';"

sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev \
  -v ON_ERROR_STOP=1 -Atqc "SELECT pg_catalog.pg_get_functiondef(
  'app.read_webapp_server_runtime_setting(text,text)'::regprocedure);"

sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev \
  -v ON_ERROR_STOP=1 -Atqc "BEGIN; SET LOCAL ROLE app_pre_session;
  SELECT value_json FROM public.app_runtime_settings
  WHERE key = 'platform_integration_availability'; ROLLBACK;"
```

## Исправление

- Добавлен один фиксированный no-arg root
  `app.read_clinic_platform_integration_availability()`. Он проверяет принятый `staff`-контекст и purpose
  `config.clinic-platform-integration-availability.read`, читает только точный глобальный ключ и не принимает
  управляемый вызывающим key/scope/org.
- `EXECUTE` получает только `app_staff`; табличные права врача и доступ к прочим platform settings не
  расширены. Owner — `app_seam_settings_runtime_owner`; relation surface ограничен пятью колонками
  `public.app_runtime_settings`.
- API теперь различает `disabled` и `unavailable`. Ошибка чтения журналируется с организацией и интеграцией,
  затем возвращается `503 integration_availability_unavailable`; честно выключенная интеграция остаётся
  `403 integration_disabled` с человеческим сообщением.
- Страница читает рубильник через новый порт. Выключенный платформой канал вообще не рендерится. Для SMTP,
  включённого платформой, но недоступного на тарифе, показано «Собственный SMTP недоступен на вашем тарифе.»
  без формы и кнопки. Ответ сервера показывается как человеческий текст, машинный token в UI не выводится.
- Новый operation family включён в существующую диагностику isolation failures.

Миграция:
`apps/webapp/db/drizzle-migrations/20260823T035715_clinic_platform_integration_availability_door.sql`.
Privilege declaration и оба generated-артефакта обновлены генератором.

## Проверки

| Команда | Результат |
|---|---|
| `bash deploy/host/migrate-dev.sh --preflight` | PASS; `pending=3 total=56`, candidate DDL выполнен и откачен |
| `node deploy/postgres/privileges/generate-cli.mjs --check` | PASS; оба privileges и оба allowlist совпадают побайтно |
| `pnpm --dir apps/webapp exec vitest run src/app/api/tariffMechanics.route.test.ts --project route --reporter=dot` | 44 passed / 0 failed |
| `pnpm --dir apps/webapp exec vitest run src/app/app/settings/ClinicDeliveryChannelsSection.ui.test.tsx --project ui --reporter=dot` | 4 passed / 0 failed |
| `pnpm --dir apps/webapp exec vitest run src/app/app/settings/page.unit.test.ts src/modules/system-settings/configAdapter.unit.test.ts --project unit --reporter=dot` | 10 passed / 0 failed |
| `pnpm --dir apps/webapp typecheck` | PASS |
| `pnpm --dir apps/webapp lint` | PASS; 0 errors, 2 прежних warning в `AppointmentPaymentSection.tsx` |
| `git diff --check` | PASS |

Preflight сначала закономерно остановился на `FATAL: DEV API env path guard failed`, потому что linked
worktree не содержит `.env`. Для штатного повторного запуска два канонических DEV env были скопированы как
временные regular files без печати содержимого и удалены trap после команды. `--execute` не запускался.

## Fault injection

Все мутации внесены вручную, дали красный тест и были возвращены до финального зелёного прогона:

| Мутация | Команда | Красный результат |
|---|---|---|
| принудительно показывать SMTP при `email=false` | `pnpm --dir apps/webapp exec vitest run src/app/app/settings/ClinicDeliveryChannelsSection.ui.test.tsx --project ui --reporter=verbose` | `does not offer the SMTP form…`: 1 failed, найден `SMTP` |
| игнорировать `smtpEntitled=false` | та же команда с `-t "explains the tariff refusal"` | 1 failed, тарифный текст отсутствует и форма показана |
| снова превращать catch в `disabled` | `pnpm --dir apps/webapp exec vitest run src/app/api/tariffMechanics.route.test.ts --project route --reporter=verbose -t "returns a logged server failure"` | 1 failed: получен 403 вместо 503 |

## Неприменённая живая проверка

Новая дверь после preflight отсутствует в DEV, потому что транзакция завершилась `ROLLBACK`. Поэтому
пост-фикс проверка реального сохранения SMTP под врачом возможна только после применения миграции ведущим.
Это не выполнено здесь из-за прямого запрета `--execute` и запрета трогать TEST. Постоянный opt-in proof
`clinicPlatformIntegrationAvailability.devDbProof.test.ts` оставлен для запуска ведущим после применения:

```text
USE_REAL_DATABASE=1 RUN_CLINIC_INTEGRATION_AVAILABILITY_DB=1 \
  pnpm --dir apps/webapp exec vitest run \
  src/infra/repos/clinicPlatformIntegrationAvailability.devDbProof.test.ts
```

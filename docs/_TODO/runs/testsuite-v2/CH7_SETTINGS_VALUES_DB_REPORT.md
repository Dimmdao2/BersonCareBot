# Ч7 — значения настроек живут в базе

Ветка: `wt/settings-values-db`, от актуального `feat/doctor-ui-rebuild`. Карточка: `#1082`.
Authority: `docs/_TODO/SINGLE_ENTRY_CLEANUP_2026-08-01.md` § Ч7.

## FIX ROUND `ed4a9170f`

- Missing `patient_booking_url`, `doctor_today_preferences` и неполный admin snapshot больше не
  синтезируют продуктовую политику: readers/page data бросают
  `RuntimeSettingUnavailableError`; пустое значение существующей строки остаётся значением.
  `0300` заводит required global rows через `ON CONFLICT DO NOTHING`.
- `operator_heartbeat_config` добавлен в typed registry и существующий PATCH allowlist. Пороги
  `pipeline_delivery`/`digest` берутся только из seeded DB-object; `{}`, missing или malformed
  object дают `runtime_setting_unavailable:operator_heartbeat_config`, без compiled 6/26h.
- `0302` больше не переписывает явно пустые admin values. Его три zero-arg `SECURITY DEFINER`
  boolean accessors сохраняют ACL/закрытую форму, а при отсутствии credential row бросают
  `runtime_setting_unavailable:<key>` вместо `false`.
- Password login читает обязательный `auth_2fa_enabled` до `setSessionFromUser`; voluntary TOTP и
  текущая platform-policy семантика не изменены.
- Реальный migration evidence: `node apps/webapp/scripts/audit-ch7-settings-values-db.acceptance.mjs`.
  Script создаёт private disposable PostgreSQL 16, применяет именно `0300`–`0302`, проверяет
  fresh `41|28`, preservation empty/non-empty values, missing accessor и ACL shape.

## Что сделано

Перенесён продуктовый смысл семи коммитов старого carrier `wt/settings-to-db` (без тарифных/биллинговых
коммитов, без merge-коммитов, без удаления платформенного принуждения 2FA `92388d1df`), в исходном порядке:
`3afeeb0cb → 7ec886998 → e78f6aa29 → 4ef13090c → 0bb207cb1 → e64dc0397 → 6764822a8`.

- Начальные значения настроек заведены тремя миграциями (данные в базе, не константы в коде):
  `0300_runtime_settings_values_live_in_db.sql`, `0301_legacy_runtime_settings_values_live_in_db.sql`,
  `0302_public_auth_channel_configured_accessors.sql`. Номера — по брони на доске оркестраторов
  (`NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md`, `0300`-`0302` за `wt/settings-values-db`); исходные номера
  переноса (`0289`, `0290`, `0293` в старом carrier) переименованы, `_journal.json` пересчитан монотонно
  (`idx` = позиция в массиве, `when` — строго по возрастанию).
- `*_DEFAULTS`-таблицы (`PUBLIC_RUNTIME_BOOLEAN_DEFAULTS` и аналоги) удалены из
  `modules/system-settings/runtimeConfig.ts`; grep по репозиторию не находит ни одного оставшегося
  использования.
- `auth_2fa_enabled` больше не подставляется при сбое чтения — ошибка идёт наверх, маршрут отвечает
  отказом (`platformRequiresStaffTwoFactor`), а не тихим `false`.
- Анонимный/публичный auth-путь читает только явно разрешённую публичную проекцию и configured-флаги
  (`anonymousAuthChannelPolicy.ts`, SECURITY DEFINER аксессоры для SMS/Telegram/MAX из `0302`); учётные
  данные (`smtp_outbound`, `smsc_api_key`, OAuth-секреты и т.д.) читает только отдельный
  `authChannelPolicyAdmin.ts` с единственным потребителем — `api/platform/settings`.
- Добровольный TOTP и существующее платформенное принуждение к 2FA не тронуты — их отдельно снимает
  `0303` (`wt/2fa-enforcement-removal`).

## Отклонения от карантина исходных коммитов (по брифу)

- Из `7ec886998` не перенесена старая редакция `docs/_TODO/SINGLE_ENTRY_CLEANUP_2026-08-01.md` и
  прежний `CH7_BLIND_AUDIT_REPORT.md` — по прямому указанию брифа.
- Промежуточные bounded-отчёты старого carrier (`CH7B_LEGACY_READERS_REPORT.md`,
  `CH7D_PUBLIC_PATH_REPORT.md`, `CH7_ROUND3_REPORT.md`, `CH7_ROUND4_REPORT.md`) не перенесены — они
  описывают промежуточные круги на чужой ветке (`wt/settings-to-db`) со старыми номерами миграций;
  замещены этим единственным отчётом.
- Семь cherry-pick-коммитов сведены в один coherent commit с `#1082` (требование приёмки этого брифа).

## Проверено

- `bash apps/webapp/scripts/check-drizzle-journal-sync.sh` — OK.
- `bash apps/webapp/scripts/check-legacy-migrations-frozen.sh` — OK.
- `node scripts/check-db-chokepoint.mjs` — OK.
- `node apps/webapp/scripts/audit-ch7-settings-values-db.acceptance.mjs` — OK: `41|28`,
  preservation `true|true|true`, missing SMS row = `runtime_setting_unavailable:smsc_api_key`,
  ACL/function shape `false|true|true|true|true`.
- `pnpm run typecheck` (webapp) — 0 ошибок.
- `pnpm run lint` (webapp: eslint) — 0 ошибок, 2 существовавших ДО этой работы предупреждения
  (`no-console` в `api/clinic/billing/route.ts`, `infra/payments/yookassaPaymentProvider.ts`), эта работа
  их не касается.
- Точечные unit/route vitest kill-set — 53/53 зелёных:
  `configAdapter.unit.test.ts`, `runtimeSettingsNoSubstitution.unit.test.ts`,
  `publicAuthPolicy.unit.test.ts`, `publicAuthSnapshot.unit.test.ts`, `sessionCookie.unit.test.ts`,
  `passkeyAuth.unit.test.ts`, `adminSettingsData.unit.test.ts`,
  `operatorHeartbeatConfig.unit.test.ts` +
  `independentAuthMethodToggle.route.test.ts`, `oauthAppleToggle.route.test.ts`,
  `passwordAuth.route.test.ts`, `phoneStartFallback.route.test.ts`.

## НЕ СДЕЛАНО

- `check-no-new-raw-sql.mjs` красный на `saasBillingTariffSnapshot.devDbProof.test.ts` — существовал
  ДО этой ветки (введён коммитами `447f24307`/`10916cbbd` тарифного workstream на `feat/doctor-ui-rebuild`
  ещё до создания `wt/settings-values-db`); воспроизведено и в основном дереве. Вне scope этого брифа,
  не трогать.
- Миграции не применялись ни к одной из DEV/TEST/PROD баз, сервер не поднимался — по прямому запрету
  брифа. Единственная проверка применения — disposable-кластер
  `audit-ch7-settings-values-db.acceptance.mjs`.
- Полный `pnpm run ci` не гонялся (не требуется этим брифом; точечные проверки перечислены выше).
- Строка Ч7 плана НЕ помечена закрытой этим коммитом — только фиксируется SHA/evidence, решение о
  land — за лидом/владельцем.

# Ч7 — fix-round по blind audit `ed4a9170f`

## Роль и authority

Ты bounded worker. Прочитай `AGENTS.md` по маршруту: §1 миграции, §2–§5, §7, §9–§10b, §24; module docs auth,
system-settings и operator-health. Authority — `docs/_TODO/SINGLE_ENTRY_CLEANUP_2026-08-01.md`, Ч7. Независимый
kill-set и точные failing cases —
`docs/_TODO/runs/testsuite-v2/CH7_SETTINGS_VALUES_DB_BLIND_AUDIT_REPORT.md`, audit commit `ed4a9170f`.

Источник оракула: Ч7 — «строка на каждую настройку заводится миграцией; таблицы `*_DEFAULTS` удалены; читатель
берёт значение только из базы» и при unavailable DB/missing required row «Мы просто не пускаем пока не
поднимется». Единственное исключение — TTL/security delays, нужные до ответа БД. Добровольный TOTP и текущее
platform enforcement этим round не меняются.

Работа только в `wt/settings-values-db`; DEV/TEST/PROD/server/deploy/push не трогать. Product fix делает worker,
не переписывает audit report/tests и не добавляет новый blind scope.

## Исправить ровно F1–F6

1. **F1 required rows / code defaults.** Admin settings data, `doctor_today_preferences` и
   `patient_booking_url` не должны синтезировать продуктовую политику из кода при missing row. Нужное начальное
   значение должно жить в `0300/0301` и читаться через typed DB path. Missing/error → наблюдаемый
   `RuntimeSettingUnavailableError` до product side effect. Удалить ложную optional-key семантику, не превратить
   empty DB value в missing автоматически.
2. **F2 operator heartbeat.** Зарегистрировать `operator_heartbeat_config` в typed/admin registry и PATCH
   allowlist существующим способом; initial `{warnAfterSeconds,criticalAfterSeconds}` хранить в migration row.
   Consumers не подставляют compiled 6/26h при `{}`/missing/error. Если TTL/delay exception здесь неприменим
   (это изменяемые product thresholds), числа остаются только в БД.
3. **F3 migration preservation.** `0300–0302` на существующей базе не перезаписывают ни non-empty, ни явно пустые
   admin values. Seed использует `ON CONFLICT DO NOTHING`; accessor migration не исправляет data постфактум.
   Fresh install при этом получает необходимые строки и валидные initial values.
4. **F4 public configured accessors.** Три zero-arg boolean функции для SMS/Telegram/MAX при отсутствующей
   credential row не возвращают `false`: они fail closed/unavailable так, чтобы caller не выбирал policy. DB
   error тоже propagates. Сохранить zero-arg allowlist, SECURITY DEFINER shape и отсутствие прямого credential
   SELECT у anonymous role.
5. **F5 login ordering.** В password login обязательное чтение `auth_2fa_enabled` происходит до
   `setSessionFromUser`/cookie mint и иных auth side effects. Missing/error → отказ без session. Enrolled
   voluntary TOTP и существующая platform-policy семантика остаются.
6. **F6 честное evidence.** Worker report и строка плана больше не называют старый
   `smoke-s5-1-runtime-settings-contract.mjs` доказательством `0300–0302`. Evidence — реальный disposable script
   аудитора, применяющий эти migrations, после того как он green. Чекбокс Ч7 не ставить до land.

## Acceptance

Сначала прогнать оставленные audit tests/scripts красными, затем после fix теми же командами зелёными:

- `apps/webapp/scripts/audit-ch7-settings-values-db.acceptance.mjs` — fresh counts, existing empty/non-empty
  preservation, missing accessor unavailable, ACL shape;
- `adminSettingsData.unit.test.ts`, `runtimeSettingsNoSubstitution.unit.test.ts`,
  `operatorHeartbeatConfig.unit.test.ts`, `passwordAuth.route.test.ts`;
- весь targeted список из audit report — ни одной регрессии configured/toggle/admin/TOTP boundaries;
- temporary fault injections не повторять: kill-set уже зафиксирован; worker обязан только сделать постоянные
  acceptance tests green.

Плюс journal/legacy migration gates, webapp typecheck, targeted/full app eslint, `git diff --check`. Общий
`check-no-new-raw-sql` разрешено честно указать blocked только тем же чужим tariff file; его не чинить и не
allowlist'ить.

## Миграции и scope

Номера `0300`–`0302` забронированы и ещё не landed/applied этим workstream; изменяй их содержимое/journal только
в пределах Ч7, не создавай `0304`. `0303` зарезервирован за последующим removal platform 2FA и здесь не трогается.

Разрешены только текущая Ч7 surface, audit acceptance files, migration/journal и обновлённый worker report/одна
строка плана. Запрещены quota, media, integrator, tariff/billing, removal platform 2FA, новые env defaults.

Один product fix commit `#1082`, чистое дерево. Report обновить честным разделом «FIX ROUND ed4a9170f» и
`НЕ СДЕЛАНО`; audit report не переписывать. Повторный blind auditor не нужен по `AGENTS.md` §24.5: оркестратор
принимает итоговый SHA по тому же green kill-set и diff, если новой поверхности не появилось.

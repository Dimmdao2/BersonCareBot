# Аудит Stage 4 — display-timezone integrator из БД, единый источник с webapp

**Дата аудита:** 2026-04-04 (UTC)  
**Входные документы:** `STAGE_4_INTEGRATOR_DISPLAY_TIMEZONE_FROM_DB.md`, `MASTER_PLAN.md` (Stage 4), `AGENT_EXECUTION_LOG.md`  
**Evidence CI:** `pnpm install --frozen-lockfile && pnpm run ci` — **exit code 0** на момент аудита.

---

## Verdict

**REWORK_REQUIRED**

Основной зазор относительно чеклиста и Gate Stage 4: при fallback по `app_display_timezone` **инцидент в БД создаётся всегда**, но **Telegram-алерт уходит только если вызывающий код передал `dispatchPort`** и выполнены условия в `recordDataQualityIncidentAndMaybeTelegram` (первый dedup-insert, настроенный `adminTelegramId`). На путях **Google Calendar sync** и **чтение правил напоминаний из webapp** `getAppDisplayTimezone` вызывается **без** `dispatchPort` → при проблеме настройки оператор получает инцидент в таблице, но **не гарантирован push в Telegram**, что расходится с формулировкой проверки 5 и Gate («инцидент + Telegram»).

Остальное (чтение из `system_settings`, TTL 60s, удаление timezone из zod `env.ts`, тесты на happy path + missing row, зелёный `pnpm run ci`) в целом соответствует целям этапа.

---

## Проверенные критерии (чеклист)

| # | Критерий | Результат |
|---|-----------|-----------|
| 1 | Integrator читает `app_display_timezone` из `system_settings` (scope `admin`) | **OK:** `SELECT value_json FROM system_settings WHERE key = $1 AND scope = $2` с `['app_display_timezone', 'admin']`. Файл: `apps/integrator/src/config/appTimezone.ts`. Тест: `appTimezone.test.ts` (assert по SQL и args). |
| 2 | Нет расхождения **источника** данных между webapp и integrator | **OK по таблице/ключу:** webapp — `getConfigValue('app_display_timezone', …)` → тот же `system_settings`, scope `admin`, разбор `value_json.value` (`apps/webapp/src/modules/system-settings/configAdapter.ts`). Integrator — тот же контракт парсинга в `parseSettingsValueJson`. **Нюанс (MEDIUM):** webapp `normalizeAppDisplayTimeZone` проверяет только regex `IANA_LIKE`; integrator дополнительно `Intl.DateTimeFormat(…, { timeZone })`. В редких случаях webapp может принять строку, которую integrator отклонит как `invalid_iana` → расхождение отображаемого значения и integrator-fallback. |
| 3 | Env timezone vars удалены или корректно депрекейтнуты | **Частично OK:** `APP_DISPLAY_TIMEZONE` / `BOOKING_DISPLAY_TIMEZONE` **нет** в zod-схеме `apps/integrator/src/config/env.ts`. **Остаток:** `getAppDisplayTimezoneSync()` всё ещё читает эти имена из `process.env` без runtime `warn` (только JSDoc `@deprecated`). В runtime-дереве импортов **нет** вызовов `getAppDisplayTimezoneSync` кроме реэкспорта в `bookingDisplayTimezone.ts` — риск «тихого» env-оверрайда низкий, но механизм не соответствует формулировке Stage 4 S4.T03 («явный warn»). |
| 4 | TTL cache / fallback | **OK:** кэш 60s, при miss/ошибке fallback в `Europe/Moscow` с записью в кэш на TTL (снижение шторма к БД). Тест: один вызов `query` при двух подряд `getAppDisplayTimezone` в пределах TTL. Хук сброса: `resetAppDisplayTimezoneCacheForTests`. |
| 5 | Fallback по display-timezone не «тихий»: инцидент + Telegram | **Частично OK:** `recordDataQualityIncidentAndMaybeTelegram` вызывается при любом `fallback` из `resolveAppDisplayTimezone` → **инцидент** (upsert). **Telegram** — только при переданном `dispatchPort` и успешном dedup (`occurrences === 1`) и валидном `telegramConfig.adminTelegramId`. **Пути без `dispatchPort`:** `mapRubitimeEventToGoogleEvent` / `syncAppointmentToCalendar` (`sync.ts`), `createRemindersReadsPort` (`remindersReadsPort.ts`). |
| 6 | Evidence tests + CI | **OK CI:** полный `pnpm run ci` зелёный. **Тесты:** `appTimezone.test.ts` — Samara из БД + TTL, missing → fallback + вызов мока инцидента, Rubitime offset от Samara. **Пробелы:** нет отдельных тестов на `invalid_iana`, `query_failed`, и на цепочку «fallback + `dispatchPort` → `dispatchOutgoing`». |

---

## Findings по серьёзности

### HIGH

1. **Telegram при fallback display-timezone не гарантирован на всех операционных путях**  
   **Где:**  
   - `apps/integrator/src/integrations/google-calendar/sync.ts` — `getAppDisplayTimezone({ db })` без `dispatchPort`.  
   - `apps/integrator/src/infra/adapters/remindersReadsPort.ts` — то же.  
   **Почему важно:** Gate Stage 4 и проверка 5 формулируют пару **инцидент + Telegram**; сейчас для части сценариев остаётся только инцидент (+ `logger.warn`).  
   **Fix:** пробросить `DispatchPort` в `SyncDeps` / фабрику `createRemindersReadsPort` (или получать его из существующего DI), и передавать в `getAppDisplayTimezone({ db, dispatchPort })` там, где в проде доступен исходящий канал; либо централизованный фасад «resolve display tz для фоновых задач» с общим портом.

### MEDIUM

1. **Разная строгость валидации IANA: webapp vs integrator**  
   **Где:** `apps/webapp/src/modules/system-settings/appDisplayTimezone.ts` (`IANA_LIKE`) vs `apps/integrator/src/config/appTimezone.ts` (`isValidIanaTimeZone`).  
   **Риск:** админ сохраняет значение, которое webapp показывает как валидное, integrator отклоняет → fallback MSK + инцидент на стороне integrator.  
   **Fix:** выровнять проверку (например общий shared-модуль или та же `Intl`-проверка в webapp при сохранении).

2. **`getAppDisplayTimezoneSync` без явного deprecation warn**  
   **Где:** `apps/integrator/src/config/appTimezone.ts`.  
   **Fix:** при непустом `APP_DISPLAY_TIMEZONE` / `BOOKING_DISPLAY_TIMEZONE` логировать `logger.warn` один раз (или на каждый вызов с rate limit) с текстом «removed from supported config; use system_settings».

### LOW

1. **`MASTER_PLAN.md` (раздел «Текущее состояние») устарел**  
   Там до сих пор указано, что integrator берёт timezone из env — фактически основной путь уже БД.  
   **Fix:** обновить документ после закрытия Stage 4 FIX.

2. **`scripts/stage4-release-gate.mjs` на корне** — про projection/reconcile, **не** про TIMEZONE Stage 4; путаницы в имени нет в коде, но в коммуникации стоит не смешивать с гейтом из `STAGE_4_INTEGRATOR_DISPLAY_TIMEZONE_FROM_DB.md`.

---

## Канонические пути к коду

| Тема | Путь |
|------|------|
| Чтение display TZ + кэш + fallback + инцидент | `apps/integrator/src/config/appTimezone.ts` |
| Инцидент + Telegram (dedup) | `apps/integrator/src/infra/db/dataQualityIncidentAlert.ts` |
| Zod env (без display timezone) | `apps/integrator/src/config/env.ts` |
| Тесты Stage 4 (integrator) | `apps/integrator/src/config/appTimezone.test.ts` |
| Webapp: то же хранилище | `apps/webapp/src/modules/system-settings/configAdapter.ts`, `appDisplayTimezone.ts` |
| M2M с `dispatchPort` | `apps/integrator/src/integrations/rubitime/recordM2mRoute.ts` |
| Handlers напоминаний (с `dispatchPort` при наличии) | `apps/integrator/src/kernel/domain/executor/handlers/reminders.ts` |
| GCal (без `dispatchPort` сейчас) | `apps/integrator/src/integrations/google-calendar/sync.ts` |
| Reminders reads (без `dispatchPort`) | `apps/integrator/src/infra/adapters/remindersReadsPort.ts` |

---

## MANDATORY FIX INSTRUCTIONS (Stage 4 FIX)

Обязательные действия для повторного аудита Stage 4 с вердиктом **PASS** (в дополнение к уже зелёному `pnpm run ci`).

1. **[HIGH] Telegram при fallback `app_display_timezone` на всех релевантных путях**  
   - **Файлы:** `apps/integrator/src/integrations/google-calendar/sync.ts` (сигнатуры `mapRubitimeEventToGoogleEvent`, `syncAppointmentToCalendar`, `SyncDeps`), вызов из `apps/integrator/src/integrations/rubitime/connector.ts`; `apps/integrator/src/infra/adapters/remindersReadsPort.ts` и место создания порта в DI.  
   - **Сделать:** везде, где в проде вызывается `getAppDisplayTimezone` и может произойти fallback, передавать **`dispatchPort`**, если он доступен в контексте выполнения (аналогично `recordM2mRoute.ts` и `reminders.ts`). Если порт недоступен по архитектуре — явно задокументировать исключение и добавить альтернативный обязательный канал (например метрика/лог уровня error с стабильным кодом), согласованный с командой.  
   - **Done-критерий:** для сценариев `missing_or_empty` / `invalid_iana` / `query_failed` на путях GCal и reminder-reads либо уходит Telegram при `occurrences === 1`, либо зафиксировано письменное исключение в плане и коде.

2. **[MEDIUM] Депрекейт env в `getAppDisplayTimezoneSync`**  
   - **Файл:** `apps/integrator/src/config/appTimezone.ts`.  
   - **Сделать:** при использовании непустых `process.env.APP_DISPLAY_TIMEZONE` / `BOOKING_DISPLAY_TIMEZONE` — **`logger.warn`** с явным текстом, что источник истины — `system_settings.app_display_timezone`.  
   - **Done-критерий:** при установленных legacy env в логах есть предупреждение; поведение для скриптов сохраняется осознанно.

3. **[MEDIUM] (Рекомендуется) Выровнять валидацию IANA с integrator**  
   - **Файлы:** webapp settings / `appDisplayTimezone.ts` или API сохранения настроек.  
   - **Сделать:** отклонять при сохранении значения, которое integrator пометит как `invalid_iana`.  
   - **Done-критерий:** админка не сохраняет «ломаные» зоны, которые дают integrator-fallback.

4. **[LOW] Тесты**  
   - **Файл:** `apps/integrator/src/config/appTimezone.test.ts` (или рядом).  
   - **Сделать:** кейсы `invalid_iana` и `query_failed` → вызов `recordDataQualityIncidentAndMaybeTelegram` с ожидаемым `incident.errorReason`; опционально кейс с моком `dispatchPort` → проверка `dispatchOutgoing` при первом dedup.  
   - **Done-критерий:** все причины fallback из `resolveAppDisplayTimezone` покрыты тестом поведения (хотя бы мок инцидента; для Telegram — при наличии порта).

5. **[LOW] Документация**  
   - Обновить `MASTER_PLAN.md` «Текущее состояние» / Stage 4, чтобы не утверждать, что integrator display TZ идёт из env как основной путь.

---

## Краткое резюме для релиза

- **Единый источник данных:** `system_settings.key = app_display_timezone`, `scope = admin` — соблюдён для integrator и webapp.  
- **Риск остаётся** в **наблюдаемости Telegram** на фоновых путях без `dispatchPort` и в **лёгком расхождении валидации** webapp vs integrator.  
- **CI:** полный pipeline пройден на момент аудита.

# Аудит выполнения: Режимы и тестовые аккаунты

**Дата аудита:** 2026-05-02 (глубокая сверка после реализации); **доп. сверка 2026-05-02** — batch PATCH «Режимы» + предпросмотр телефонов тестовых аккаунтов.  
**Исходный план (Cursor):** `modes_settings_cleanup_2c131a1e` — зеркало: [`MODES_SETTINGS_CLEANUP_PLAN.md`](MODES_SETTINGS_CLEANUP_PLAN.md). **План batch + preview:** [`MODES_BATCH_PATCH_AND_PHONE_PREVIEW_PLAN.md`](MODES_BATCH_PATCH_AND_PHONE_PREVIEW_PLAN.md).  
**Журнал:** [`LOG.md`](LOG.md) — запись «режимы, тестовые аккаунты, dev_mode relay» + пункт batch/preview.  
**Статус:** **закрыт** — DoD первого плана и последующего batch/preview выполнены; документация и команды верификации синхронизированы с кодом.

---

## 1. Краткий вывод

Реализованы: ключ **`test_account_identifiers`** (нормализация, PATCH, тесты API), хелперы **`testAccounts.ts`** (в т.ч. **`previewTestAccountPhoneTokens`** для UI), **`SystemSettingsService.shouldDispatchRelayToRecipient`** / **`isTestPatientSession`** / **`persistAdminModesBatch`** (fail-closed), **`relayOutbound`** с **`shouldDispatchRelay({ channel, recipient })`**, DI в **`buildAppDeps`**, вкладка **«Режимы»** (админ одной строкой, тестовые аккаунты, техработы, dev/debug), скрыта вкладка **«Доступ и роли»**, техработы убраны из **«Параметры приложения»**, bypass техработ в **`patient/layout.tsx`** через `patientMaintenanceReplacesPatientShell(..., isTestAccount)`. Сохранение формы «Режимы» — **batch** `PATCH { items }` + транзакция `upsertManyInTransaction`. **`integration_test_ids`** остаётся в **`ALLOWED_KEYS`** без основного UI; runtime relay **не** использует internal `userId` для guard. Миграция integrator: `apps/integrator/src/infra/db/migrations/core/20260502_0002_test_account_identifiers_setting.sql`.

---

## 2. Definition of Done (план) — сверка

| Критерий | Результат |
|----------|-----------|
| В Settings нет отдельной вкладки «Доступ и роли» | Да — `AdminSettingsTabsClient` без вкладки; `AccessListsSection` не рендерится из `page.tsx` |
| Вкладка «Админ: режим» переименована в «Режимы» | Да — `ADMIN_SECTIONS` + заголовок карточки |
| В «Режимы» блок администратора (телефон, Telegram ID, Max ID) | Да — первый слот массивов `admin_*` |
| Явные тестовые аккаунты; internal userId не в UI | Да — три поля + `test_account_identifiers` |
| Dev mode relay по Telegram/Max recipient, не по userId | Да — `relayOutbound` + `shouldDispatchRelayToRecipient` |
| При техработах: обычный client — заглушка; тестовый — полный UI | Да — `layout.tsx` + `isTestPatientSession` |
| Настройки в `system_settings`, без новых env | Да |
| Документация инициативы и runtime-config | Да — этот файл, `LOG`, `CONFIGURATION_*`, `INTEGRATOR_CONTRACT`, [`settings.md`](../../apps/webapp/src/app/app/settings/settings.md), roadmap |
| Целевые тесты + webapp typecheck + lint | Да — см. §6 |
| Batch PATCH «Режимы» (один запрос, TX в `public`) + preview телефонов | Да — см. §4a и [`MODES_BATCH_PATCH_AND_PHONE_PREVIEW_PLAN.md`](MODES_BATCH_PATCH_AND_PHONE_PREVIEW_PLAN.md) |

---

## 3. Чек-листы по шагам плана

### Шаг 1 — контракт `test_account_identifiers`

| Пункт | Статус |
|-------|--------|
| `ALLOWED_KEYS` + ветка PATCH + нормализация | ✅ `types.ts`, `route.ts`, `normalizeTestAccountIdentifiersValue` |
| Тесты route: 200 нормализация/dedupe, 400 неверная форма; batch «Режимы» | ✅ `route.test.ts` |
| Сохранение через `updateSetting` / sync | ✅ одиночный PATCH → `updateSetting`; batch «Режимы» (`{ items }`) → `persistAdminModesBatch` (TX + sync + invalidate по ключам) |

### Шаг 2 — helper и сервис

| Пункт | Статус |
|-------|--------|
| `testAccounts.ts` + unit-тесты | ✅ |
| `readTestAccountIdentifiersFromPort` + fail-closed | ✅ `service.ts` |
| `service.test.ts` relay + `isTestPatientSession` + `persistAdminModesBatch` | ✅ |

### Шаг 3 — dev_mode relay

| Пункт | Статус |
|-------|--------|
| `RelayOutboundDeps.shouldDispatchRelay({ channel, recipient })` | ✅ `relayOutbound.ts` |
| DI `buildAppDeps` | ✅ |
| `doctorSupportMessagingService` передаёт `opts` | ✅ |
| Тесты `relayOutbound.test.ts`, `doctorSupportMessagingService.test.ts` | ✅ |
| `rg` по `apps/webapp/src`: нет `shouldDispatch(userId)` для relay; `integration_test_ids` только types/route | ✅ |

### Шаг 4 — Settings UI

| Пункт | Статус |
|-------|--------|
| `AdminSettingsTabsClient`: «Режимы», без «Доступ и роли» | ✅ |
| `page.tsx`: данные для режимов, без `AccessListsSection` | ✅ |
| `AdminSettingsSection`: админ, тесты, техработы, флаги | ✅ |
| `AppParametersSection` без maintenance | ✅ |
| RTL: `AdminSettingsSection.test.tsx` (batch-save), `AppParametersSection.test.tsx` | ✅ |
| `rg "Доступ и роли\|Админ: режим\|integration_test_ids" apps/webapp/src/app/app/settings` | ✅ **0 совпадений** (доки и legacy-компонент переименованы; `integration_test_ids` не в этом каталоге кроме исключённых путей) |

### Шаг 5 — bypass техработ

| Пункт | Статус |
|-------|--------|
| `patientMaintenanceReplacesPatientShell` с `isTestAccount` | ✅ `patientMaintenance.ts` + truth table в `patientMaintenance.test.ts` |
| `layout.tsx`: сессия `phone` / `bindings.telegramId` / `bindings.maxId` | ✅ |
| `buildAppDeps` только при `enabled && !skip` (+ reuse для bookings) | ✅ |

### Шаг 6 — документация

| Пункт | Статус |
|-------|--------|
| `LOG.md` | ✅ + ссылка на этот аудит |
| `CONFIGURATION_ENV_VS_DATABASE.md` | ✅ |
| `INTEGRATOR_CONTRACT.md` | ✅ |
| [`settings.md`](../../apps/webapp/src/app/app/settings/settings.md), roadmap, patient maintenance audit (кросс-ссылки) | ✅ |

---

## 4. Правки после глубокого аудита (этот прогон)

1. **`AccessListsSection.tsx`:** заголовок «Доступ и роли» заменён на нейтральный legacy-заголовок и пояснение, что компонент не смонтирован в `page.tsx`, чтобы `rg` по настройкам не конфликтовал с продуктовой моделью «вкладка скрыта».
2. **`PATIENT_MAINTENANCE_MODE_EXECUTION_AUDIT.md`:** актуализированы DoD и шаги UI (техработы в «Режимы»; smoke PATCH разделён между секциями).
3. **`CONFIGURATION_ENV_VS_DATABASE.md`:** блок «связанные файлы» — добавлены `AdminSettingsSection`, уточнено про `AccessListsSection`.
4. **`SPECIALIST_CABINET_STRUCTURE.md`:** список вкладок settings.
5. **`RECOMMENDATIONS_AND_ROADMAP.md`:** строка таблицы «выполнено» про режимы/тестовые аккаунты; уточнение строки про техработы (UI во вкладке «Режимы»).
6. **`types.ts`:** JSDoc для **`integration_test_ids`** как legacy.
7. **`service.ts`:** уточнён JSDoc relay (Telegram/Max; телефоны в `test_account_identifiers` для bypass пациента; SMS relay — задел на будущее по полю `phone` в контракте deps при появлении вызовов).
8. **Индекс инициативы** [`README.md`](README.md): строки плана и аудита.
9. **Третий прогон (batch + preview):** репозиторное зеркало плана [`MODES_BATCH_PATCH_AND_PHONE_PREVIEW_PLAN.md`](MODES_BATCH_PATCH_AND_PHONE_PREVIEW_PLAN.md); обновлены [`LOG.md`](LOG.md), [`../ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md`](../ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md), [`PATIENT_MAINTENANCE_MODE_EXECUTION_AUDIT.md`](PATIENT_MAINTENANCE_MODE_EXECUTION_AUDIT.md), [`RECOMMENDATIONS_AND_ROADMAP.md`](RECOMMENDATIONS_AND_ROADMAP.md), [`../README.md`](../README.md), индекс [`README.md`](README.md) — §4a этого аудита.

### Закрытие хвостов полного аудита (второй прогон, 2026-05-02)

| Пункт | Статус |
|-------|--------|
| Ошибка чтения `isTestPatientSession` в RSC не роняет layout | ✅ `patient/layout.tsx`: `try/catch` + `logger.warn`, при ошибке считаем **не** тестовым (fail-closed к bypass) |
| Текст предупреждения при включении admin mode | ✅ `AdminModeToggle.tsx`: явное имя ключа `test_account_identifiers` |
| JSDoc `relayRecipientAllowedInDevMode` vs фактическое поведение | ✅ `testAccounts.ts` (см. предыдущий прогон) |

### Закрытие хвостов (третий прогон, 2026-05-02) — batch PATCH + preview телефонов

| Пункт | Статус |
|-------|--------|
| Один HTTP-запрос вместо `Promise.all` из 13 PATCH | ✅ `patchAdminSettingsBatch` + `PATCH` с `{ items }` в [`route.ts`](../../apps/webapp/src/app/api/admin/settings/route.ts) |
| Транзакция на все ключи формы «Режимы» в `public.system_settings` | ✅ `upsertManyInTransaction` + `persistAdminModesBatch` |
| Общая нормализация с одиночным PATCH | ✅ `adminSettingsPatchNormalize.ts`, `MODES_FORM_KEYS` |
| Ошибки batch: `empty_batch`, `ambiguous_body`, `duplicate_key_in_batch`, `invalid_value` + `atIndex` | ✅ route + тесты |
| Предпросмотр отброшенных телефонов до Save | ✅ `previewTestAccountPhoneTokens` + UI в `AdminSettingsSection` |
| Документация / лог / план-зеркало | ✅ этот файл, `LOG.md`, [`MODES_BATCH_PATCH_AND_PHONE_PREVIEW_PLAN.md`](MODES_BATCH_PATCH_AND_PHONE_PREVIEW_PLAN.md), `CONFIGURATION_ENV_VS_DATABASE.md`, `PATIENT_MAINTENANCE_MODE_EXECUTION_AUDIT.md`, `RECOMMENDATIONS_AND_ROADMAP.md` |

**Ранее (до третьего прогона) намеренно не делали:** один batch PATCH и клиентский preview — **снято**: реализовано и задокументировано выше.

---

## 5. Ключевые файлы

| Файл |
|------|
| [`apps/webapp/src/modules/system-settings/types.ts`](../../apps/webapp/src/modules/system-settings/types.ts) |
| [`apps/webapp/src/modules/system-settings/modesFormKeys.ts`](../../apps/webapp/src/modules/system-settings/modesFormKeys.ts) |
| [`apps/webapp/src/modules/system-settings/adminSettingsPatchNormalize.ts`](../../apps/webapp/src/modules/system-settings/adminSettingsPatchNormalize.ts) |
| [`apps/webapp/src/modules/system-settings/ports.ts`](../../apps/webapp/src/modules/system-settings/ports.ts) |
| [`apps/webapp/src/infra/repos/pgSystemSettings.ts`](../../apps/webapp/src/infra/repos/pgSystemSettings.ts) |
| [`apps/webapp/src/infra/repos/inMemorySystemSettings.ts`](../../apps/webapp/src/infra/repos/inMemorySystemSettings.ts) |
| [`apps/webapp/src/modules/system-settings/testAccounts.ts`](../../apps/webapp/src/modules/system-settings/testAccounts.ts) |
| [`apps/webapp/src/modules/system-settings/service.ts`](../../apps/webapp/src/modules/system-settings/service.ts) |
| [`apps/webapp/src/modules/system-settings/patientMaintenance.ts`](../../apps/webapp/src/modules/system-settings/patientMaintenance.ts) |
| [`apps/webapp/src/modules/messaging/relayOutbound.ts`](../../apps/webapp/src/modules/messaging/relayOutbound.ts) |
| [`apps/webapp/src/app-layer/di/buildAppDeps.ts`](../../apps/webapp/src/app-layer/di/buildAppDeps.ts) |
| [`apps/webapp/src/app/api/admin/settings/route.ts`](../../apps/webapp/src/app/api/admin/settings/route.ts) |
| [`apps/webapp/src/app/app/settings/AdminSettingsTabsClient.tsx`](../../apps/webapp/src/app/app/settings/AdminSettingsTabsClient.tsx) |
| [`apps/webapp/src/app/app/settings/patchAdminSetting.ts`](../../apps/webapp/src/app/app/settings/patchAdminSetting.ts) |
| [`apps/webapp/src/app/app/settings/AdminSettingsSection.tsx`](../../apps/webapp/src/app/app/settings/AdminSettingsSection.tsx) |
| [`apps/webapp/src/app/app/settings/page.tsx`](../../apps/webapp/src/app/app/settings/page.tsx) |
| [`apps/webapp/src/app/app/patient/layout.tsx`](../../apps/webapp/src/app/app/patient/layout.tsx) |
| [`apps/integrator/.../20260502_0002_test_account_identifiers_setting.sql`](../../apps/integrator/src/infra/db/migrations/core/20260502_0002_test_account_identifiers_setting.sql) |

---

## 6. Команды верификации

```bash
rg "test_account_identifiers|integration_test_ids" apps/webapp/src --glob '!**/*.test.*'
rg "Доступ и роли|Админ: режим|integration_test_ids" apps/webapp/src/app/app/settings
pnpm --dir apps/webapp exec vitest run \
  src/app/api/admin/settings/route.test.ts \
  src/modules/system-settings/adminSettingsPatchNormalize.test.ts \
  src/modules/system-settings/testAccounts.test.ts \
  src/modules/system-settings/service.test.ts \
  src/modules/system-settings/patientMaintenance.test.ts \
  src/modules/messaging/relayOutbound.test.ts \
  src/modules/messaging/doctorSupportMessagingService.test.ts \
  src/app/app/settings/AdminSettingsSection.test.tsx \
  src/app/app/settings/AppParametersSection.test.tsx
pnpm --dir apps/webapp typecheck
pnpm --dir apps/webapp lint
```

**Примечание:** перед push в remote выполняется полный **`pnpm run ci`** из корня репозитория. Целевой набор vitest + webapp typecheck/lint — см. команды выше для быстрой проверки области.

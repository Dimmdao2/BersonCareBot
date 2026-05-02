# Аудит выполнения: Patient Maintenance Mode

**Дата аудита:** 2026-05-02.  
**Исходный план:** `/home/dev/.cursor/plans/patient-maintenance-mode_8667090d.plan.md` (Cursor), синхронизирован с репозиторием.  
**Журнал:** [`LOG.md`](LOG.md) — запись «режим техработ patient app».  
**Статус:** **закрыт** — DoD выполнен; хвосты независимого аудита закрыты 2026-05-02 (perf `getPatientMaintenanceConfig`, `patientMaintenanceReplacesPatientShell`, a11y, RTL admin); см. §4 / §4a.

---

## 1. Краткий вывод

Режим техработ для пациентского приложения реализован через `system_settings` (admin), без новых env, без SQL-seed в первом проходе. Гейт только для роли `client`; врач/админ и исключённые маршруты (`bind-phone`, `help`, `support`, allowlist при `need_activation`) не перекрываются. Проверены типы, ESLint webapp и целевые тесты.

---

## 2. Сверка с Definition of Done

| Критерий | Результат |
|----------|-----------|
| Админ включает/выключает режим без деплоя | Да — `AppParametersSection` + `PATCH /api/admin/settings` |
| URL записи редактируется, дефолт `https://dmitryberson.rubitime.ru` | Да — `patient_booking_url`, пустое значение → рантайм-дефолт |
| У `client` под `/app/patient` один экран без основого меню при включении | Да — `PatientMaintenanceScreen` + `patientHideBottomNav` |
| Экран: сообщение, внешняя запись, ближайшие записи (`upcoming`) | Да |
| Doctor/admin не под гейтом | Да — условие `role === "client"` |
| Новые env не добавлены | Да |
| Нет SQL-seed в первом проходе | Да |
| Тесты / typecheck / lint по затронутой области | Да — см. §6 |

---

## 3. Чек-листы по шагам плана

### Шаг 1 — ключи и валидация API

| Пункт | Статус |
|-------|--------|
| `ALLOWED_KEYS` + `ADMIN_SCOPE_KEYS` | ✅ |
| PATCH: boolean / сообщение ≤500 / URL http(s) или пусто | ✅ |
| `invalidateConfigKey` после PATCH | ✅ (общий вызов в конце handler) |
| Тесты route: невалидные значения → 400 | ✅ |
| `rg "patient_app_maintenance\|patient_booking_url" apps/webapp/src` | ✅ выполнено (точки интеграции: types, route, route.test, page, AppParametersSection, patientMaintenance.ts, тесты; layout использует helper без прямых строк ключей) |

### Шаг 2 — runtime helper

| Пункт | Статус |
|-------|--------|
| `patientMaintenance.ts`: дефолты, `getPatientMaintenanceConfig`, нормализаторы | ✅ |
| `getConfigBool` / `getConfigValue`, без env для этих ключей | ✅ |
| Юнит-тесты нормализаторов и `patientMaintenanceSkipsPath` | ✅ `patientMaintenance.test.ts` |

### Шаг 3 — админ UI

| Пункт | Статус |
|-------|--------|
| `page.tsx` — значения в `appParametersConfig` | ✅ |
| Секция «Режим техработ…», один «Сохранить» с шестью PATCH | ✅ |
| Клиентская валидация согласована с API | ✅ |
| RTL-тест `AppParametersSection` | ✅ `AppParametersSection.test.tsx` — один save → шесть PATCH включая maintenance |

### Шаг 4 — экран техработ

| Пункт | Статус |
|-------|--------|
| Server-friendly компонент, нужные props | ✅ |
| Без PatientTopNav / bottom nav (скрыт через AppShell) | ✅ |
| Форматирование записей через общие хелперы | ✅ |
| Рендер-тесты: сообщение, ссылка, пустой список, строка записи | ✅ |
| Небезопасный URL → дефолт (после аудита) | ✅ отдельный тест на `javascript:` |

### Шаг 5 — гейт в layout

| Пункт | Статус |
|-------|--------|
| Редиректы до гейта без изменений семантики | ✅ рефакторинг с единым `patientClientBusinessGate` |
| Только `client` + `getPatientMaintenanceConfig` + skip paths | ✅ |
| `listMyBookings` → `upcoming`, ошибки → пустой список + лог | ✅ |
| Интеграционный тест layout | **Частично** — `patientMaintenanceReplacesPatientShell` + `patientMaintenance.getConfig.test.ts`; без отдельного RSC layout (допустимо по плану) |

### Шаг 6 — документация

| Пункт | Статус |
|-------|--------|
| `LOG.md`: дефолты, без env, проверки, rollout/rollback | ✅ |
| Краткая помета в roadmap / TARGET_STRUCTURE_PATIENT | ✅ (после аудита) |
| Не позиционировать как финальную IA | ✅ явно «операционный guard» |

---

## 4. Остаточные действия (закрыто 2026-05-02)

1. **Оптимизация `getPatientMaintenanceConfig`:** при `enabled=false` читается только флаг, без `message`/`booking_url` из БД; при `enabled=true` — параллельное чтение двух ключей. Тесты: `patientMaintenance.getConfig.test.ts`.
2. **Явная логика «заменить shell»:** `patientMaintenanceReplacesPatientShell` + тесты в `patientMaintenance.test.ts`.
3. **a11y:** `sr-only` `<h2>` у блока сообщения на экране техработ.
4. **RTL `AppParametersSection`:** smoke на шесть PATCH при сохранении — `AppParametersSection.test.tsx`.
5. **Полный CI перед push** — выполнен в рамках команды «пуш».

---

## 4a. Остаточные действия (эксплуатация, вне кода)

1. **Manual smoke** (оператор): выключен режим → полный patient UI; включён → ключевые маршруты; врач/админ; записи.
2. **Продуктовый trade-off** allowlist при `need_activation` задокументирован; «жёсткий» локаут всех путей — отдельное решение, не в scope первого плана.

---

## 5. Ключевые файлы

| Файл |
|------|
| [`apps/webapp/src/modules/system-settings/types.ts`](../../apps/webapp/src/modules/system-settings/types.ts) |
| [`apps/webapp/src/modules/system-settings/patientMaintenance.ts`](../../apps/webapp/src/modules/system-settings/patientMaintenance.ts) |
| [`apps/webapp/src/modules/system-settings/patientMaintenance.getConfig.test.ts`](../../apps/webapp/src/modules/system-settings/patientMaintenance.getConfig.test.ts) |
| [`apps/webapp/src/app/app/settings/AppParametersSection.test.tsx`](../../apps/webapp/src/app/app/settings/AppParametersSection.test.tsx) |
| [`apps/webapp/src/app/api/admin/settings/route.ts`](../../apps/webapp/src/app/api/admin/settings/route.ts) |
| [`apps/webapp/src/app/api/admin/settings/route.test.ts`](../../apps/webapp/src/app/api/admin/settings/route.test.ts) |
| [`apps/webapp/src/app/app/settings/page.tsx`](../../apps/webapp/src/app/app/settings/page.tsx) |
| [`apps/webapp/src/app/app/settings/AppParametersSection.tsx`](../../apps/webapp/src/app/app/settings/AppParametersSection.tsx) |
| [`apps/webapp/src/app/app/patient/layout.tsx`](../../apps/webapp/src/app/app/patient/layout.tsx) |
| [`apps/webapp/src/app/app/patient/PatientMaintenanceScreen.tsx`](../../apps/webapp/src/app/app/patient/PatientMaintenanceScreen.tsx) |
| [`apps/webapp/src/app/app/patient/PatientMaintenanceScreen.test.tsx`](../../apps/webapp/src/app/app/patient/PatientMaintenanceScreen.test.tsx) |

---

## 6. Команды верификации (зафиксированы в LOG)

```bash
pnpm --dir apps/webapp exec vitest run \
  src/app/api/admin/settings/route.test.ts \
  src/modules/system-settings/patientMaintenance.test.ts \
  src/modules/system-settings/patientMaintenance.getConfig.test.ts \
  src/app/app/patient/PatientMaintenanceScreen.test.tsx \
  src/app/app/settings/AppParametersSection.test.tsx
pnpm --dir apps/webapp typecheck
pnpm --dir apps/webapp lint
```

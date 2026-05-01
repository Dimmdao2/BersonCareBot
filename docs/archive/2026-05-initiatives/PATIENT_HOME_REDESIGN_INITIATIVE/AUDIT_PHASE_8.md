# AUDIT_PHASE_8

## 1. Verdict: PASS

Phase 8 соответствует ТЗ ([README § Phase 8](README.md)), ограничениям EXEC и проверкам ниже.

---

### 1.1. Ключи `system_settings` и mirror в integrator

**Ключи добавлены корректно:**

- [`apps/webapp/src/modules/system-settings/types.ts`](../../apps/webapp/src/modules/system-settings/types.ts): `patient_home_morning_ping_enabled`, `patient_home_morning_ping_local_time` в `ALLOWED_KEYS`.
- [`apps/webapp/src/app/api/admin/settings/route.ts`](../../apps/webapp/src/app/api/admin/settings/route.ts): те же строки в `ADMIN_SCOPE_KEYS`, валидация PATCH (boolean / `HH:MM` с паддингом).

**Mirror:**

- Комментарий в `types.ts`: whitelist синхронизируется в integrator после `updateSetting`.
- [`apps/webapp/src/modules/system-settings/syncToIntegrator.ts`](../../apps/webapp/src/modules/system-settings/syncToIntegrator.ts): синк по `(key, scope, valueJson)` без фильтра по имени ключа — любое успешное сохранение admin-ключа из webapp уходит в integrator (HTTP или outbox).
- Интегратор читает значения напрямую из БД: [`patientHomeMorningPing.ts`](../../apps/integrator/src/kernel/domain/executor/handlers/patientHomeMorningPing.ts) — `SELECT … FROM system_settings WHERE key = $1 AND scope = 'admin'` (в unified Postgres это та же логическая конфигурация, что и mirror по правилам проекта).

---

### 1.2. Пинг выключен по умолчанию

- **Webapp UI:** [`page.tsx`](../../apps/webapp/src/app/app/settings/patient-home/page.tsx) — `parseMorningPingEnabled` для отсутствующего/пустого значения возвращает `false`; время по умолчанию `"09:00"` только для отображения поля, не включает пинг.
- **Integrator:** [`parsePingEnabled`](../../apps/integrator/src/kernel/domain/executor/handlers/patientHomeMorningPing.ts) — для `null`/не boolean возвращает `false`, обработчик выходит с `morning_ping_disabled`.

---

### 1.3. Используется `daily_warmup` из блоков главной

- [`hasPublishedDailyWarmupContentPage`](../../apps/integrator/src/infra/db/repos/patientHomeMorningPing.ts): join `public.patient_home_block_items` + `patient_home_blocks` + `content_pages`, условие `phi.block_code = 'daily_warmup'`, видимость блока/item, опубликованная страница.
- Идентификатор `'daily_warmup'` — **код фиксированного блока главной** (каталог блоков / seed), не редакционный slug из [`CONTENT_PLAN.md`](CONTENT_PLAN.md). Целевой контент берётся из `phi.target_ref` → `content_pages.slug` динамически из БД.

---

### 1.4. Схема `reminder_rules` не менялась в Phase 8

- Просмотр [`apps/webapp/db/schema/schema.ts`](../../apps/webapp/db/schema/schema.ts): таблица `reminder_rules` без новых колонок в рамках аудируемого scope; поле `timezone` уже присутствует в схеме.
- Phase 8 расширяет **тип/маппинг** [`ReminderRule`](../../apps/webapp/src/modules/reminders/types.ts) и репозитории для чтения `timezone`, без миграций DDL под Phase 8 в проверенном diff инициативы.

---

### 1.5. Throttle / rate-limit

- [`handlePatientHomeMorningPing`](../../apps/integrator/src/kernel/domain/executor/handlers/patientHomeMorningPing.ts): между отправками разным получателям — `sleep(320)` мс (отключено при `NODE_ENV === 'test'`); лимит размера пачки `batchLimit` (по умолчанию обрезка 1…100, в сценарии — 80).
- Сценарий планировщика: [`scripts.json`](../../apps/integrator/src/content/scheduler/scripts.json) — шаг после `reminders.dispatchDue`, ограничивает совместную нагрузку с диспетчером напоминаний.

Это осмысленное разреживание по аналогии с другими каналами интегратора; отдельной очереди под morning ping нет.

---

### 1.6. `NextReminderCard` — не эвристика `updatedAt`

- [`PatientHomeToday.tsx`](../../apps/webapp/src/app/app/patient/home/PatientHomeToday.tsx): `homeReminder = pickNextHomeReminder(rules, new Date(), appTz)` — без сортировки правил по `updatedAt`.
- [`nextReminderOccurrence.ts`](../../apps/webapp/src/modules/patient-home/nextReminderOccurrence.ts): для каждого кандидата `computeNextOccurrenceUtcForRule` по `daysMask`, `windowStartMinute` / `windowEndMinute`, `intervalMinutes`, `timezone` правила (с fallback на `appFallbackTimezone`); выбирается минимальное `nextAt`.
- Подпись карточки: `formatNextReminderLabel(homeReminder.nextAt, appTz)`.

---

### 1.7. Deeplink

- В handler: `next=${encodeURIComponent('/app/patient?from=morning_ping')}` к URL входа в мини-приложение — соответствует ТЗ.

---

### 1.8. Нет hardcode slug-ов из `CONTENT_PLAN.md`

- Проверка: `rg` по `office-work|office-neck|face-self-massage` в `*.{ts,tsx,js}` репозитория — **совпадений нет**.
- Жёстко заданы только **коды блоков главной** (`daily_warmup`), как и в других фазах инициативы.

---

### 1.9. Тесты Phase 8

Присутствуют и покрывают ключевые ветки:

- Webapp: [`route.test.ts`](../../apps/webapp/src/app/api/admin/settings/route.test.ts) (ключи в whitelist + PATCH), [`nextReminderOccurrence.test.ts`](../../apps/webapp/src/modules/patient-home/nextReminderOccurrence.test.ts).
- Integrator: [`patientHomeMorningPing.test.ts`](../../apps/integrator/src/kernel/domain/executor/handlers/patientHomeMorningPing.test.ts).

---

## 2. Mandatory fixes

**None.**

---

## 3. Minor notes

1. **Совпадение алгоритма «следующего срабатывания» с диспетчером integrator**  
   Расчёт в `nextReminderOccurrence.ts` — чистая функция на стороне webapp. Если в integrator для окон/интервалов используется иная семантика (границы, первый слот), возможен косметический рассинхрон label на главной и фактического fire. Это не нарушение Phase 8 при отсутствии требования bit-exact parity; при появлении расхождений в проде — отдельная сверка с `reminders` policy в integrator.

2. **Первая запись mirror для новых ключей**  
   Пока админ не сохранит настройки, строк в `integrator.system_settings` может не быть; integrator корректно трактует отсутствие как «выкл.» / default time parse. Для гарантированного mirror без UI — обычно достаточно одного save в Admin Settings (уже по правилам проекта).

---

## 4. Tests reviewed / executed in this audit

### Reviewed (Phase 8 scope)

- `apps/webapp/src/app/api/admin/settings/route.test.ts`
- `apps/webapp/src/modules/patient-home/nextReminderOccurrence.test.ts`
- `apps/integrator/src/kernel/domain/executor/handlers/patientHomeMorningPing.test.ts`

### Executed during audit

```bash
pnpm --dir apps/webapp exec vitest run \
  src/app/api/admin/settings/route.test.ts \
  src/modules/patient-home/nextReminderOccurrence.test.ts

NODE_ENV=test pnpm --dir apps/integrator exec vitest run \
  src/kernel/domain/executor/handlers/patientHomeMorningPing.test.ts
```

**Result:** Webapp — `Test Files 2 passed (2)`, `Tests 27 passed (27)`. Integrator — `Test Files 1 passed (1)`, `Tests 3 passed (3)`.

---

## 5. Explicit confirmation

- Slug-и из `CONTENT_PLAN.md` в runtime Phase 8 не хардкожены.
- Ключи утреннего пинга проходят whitelist и общий путь mirror integrator при сохранении из webapp.

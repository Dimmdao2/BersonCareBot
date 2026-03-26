# PACK D — Reminders (Stage 12) !!

> Сложность: **высокий** — мультиканальный fallback, интеграция с integrator, модель seen  
> Агент: Auto (пул); шаги D.3 и D.5 → API-модель при проблемах  
> Зависимости: Pack B (system_settings: `important_fallback_delay_minutes`), Pack C (relay outbound)  
> Миграция: `032_reminder_seen_status.sql`  
> Source of truth: `USER_TODO_STAGE.md` секция 4, `PLAN.md` Stage 12

---

## Обязательные правила

- После каждого шага: `pnpm run ci`.
- При FAIL: починить → повторить (до 3 попыток). После 3 → СТОП.
- Не менять integrator runtime-код напрямую — только через M2M контракт.
- Отчёт: `docs/FULL_DEV_PLAN/finsl_fix_report.md`.

---

## Утверждённая policy (из USER_TODO_STAGE)

| Тип | Fallback | Правило |
|-----|----------|---------|
| Запись на приём | Да | Стандартный fallback по цепочке каналов |
| Reminders ЛФК | Да | Стандартный fallback |
| Чат (переписка) | Да | Стандартный fallback |
| Важные сообщения | Особый (B) | Сразу все мессенджеры + email; при отсутствии confirmed read → SMS через N минут (N = `important_fallback_delay_minutes` из settings, default 60) |
| Рассылки по темам | Нет | Только выбранные каналы, без fallback |

- Лимит: **20 отправок/день на пользователя** (каналы не считаются отдельно).
- Совпадающие правила: очередь с паузой 30 секунд.
- Хранение истории: 180 дней.
- "Прочитано": `open/click`.

---

## Шаг D.1 — Убрать stub, реализовать сервис reminders

**Файлы:**
- `apps/webapp/src/modules/reminders/service.ts` (переписать)
- `apps/webapp/src/modules/reminders/ports.ts` (новый)
- `apps/webapp/src/modules/reminders/types.ts` (новый или обновить)
- `apps/webapp/src/modules/reminders/service.test.ts` (обновить)
- `apps/webapp/src/infra/repos/pgReminderRules.ts` (новый)
- `apps/webapp/src/app-layer/di/buildAppDeps.ts`

**Действия:**
1. Определить типы:
   ```ts
   type ReminderCategory = "appointment" | "lfk" | "chat" | "important" | "broadcast";
   type ReminderRule = {
     id: string;
     integratorUserId: string;
     category: ReminderCategory;
     enabled: boolean;
     intervalMinutes: number | null;
     windowStartMinute: number; // 0-1440
     windowEndMinute: number;
     daysMask: number; // bitmask Mon-Sun
     fallbackEnabled: boolean;
     updatedAt: Date;
   };
   ```
2. Порт: `listByUser(integratorUserId)`, `getByCategory(integratorUserId, category)`, `toggleEnabled(id, enabled)`, `updateSchedule(id, schedule)`.
3. PG-репозиторий: SQL к `reminder_rules`.
4. Сервис:
   - `listRulesByUser(userId)` — реальные данные.
   - `updateRule(userId, ruleId, data)` — с валидацией: `windowStart < windowEnd`, `intervalMinutes > 0`.
   - `toggleCategory(userId, category, enabled)`.
5. Зарегистрировать в `buildAppDeps`.
6. Сохранить `validateReminderDispatchPayload` отдельно.

**Тесты:**
- Unit: сервис с моком порта — CRUD, валидация bounds.
- Integration: `pgReminderRules` — read/update cycle.

**DoD:** Сервис возвращает реальные данные из БД. CI зелёный.

---

## Шаг D.2 — Patient UI: `/app/patient/reminders`

> Источник: RAW_PLAN §5 — "Выбор каналов напоминаний. Выбор расписания и о чем напоминать. Статистика."

**Файлы:**
- `apps/webapp/src/app/app/patient/reminders/page.tsx` (новый)
- `apps/webapp/src/app/app/patient/reminders/actions.ts` (новый)
- `apps/webapp/src/app-layer/routes/paths.ts` (добавить `patientReminders`)
- `apps/webapp/src/shared/ui/PatientHeader.tsx` (добавить пункт меню)

**Действия:**
1. Добавить route `/app/patient/reminders` и `routePaths.patientReminders`.
2. Server Component: загрузить правила текущего пользователя.
3. Client Component: список категорий с toggle enabled, настройки расписания (interval, window, days).
4. Server Actions: `updateReminderRule` с Zod-валидацией.
5. shadcn: `Card`, `Switch`, `Select`, `Input` (числовой для minutes), `Button`.
6. Добавить пункт в меню пациента (ссылка в `PatientHeader` или боковое меню). В RAW_PLAN кнопка «Бот заботы» в блоке «Кабинет» на главной.
7. Тексты на русском: "Напоминания", "Запись на приём", "ЛФК", "Расписание", "Тихие часы".

**UI-стандарты (из Pack I — выполняется ДО Pack D):**
- Кнопки: единый стиль из I.1 (скругление, active-состояние).
- Размеры: из I.2 (шрифты, поля, отступы, input h-10/h-11 text-base).
- Для гостя: GuestPlaceholder из I.10.

**Тесты:**
- Integration: server action valid update → success.
- Integration: server action invalid bounds → error.
- Integration: unauthorized → redirect.
- E2E: patient opens reminders, toggles category → saved.

**DoD:** Пациент управляет правилами reminders через отдельный экран: каналы, расписание, toggle. CI зелёный.

---

## Шаг D.3 — Синхронизация изменений правил с integrator

**Файлы:**
- `apps/webapp/src/modules/reminders/service.ts` (добавить relay)
- `apps/webapp/src/modules/integrator/events.ts` (проверить контракт `reminder.rule.upserted`)
- `apps/webapp/src/app/api/integrator/reminders/rules/route.ts` (обновить)

**Действия:**
1. После каждого `updateRule` / `toggleCategory` → вызвать relay к integrator:
   - `POST {INTEGRATOR_API_URL}/api/integrator/reminders/rules` (или существующий путь из контракта).
   - Payload: `{ eventType: "reminder.rule.upserted", rule: { ...updatedRule } }`.
   - HMAC-подпись как в relay outbound (Pack C).
   - idempotencyKey: `rule_${ruleId}_${timestamp}`.
2. При ошибке relay — вернуть явную ошибку пользователю ("Настройки сохранены локально, но синхронизация с ботом не удалась").
3. Не блокировать сохранение в БД при ошибке relay (eventual consistency).

**Тесты:**
- Unit: relay вызывается после update.
- Unit: ошибка relay → warning, но rule saved.
- Integration: route test `POST /api/integrator/reminders/rules` с подписью.

**DoD:** Изменения правил синхронизируются с integrator. CI зелёный.

---

## Шаг D.4 — Колокольчик в PatientHeader

**Файлы:**
- `apps/webapp/src/shared/ui/PatientHeader.tsx`
- `apps/webapp/src/modules/reminders/hooks/useReminderUnreadCount.ts` (новый)
- `apps/webapp/src/app/api/patient/reminders/unread-count/route.ts` (новый)

**Действия:**
1. Новый API: `GET /api/patient/reminders/unread-count` → `{ count: number }` (из `reminder_occurrence_history` где `seen_at IS NULL`).
2. Hook `useReminderUnreadCount`: polling каждые 60 сек, pause при hidden.
3. В `PatientHeader`:
   - Убрать `disabled` у Bell.
   - Показать badge с count (shadcn `Badge`).
   - По клику → navigate к `/app/patient/reminders`.
4. Если count = 0 → badge не показывать.

**Тесты:**
- Unit: `useReminderUnreadCount` — polling behaviour.
- Component: `PatientHeader` рендерит badge при count > 0.

**DoD:** Колокольчик показывает реальное число непросмотренных. CI зелёный.

---

## Шаг D.5 — Миграция `seen` + статистика

**Файлы:**
- `apps/webapp/migrations/032_reminder_seen_status.sql` (новый)
- `apps/webapp/src/infra/repos/pgReminderProjection.ts` (обновить)
- `apps/webapp/src/app/app/patient/reminders/page.tsx` (добавить статистику)
- `apps/webapp/src/app/api/patient/reminders/mark-seen/route.ts` (новый)

**Действия:**
1. Миграция: добавить `seen_at TIMESTAMPTZ` в `reminder_occurrence_history` (если колонки нет):
   ```sql
   ALTER TABLE reminder_occurrence_history ADD COLUMN IF NOT EXISTS seen_at TIMESTAMPTZ;
   ```
2. API `POST /api/patient/reminders/mark-seen`:
   - Body: `{ occurrenceIds: string[] }`.
   - Обновить `seen_at = now()` для указанных ID текущего пользователя.
3. В `pgReminderProjection` добавить:
   - `getUnseenCount(userId)` → `SELECT COUNT(*) WHERE seen_at IS NULL AND user_id = $1`.
   - `getStats(userId, days)` → `{ total, seen, unseen, failed }` за N дней.
4. На странице `/app/patient/reminders` добавить блок статистики:
   - "За 30 дней: отправлено N, просмотрено M, пропущено K".
   - shadcn `Card` с числовыми метриками.
5. Кнопка "Отметить все как просмотренные" → `POST mark-seen`.

**Тесты:**
- Integration: mark-seen → `seen_at` обновлён → count уменьшился.
- Integration: getStats возвращает корректные агрегаты.
- E2E: mark-seen → badge decrease.

**DoD:** Есть однозначная модель seen/unseen. Статистика на экране. CI зелёный.

---

## Финальный критерий Pack D

- [ ] `modules/reminders/service.ts` без stub-логики.
- [ ] `/app/patient/reminders` с управлением правилами.
- [ ] Sync с integrator при update rule.
- [ ] Колокольчик активен с реальным count.
- [ ] Миграция `seen_at`, API mark-seen, статистика.
- [ ] `pnpm run ci` зелёный.

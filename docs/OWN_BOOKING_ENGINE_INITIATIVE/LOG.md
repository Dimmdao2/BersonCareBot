# LOG — журнал исполнения инициативы

Ведётся по мере работы. Каждый агент при закрытии этапа/значимого шага добавляет запись: что сделано, какие проверки выполнены, какие решения приняты, что намеренно не делали.

---

## 2026-05-29 — Создана инфраструктура инициативы (этап 0)

**Сделано:**
- Заведена папка `docs/OWN_BOOKING_ENGINE_INITIATIVE/` с документами:
  - `SOURCE_SPEC.md` — дословное ТЗ владельца (24 раздела), первоисточник (anti-loss).
  - `README.md` — точка входа, связи, обязательные правила.
  - `MASTER_PLAN.md` — видение, архитектурные принципы, сквозные C1–C10, обзор этапов, DoD инициативы.
  - `ROADMAP.md` — таблица 9 этапов, статусы, зависимости, общий gate.
  - `STAGE_CHECKLISTS.md` — ядро: обязательные результаты, способ реализации, приёмка по каждому этапу + матрица покрытия ТЗ.
  - `UI_SURFACES_CHECKLIST.md` — поверхности кабинетов админ/врач/пациент/публичный вход.
  - `DATA_MODEL_REFERENCE.md` — справочник канонических сущностей (ориентир).
  - `AGENT_BRIEF.md` — ТЗ для агента-исполнителя этапа (как строить декомпозированные планы).
  - `SCOPE_DECISIONS.md` — границы, связь с Rubitime/смежными инициативами, открытые `[need-decision]`.
- В `docs/README.md` добавлена ссылка на инициативу (раздел активных инициатив).

**Решения:**
- Источник правды — собственная БД; Rubitime — отключаемый двусторонний мост.
- Multi-tenant (`organization_id`) закладывается с этапа 1 (SaaS-задел), стартует один tenant.
- Платёжные провайдеры — строго `system_settings`, не ENV.
- Смежная инициатива онлайн-консультаций поглощается (после согласования) — реализуется на каноне.

**Проверки:** документация; код не менялся.

**Намеренно не делали:** код, финальный DDL, детальную декомпозицию этапов (по запросу владельца — это задача агентов-исполнителей по `AGENT_BRIEF.md`).

**Открытые вопросы к владельцу:** Q1–Q6 в `SCOPE_DECISIONS.md` §3 (провайдеры, баланс, календарный компонент, домены/CSP виджета, глубина SaaS, пороги «проблемный клиент»).

---

## 2026-05-29 — Этап 1: каноническая модель данных

**Сделано:**
- Drizzle-схема `apps/webapp/db/schema/bookingEngine.ts` (`be_*` таблицы, enum статусов записи, append-only события, таймлайн).
- Миграции `0086_booking_engine_canonical.sql`, `0087_booking_engine_backfill_legacy.sql` (seed организации, перенос `booking_*` → канон).
- Модуль `apps/webapp/src/modules/booking-engine/` (FSM статусов, service, ports), репозитории `pgBookingEngine.ts`, `pgBookingRubitimeBridge.ts` (read-bridge).
- Admin API `/api/admin/booking-engine/*`, UI `BookingEngineSection` на `/app/doctor/admin/booking`.
- Ключи `system_settings`: `booking_default_organization_id`, `booking_rubitime_bridge_enabled`.
- Документ модели: `CANONICAL_MODEL.md`; обновлены `DB_STRUCTURE.md`, `RUBITIME_BOOKING_PIPELINE.md`, `ROADMAP.md` (этап 1 → done).

**Проверки:** `pnpm --filter webapp typecheck`; `vitest run src/modules/booking-engine --project fast` (7 тестов).

**Доработка (закрытие хвостов этапа 1):**
- Модуль `booking-rubitime-bridge` (legacyProjection + тесты); `pgBookingRubitimeBridge` — проекция с разбором payload, привязкой branch/specialist/service через mappings.
- API PATCH/DELETE: `rooms/[id]`, `specialists/[id]`, `services/[id]`; `specialist-rooms`.
- UI: флаги услуг, матрица city/room, specialist×room, service×branch; дефолт моста `false`.
- Миграция `0088_booking_engine_settings_and_mapping_repair.sql` (seed settings, repair specialist/service mappings).
- Тесты: `legacyProjection.test.ts`, `pgBookingEngine.createAppointment.test.ts` (атомарность событий).

**Проверки:** `pnpm --filter webapp typecheck`; vitest `booking-engine`, `booking-rubitime-bridge`, `pgBookingEngine.createAppointment`; полный `pnpm run ci`.

**Миграции 0087/0088 (идемпотентность):** backfill специалистов — join по `created_at`, не по одному `full_name`; `ON CONFLICT` для mappings; литералы org — `::uuid`. Если meta в `drizzle.__drizzle_migrations` записана без фактического SQL — повторно выполнить файлы `0087`/`0088` или `db:seed-drizzle-meta` только после ручного apply.

**Намеренно не делали:** write-путь пациента на канон (этап 2); удаление legacy таблиц; двусторонний Rubitime-sync.

**Rollback:** `DROP` таблиц `be_*` (обратный порядок FK); legacy не трогаются. Backfill idempotent.

**Git:** вся инициатива — ветка `initiative/own-booking-engine` (зафиксировано в `MASTER_PLAN.md` §Git-ветка). Этап 1 — первый коммит в ветке.

**Доработка миграций (идемпотентность):** `0087` — маппинг специалистов по `created_at`, `ON CONFLICT` для mappings; `0088` — seed settings (`booking_*` keys), repair mappings; литералы org — `::uuid` в SQL, значение org в JSON — строка (для `readSettingString`).

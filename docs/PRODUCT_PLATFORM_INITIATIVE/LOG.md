# PRODUCT_PLATFORM_INITIATIVE — LOG

## 2026-06-06 — Этап 0: канон терминов

**Сделано:**

- План перенесён в репозиторий: `.cursor/plans/archive/product-platform-roadmap_e6f81831.plan.md`.
- Создана папка инициативы `docs/PRODUCT_PLATFORM_INITIATIVE/` (README, ROADMAP, PHASE_DECOMPOSITION, LOG).
- Зафиксирован канон **access-tier vs product-status**: `docs/ARCHITECTURE/PLATFORM_ACCESS_TIER_VS_PRODUCT_STATUS.md`.
- Декомпозиция этапов 1–4 для агентского исполнения — `PHASE_DECOMPOSITION.md`.

**Проверки:**

```bash
rg "productStatus|product_status|productMode" docs/ARCHITECTURE/PLATFORM_ACCESS_TIER_VS_PRODUCT_STATUS.md docs/PRODUCT_PLATFORM_INITIATIVE
rg "tier.*patient" apps/webapp/src/modules/platform-access --glob "*.ts" | head
```

**Решения:**

- `productStatus` — отдельное поле/модуль, не расширение `ClientAccessTier`.
- Бот-привязка → максимум `lead`; product `patient` — только сопровождение или активная personal doctor-program.
- Этапы 5 (booking hub) и часть channel shell (этап 1) опираются на уже существующий код — см. инвентарь в ROADMAP.

**Не делали:** код, миграции, Mass routes, resolver — этапы 1+.

## 2026-06-06 — Отложено (deferred): guest отменён, mass/patient split on hold

**Решение владельца:**

- Guest/anonymous flow **снимается** с roadmap полностью.
- Mass Mode, Patient Mode split, product_status resolver, отдельная nav по режимам — **на неопределённый срок**.
- Причина: недостаточно контента, продуктов, воронок и платных линий для оправдания архитектурной сложности.
- Инициатива **не удаляется** — архитектурная заготовка; этап 0 docs сохранён.

**Обновлено:**

- `README.md`, `ROADMAP.md` — статус `deferred`.
- Карточка: `docs/TODO_NOT_NOW/product-platform-mass-patient.md`.
- План: todos phase-1…10 → `cancelled`.
- Канон `PLATFORM_ACCESS_TIER_VS_PRODUCT_STATUS.md` — пометка deferred.
- Новый приоритет: `docs/DOCTOR_PATIENT_PWA_SPLIT_INITIATIVE/`.

**Не делали:** откат этапа 0 docs; код не трогали.

# Декомпозиция этапов — Product Platform

Исполнять **по порядку**; следующий этап не стартовать, пока предыдущий не закрыт по чеклисту. Полный CI — только перед merge/push крупного блока (2–4 вместе).

---

## Этап 0 — Канон ✅

| ID | Шаг | Проверка |
|----|-----|----------|
| 0.1 | `PLATFORM_ACCESS_TIER_VS_PRODUCT_STATUS.md` | файл в `docs/ARCHITECTURE/` |
| 0.2 | Инициатива + LOG | `docs/PRODUCT_PLATFORM_INITIATIVE/` |
| 0.3 | План в archive | `.cursor/plans/archive/product-platform-roadmap_e6f81831.plan.md` |

---

## Этап 1 — Channel shell

**Цель:** канал меняется без правок `patient/layout.tsx`.

| ID | Шаг | Файлы / зона |
|----|-----|----------------|
| 1.1 | Инвентарь: что дублируется между tg/max/patient entry | `AppEntryRsc.tsx`, `tg/page.tsx`, `max/page.tsx` |
| 1.2 | Выделить shared **miniapp bootstrap** (cookies, redirect, auth) | `shared/lib/platform*`, новый `channelShell` helper при необходимости |
| 1.3 | Авторизованный → deep link target; неавторизованный → bind/register screen | `AppEntryRsc`, `redirectPolicy` |
| 1.4 | Док: обновить `platform.md` §channel shell | `shared/lib/platform.md` |
| 1.5 | Тесты: entry classification + platform cookies | `appEntryClassification.test.ts`, `platformContext.test.ts` |

**Закрытие:** `rg` не находит копий patient page routes под `app/tg` или `app/max`.

```bash
rg "routeBoundMessengerSurface|bersoncare_messenger_surface" apps/webapp/src
pnpm --filter webapp exec vitest run src/modules/auth/appEntryClassification.test.ts src/middleware/platformContext.test.ts
```

---

## Этап 2 — Guest/Mass Mode

**Цель:** без сессии — полезный экран; персональные мутации закрыты.

| ID | Шаг | Файлы / зона |
|----|-----|----------------|
| 2.1 | **Решение маршрута:** `/app/mass/**` или `/app/public/**` (см. вопросы в README владельца) | `app-layer/routes/paths.ts` |
| 2.2 | Новый layout **без** `patientClientBusinessGate` для mass | новый `layout.tsx` |
| 2.3 | Разрезать `patient/layout.tsx`: только Patient Mode guarded | `app/app/patient/layout.tsx` |
| 2.4 | Mass home MVP: блоки «что беспокоит», разминка, SOS, 3-day CTA | `modules/patient-home`, reuse cards |
| 2.5 | Action gates: register CTA на reminders, booking mutate, chat, programs | shared gate component |
| 2.6 | Smoke: аноним открывает mass home без redirect на login | e2e или vitest route policy |

**Закрытие:**

```bash
rg "redirect\(.*routePaths.root" apps/webapp/src/app/app --glob "**/mass/**"
# guest path не проходит patient/layout
```

---

## Этап 3 — Product-status

| ID | Шаг | Файлы / зона |
|----|-----|----------------|
| 3.1 | ADR: хранение — колонка `platform_users.product_status` vs отдельная таблица | schema decision в LOG |
| 3.2 | Drizzle schema + migration | `db/schema/` |
| 3.3 | `resolveProductMode()` модуль (не в `platform-access/tier`) | `modules/platform-product-status/` |
| 3.4 | Источники: support, active program, purchase (stub), binding → lead | ports + service |
| 3.5 | Backfill script: active support/program → `patient` | `scripts/` one-off |
| 3.6 | Unit matrix tests | `resolveProductMode.test.ts` |

**Закрытие:** UI mode не зависит от ручного «я пациент»; `rg "tier.*patient"` в resolver **не** используется для mode.

---

## Этап 4 — Nav + Home

| ID | Шаг | Файлы / зона |
|----|-----|----------------|
| 4.1 | `MASS_PRIMARY_NAV_ITEMS` отдельно от `PATIENT_PRIMARY_NAV_ITEMS` | `navigation.ts` |
| 4.2 | `MassHome` — отдельный компонент, не if-ветки в `PatientHomeToday` | `app/app/mass/home/` |
| 4.3 | Shell выбирает nav по `productMode` | layout + `PatientBottomNav` / аналог |
| 4.4 | Patient home — без регрессий | existing tests |
| 4.5 | RTL: порядок вкладок mass vs patient | vitest |

**Mass nav (целевой):** Сегодня / SOS / Разминки / Программы / Профиль — booking только CTA.

---

## Этап 5 — Booking hub

| ID | Шаг | Статус |
|----|-----|--------|
| 5.1 | Подтвердить IA: upcoming, history, wizard, help tiles, memberships | mostly **done** (BOOKING_REWORK) |
| 5.2 | Mass: контекстный CTA (после SOS/test), не вкладка nav | pending |
| 5.3 | Бот: короткие карточки + deep link на hub | pending (integrator) |

---

## Этапы 6–10 (крупные блоки — декомпозиция при старте)

### 6 — Уведомления
- 6.1 каталог topic (уже частично есть)
- 6.2 prefs UI единый экран
- 6.3 bot quick actions (mute, until tomorrow)
- 6.4 audit: один intent → N channel deliveries

### 7 — Warmups/SOS
- 7.1 contract metadata (CMS fields)
- 7.2 before/after check-in
- 7.3 5–7 SOS protocols seed
- 7.4 решение: отдельные таблицы vs structured CMS type

### 8 — Access rules
- 8.1 resolver matrix `free|lead_only|subscription|…`
- 8.2 отделить public program / course / personal program
- 8.3 sync `COURSES_INITIATIVE`

### 9 — Монетизация
- 9.1 payment → customer status
- 9.2 paywall UI в app only
- 9.3 refund/expiry без patient mode

### 10 — Deep links + site
- 10.1 канон URL list
- 10.2 fallback installed/PWA/browser/miniapp
- 10.3 SEO pages ≠ cabinet

---

## Когда нужен полный `pnpm run ci`

- После закрытия блока **2–4** (режимы).
- Перед push любого этапа с миграцией БД (этап 3+).

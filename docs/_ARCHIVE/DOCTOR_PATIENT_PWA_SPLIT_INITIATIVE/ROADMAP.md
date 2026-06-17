# Doctor Cabinet — Roadmap

**Статус инициативы:** **done** (волны 1–2, 2026-06-06 … 2026-06-07).

**Patient PWA не трогаем** — см. [`SCOPE_BOUNDARIES.md`](SCOPE_BOUNDARIES.md).

## Две волны

| Волна | Что | Документ | Статус |
|-------|-----|----------|--------|
| **1** | Runtime: guards, CSS, redirects (браузер) | этот файл §ниже | **done** (2026-06-06) |
| **2** | Блок чужих зон + Staff PWA + staff push | [`WAVE2_STAFF_PWA.md`](WAVE2_STAFF_PWA.md) | **done** (§A + §B + §C) |

**Где делать PWA кабинета:** волна **2** этой инициативы + фаза 5 в [`PWA_INITIATIVE/BACKLOG.md`](../PWA_INITIATIVE/BACKLOG.md). Волна 1 PWA пациента уже закрыта; staff install — **новый** контур, не правка patient manifest.

---

## Волна 1 — Runtime (браузер)

### Цель

Guards, layouts, CSS parity, entry staff, тесты redirects. **Без** install/manifest.

### Этапы

| Этап | Содержание | Статус |
|------|------------|--------|
| 0 | Аудит staff routes + матрица ролей | **done** |
| 1 | Хвост CSS: `doctor.css` в `admin/layout` | **done** |
| 2 | Guards & redirects: client↔doctor, entry staff | **done** (код без изменений + тесты) |
| 3 | Тесты cross-role | **done** |
| 4 | Приёмка волны 1 | **done** |

Patient Web Push — [`PWA_INITIATIVE`](../PWA_INITIATIVE/README.md), не волна 1.

---

## Этап 0 — Аудит ✅

Результат: [`INVENTORY_AND_MATRIX.md`](INVENTORY_AND_MATRIX.md).

```bash
rg "requireDoctorAccess|DoctorWorkspaceShell|doctor\.css" apps/webapp/src/app/app
rg "canAccessDoctor|getPostAuthRedirectTarget" apps/webapp/src/modules apps/webapp/src/app-layer
```

---

## Этап 1 — CSS хвост (не «делать doctor.css заново»)

`apps/webapp/src/app/styles/doctor.css` и doctor zone — **закрыты** в [`PATIENT_DOCTOR_UI_SPLIT`](../archive/2026-06-initiatives/PATIENT_DOCTOR_UI_SPLIT_INITIATIVE/README.md).

| ID | Задача | Файл |
|----|--------|------|
| 1.1 | Добавить `import "../../styles/doctor.css"` в admin layout (как settings) | `app/app/admin/layout.tsx` — **done** |
| 1.2 | Визуальный smoke `/app/admin/*` vs `/app/settings` | ручной на стенде ([`ACCEPTANCE_WAVE1.md`](ACCEPTANCE_WAVE1.md) §staff) |
| 1.3 | **Не делать:** переписывать `doctor.css`, route groups, `patient.css` на `/app` | — |

**Иконки админского кабинета** (LOGO_BERSONADMIN) — **волна 2 §B done**: `public/staff-pwa-icon-*`, manifest `/manifest-staff.webmanifest`. Волна 1: patient manifest `pwa-icon-*` без изменений.

**Закрытие:**

```bash
rg "doctor\.css" apps/webapp/src/app/app/admin/layout.tsx
pnpm --filter webapp exec vitest run src/app/app/doctor --passWithNoTests 2>/dev/null || true
```

---

## Этап 2 — Guards & staff entry

| ID | Задача | Проверка |
|----|--------|----------|
| 2.1 | Подтвердить: `client` на `/app/doctor/**` → `/app/patient` | `requireDoctorAccess` |
| 2.2 | Подтвердить: `doctor`/`admin` на `/app/patient/**` → `/app/doctor` | `patient/layout.tsx` (read-only) |
| 2.3 | Entry: сессия doctor на `/app/tg` → `/app/doctor` | `AppEntryRsc` + `redirectPolicy` |
| 2.4 | Документировать исключения: `bind-phone`, maintenance — **без правок patient layout** | INVENTORY § |
| 2.5 | Правки `redirectPolicy` / `AppEntryRsc` — **только** если 2.3 падает; без изменения client `isSafeNext` | unit tests |

**Закрытие:** матрица entry × role в INVENTORY актуальна; нет регрессий `redirectPolicy.test.ts`.

---

## Этап 3 — Тесты (staff-focused)

| ID | Тест | Где |
|----|------|-----|
| 3.1 | Расширить или добавить thin module tests для `requireDoctorAccess` redirect target | `requireRole*.test.ts` |
| 3.2 | Новый файл `e2e/doctor-patient-role-layout-redirects.test.ts` — mock session, assert staff guards **без** импорта patient page graphs в каждом `it` | см. `webapp-tests-lean` rule |
| 3.3 | Spot: client → `POST /api/doctor/clients` → 403 | `api/doctor/clients/route.test.ts` — **done** |

**Не добавлять:** тесты `PwaAppAccessGate`, patient push, manifest.

---

## Этап 4 — Приёмка

- [x] `SCOPE_BOUNDARIES.md` — diff волны 1 не затрагивает patient paths.
- [x] [`ACCEPTANCE_WAVE1.md`](ACCEPTANCE_WAVE1.md) — автоматическая часть; ручной smoke — опционально на стенде.
- [x] [`LOG.md`](LOG.md) обновлён.
- [x] Product Platform — не затронут.

---

## Definition of Done (волна 1)

- [x] Admin layout с `doctor.css` (parity settings).
- [x] Client не открывает doctor shell; doctor/admin не остаются в patient tree (guards + тесты).
- [x] Staff entry: `redirectPolicy` — doctor/admin → `/app/doctor` (unit tests).
- [x] **Ноль** изменений в patient PWA файлах из SCOPE_BOUNDARIES.
- [x] Матрица ролей в [`INVENTORY_AND_MATRIX.md`](INVENTORY_AND_MATRIX.md).

## Не требует DoD волны 1

- Staff PWA / manifest — **волна 2** ([`WAVE2_STAFF_PWA.md`](WAVE2_STAFF_PWA.md)).
- Patient push reconcile, SW, cron.
- Удаление `patient.css` с doctor routes.

---

## Волна 2 — блокировка + Staff PWA (кратко)

| Трек | Статус | Приёмка |
|------|--------|---------|
| **§A** Блок + toast | **done 100%** (2026-06-06) | [`ACCEPTANCE_WAVE2.md`](ACCEPTANCE_WAVE2.md) §A |
| **§B** Staff PWA | **done** (2026-06-07, 2.B0–2.B8) | [`ACCEPTANCE_WAVE2.md`](ACCEPTANCE_WAVE2.md) §B |
| **§C** Staff web push | **done** (2026-06-07, 2.C0–2.C4) | [`ACCEPTANCE_WAVE2.md`](ACCEPTANCE_WAVE2.md) §C |

1. **§A:** cross-zone block + `react-hot-toast` на своём hub (включая browser client через `next=`).
2. **§B:** LOGO_BERSONADMIN, `manifest-staff`, `/app/doctor/install`, навигация, `staffPwaInstallState` — см. [`STAFF_PWA_ADR.md`](STAFF_PWA_ADR.md).
3. **§C:** staff web push, матрица каналов в `/app/settings`, per-staff delivery — см. [`STAFF_PWA_ADR.md`](STAFF_PWA_ADR.md) post-§B.

## Definition of Done (волна 2)

- [x] §A + §B + §C — см. [`WAVE2_STAFF_PWA.md`](WAVE2_STAFF_PWA.md) DoD.
- [x] Vitest fast: **63 tests** (38 §A + 11 §B + 14 §C).
- [x] Patient PWA frozen — без регрессии.

Полный план: [`WAVE2_STAFF_PWA.md`](WAVE2_STAFF_PWA.md). Архив Cursor-плана: [`.cursor/plans/archive/doctor_patient_pwa_split_wave2.plan.md`](../../.cursor/plans/archive/doctor_patient_pwa_split_wave2.plan.md). Журнал: [`LOG.md`](LOG.md).

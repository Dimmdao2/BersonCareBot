# Приёмка — волна 2 (Doctor Cabinet)

**Статус:** §access закрыт в коде 2026-06-06; §staff PWA — волна 2B (`WAVE2_STAFF_PWA.md` §B), не начата.

См. [`WAVE2_STAFF_PWA.md`](WAVE2_STAFF_PWA.md), [`INVENTORY_AND_MATRIX.md`](INVENTORY_AND_MATRIX.md).

---

## §A — Блокировка чужих зон + toast

**Статус:** **done** (этапы 2.A0–2.A5).

### Продуктовые критерии

| # | Критерий | Статус |
|---|----------|--------|
| A1 | Чужой кабинет **не рендерится** | [x] server guard → redirect до shell |
| A2 | Пользователь на **своём hub** (`/app/patient` или `/app/doctor`) | [x] `buildOwnHubUrlWithAccessDeniedToast` |
| A3 | Одноразовый **toast** (`react-hot-toast`), текст «Нет доступа к этому разделу» | [x] `AppAccessDeniedToastEffect` в shells |
| A4 | Query `app_access_denied=1` **убирается** из URL после toast | [x] `router.replace` без параметра |
| A5 | **Нет** `/app/access-denied`, `AccessDeniedScreen`, Dialog «нет доступа» | [x] `rg` — только тестовые строки |
| A6 | Entry `/app`, `/app/tg`, `/app/max` с сессией — **без** toast | [x] `redirectPolicy` не меняли |
| A7 | API cross-role — **401/403 JSON**, без redirect | [x] без изменений |

### Матрица cross-zone (после §A)

| Кто | Куда лезет | Итог |
|-----|------------|------|
| `client` | `/app/doctor/**` | `/app/patient?app_access_denied=1` → toast |
| `client` | `/app/settings/**` | то же |
| `client` | `/app/admin/**` | не доходит (settings guard) или patient hub + toast |
| `doctor` / `admin` | `/app/patient/**` | `/app/doctor?app_access_denied=1` → toast |
| `doctor` (не admin) | `/app/admin/**` | `/app/doctor?app_access_denied=1` → toast |

Точки кода: `requireRole.ts` (`requireDoctorAccess`, `requirePatientAccess`, `getOptionalPatientSession`), `patient/layout.tsx` (role-block), `settings/layout.tsx`, `admin/layout.tsx`.

### Preflight (авто)

- [x] Patient paths из SCOPE_BOUNDARIES: правка **только** `patient/layout.tsx` role-block (без PWA/gate/manifest).
- [x] Vitest wave-2 access: **32 tests** green (см. `WAVE2_STAFF_PWA.md` §Проверки).

### Manual smoke (§access, браузер)

| # | Шаг | Ожидание |
|---|-----|----------|
| 1 | **Client** → `/app/doctor/clients` | `/app/patient` + toast «Нет доступа…»; URL без `app_access_denied` |
| 2 | **Client** → `/app/settings` | то же |
| 3 | **Doctor** → `/app/patient` | `/app/doctor` + toast; URL чистый |
| 4 | **Doctor** → `/app/admin/...` | `/app/doctor` + toast |
| 5 | **Doctor** с сессией → `/app/tg` | `/app/doctor`, **без** toast (нормальный entry) |

### Automated (§access)

- [x] `appAccessDeniedToast.test.ts`
- [x] `AppAccessDeniedToastEffect.test.tsx`
- [x] `requireRole.doctorStaffAccess.test.ts`
- [x] `e2e/doctor-patient-role-layout-redirects.test.ts`
- [x] `api/doctor/clients/route.test.ts` (client → 403)

### Sign-off §access

Трек **2.A** готов к merge: cross-zone block + toast, без forbidden-экранов; patient PWA install/gate/manifest/SW не в diff.

---

## §B — Staff PWA

**Статус:** **planned** (этапы 2.B0–2.B6).

| # | Критерий | Статус |
|---|----------|--------|
| B1 | `manifest-staff`, `start_url: /app/doctor` | [ ] |
| B2 | Иконки LOGO_BERSONADMIN (`staff-pwa-icon-*`) | [ ] |
| B3 | `/app/doctor/install` | [ ] |
| B4 | SW registration для staff | [ ] |
| B5 | Metadata / iOS install copy | [ ] |
| B6 | Smoke manifest + install | [ ] |

Приёмка §B дополняется после закрытия 2.B6; patient manifest/gate — без регрессии.

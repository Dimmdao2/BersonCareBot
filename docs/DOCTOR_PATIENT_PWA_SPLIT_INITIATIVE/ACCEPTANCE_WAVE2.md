# Приёмка — волна 2 (Doctor Cabinet)

**Статус:** волна 2 **done** — §A (2026-06-06) · §B (2026-06-07, 2.B0–2.B8).

См. [`WAVE2_STAFF_PWA.md`](WAVE2_STAFF_PWA.md), [`INVENTORY_AND_MATRIX.md`](INVENTORY_AND_MATRIX.md), [`STAFF_PWA_ADR.md`](STAFF_PWA_ADR.md).

### Sign-off волны 2 (целиком)

- [x] Cross-zone block + toast; patient PWA gate/manifest/SW не в diff.
- [x] Staff PWA: manifest, install, иконки, навигация, install-state marker.
- [x] Vitest fast: **49 tests** green (команда — `WAVE2_STAFF_PWA.md` §Проверки).
- [ ] Ручной smoke install staff PWA на стенде (Chrome/Safari/iOS) — опционально у оператора.

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
| A8 | Browser client: gate → install landing, toast из `next=` | [x] `LandingPwaClientBootstrap` + `AppAccessDeniedToastEffect` |

### Матрица cross-zone (после §A)

| Кто | Куда лезет | Итог |
|-----|------------|------|
| `client` | `/app/doctor/**` | `/app/patient?app_access_denied=1` → toast |
| `client` | `/app/settings/**` | то же |
| `client` | `/app/admin/**` | patient hub + toast (`admin/layout`) |
| `doctor` / `admin` | `/app/patient/**` | `/app/doctor?app_access_denied=1` → toast |
| `doctor` (не admin) | `/app/admin/**` | `/app/doctor?app_access_denied=1` → toast |

Точки кода: `requireRole.ts` (`requireDoctorAccess`, `requirePatientAccess`, `getOptionalPatientSession`), `patient/layout.tsx` (role-block), `settings/layout.tsx`, `admin/layout.tsx`.

### Preflight (авто)

- [x] Patient paths из SCOPE_BOUNDARIES: правка **только** `patient/layout.tsx` role-block (без PWA/gate/manifest).
- [x] Vitest wave-2 access: **38 tests** green (см. `WAVE2_STAFF_PWA.md` §Проверки).

### Manual smoke (§access, браузер)

Покрыто автотестами guards/layouts/effect; ручной прогон на стенде — опционально.

| # | Шаг | Ожидание | Авто |
|---|-----|----------|------|
| 1 | **Client** → `/app/doctor/clients` | patient hub + toast; URL без `app_access_denied` | `requireDoctorAccess` test |
| 2 | **Client** → `/app/settings` | то же | settings layout test |
| 3 | **Client** → `/app/admin` (browser) | install `/?next=…` + toast из `next` | `AppAccessDeniedToastEffect` + `pwaAppAccessPolicy` |
| 4 | **Doctor** → `/app/patient` | doctor hub + toast | patient layout test |
| 5 | **Doctor** → `/app/admin/...` | doctor hub + toast | admin layout test |
| 6 | **Doctor** с сессией → `/app/tg` | `/app/doctor`, без toast | `redirectPolicy.test.ts` |

### Automated (§access)

- [x] `appAccessDeniedToast.test.ts`
- [x] `AppAccessDeniedToastEffect.test.tsx`
- [x] `requireRole.doctorStaffAccess.test.ts`
- [x] `e2e/doctor-patient-role-layout-redirects.test.ts`
- [x] `api/doctor/clients/route.test.ts` (client → 403)
- [x] `pwaAppAccessPolicy.test.ts` (gate preserves `app_access_denied` in `next`)

### Sign-off §access

Трек **2.A** закрыт на 100%: cross-zone block + toast (включая browser client через install landing), без forbidden-экранов; patient PWA gate/manifest/SW не в diff.

---

## §B — Staff PWA

**Статус:** **done** (этапы 2.B0–2.B8).

| # | Критерий | Статус |
|---|----------|--------|
| B1 | `manifest-staff`, `start_url: /app/doctor` | [x] `staffPwaManifest.ts`, route `/manifest-staff.webmanifest` |
| B2 | Иконки LOGO_BERSONADMIN (`staff-pwa-icon-*`) | [x] `public/staff-pwa-icon-192/512.png`, `staff-pwa-apple-touch.png` |
| B3 | `/app/doctor/install` | [x] `doctor/install/page.tsx`, `StaffPwaInstallSection` |
| B4 | SW registration для staff | [x] `StaffPwaBootstrap` в `DoctorWorkspaceShell` (`/sw.js`, scope `/app`) |
| B5 | Metadata / iOS install copy | [x] `staffPwaLayoutMetadata` на doctor/settings/admin layouts |
| B6 | Smoke manifest + install | [x] vitest manifest/route/layouts + smoke `doctor/install` page |
| B7 | Ссылка на install в меню staff | [x] sidebar + mobile Sheet → `/app/doctor/install` |
| B8 | «Готово» без ложного срабатывания patient standalone | [x] `staffPwaInstallState` marker, не `standalone` alone |

### Automated (§B)

- [x] `staffPwaManifest.test.ts`
- [x] `staffPwaInstallState.test.ts`
- [x] `manifest-staff.webmanifest/route.test.ts`
- [x] `StaffPwaInstallSection.test.tsx`
- [x] `e2e/doctor-staff-pwa-install.test.ts`
- [x] `smoke-app-router-rsc-pages-inprocess.test.ts` (`doctor/install`)

### Sign-off §B

Трек **2.B** закрыт: отдельный staff manifest/install/metadata; patient `manifest.ts`, gate, SW push — **не в diff**.

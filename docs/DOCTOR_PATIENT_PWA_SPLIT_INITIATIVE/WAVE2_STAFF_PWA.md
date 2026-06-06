# Волна 2 — Staff PWA + блокировка чужих зон

**Статус:** волна 2 **done 100%** — §A (2.A0–2.A5+, 2026-06-06) · §B (2.B0–2.B8, 2026-06-07). Приёмка: [`ACCEPTANCE_WAVE2.md`](ACCEPTANCE_WAVE2.md).

**Patient PWA (install/gate/manifest/SW)** — поведение **не меняем**. Исключения §A — см. [`SCOPE_BOUNDARIES.md`](SCOPE_BOUNDARIES.md) §«Исключения волны 2»; **`PwaAppAccessGate` не правим** — toast для browser client через `next=` на лендинге `/`.

---

## Продуктовое решение: блок + toast, без экранов

**Сейчас (волна 1):** чужая роль → тихий **редирект** в чужой кабинет без объяснения.

**Цель волны 2 (решение владельца):**

- **Никаких** отдельных страниц «доступ запрещён» — ни общих, ни в doctor/patient.
- **Только** стандартное всплывающее уведомление — в проекте **`react-hot-toast`** (как в booking/cabinet).
- Контент **чужого** кабинета **не рендерится**; пользователь оказывается на **своём** hub, видит toast.

| Кто | Куда лезет | Станет (волна 2) |
|-----|------------|------------------|
| `client` | staff-зона (`/app/doctor`, `/app/settings`, `/app/admin`) | не рендерим staff → свой `/app/patient` + **toast** |
| `doctor` / `admin` | `/app/patient/**` | не рендерим patient → свой `/app/doctor` + **toast** |
| `doctor` (не admin) | `/app/admin/**` | не рендерим admin → свой `/app/doctor` + **toast** |
| Entry `/app`, `/app/tg`, `/app/max` | — | как сейчас — вход в свой hub, **без** toast |
| API | — | 401/403 JSON, без изменений |

**Текст toast (одна строка):** например «Нет доступа к этому разделу» — без подзаголовков и CTA на экране (правило лаконичных строк UI).

**Техника (реализовано):**

1. Server guard/layout → `redirect` на свой hub с `?app_access_denied=1` (`buildOwnHubUrlWithAccessDeniedToast`).
2. Client toast + strip query — `AppAccessDeniedToastEffect` в `PatientAppShell`, `DoctorWorkspaceShell`.
3. Browser client: `PwaAppAccessGate` уводит на `/?next=…#install` с флагом внутри `next` → тот же effect на `LandingPwaClientBootstrap` (без правки gate).
4. **Не** заводить маршрут `/app/access-denied`.

Канон: `shared/lib/appAccessDeniedToast.ts`, `shared/ui/AppAccessDeniedToastEffect.tsx`.

---

## Зачем отдельно от волны 1

1. **Блок + toast** вместо немого cross-app redirect.
2. **Staff PWA** — install, manifest, LOGO_BERSONADMIN.

---

## Целевой UX (Staff PWA)

| | Patient PWA | Staff PWA (волна 2) |
|--|-------------|---------------------|
| Иконка | `pwa-icon-*.png` | LOGO_BERSONADMIN |
| `start_url` | `/app/patient` | `/app/doctor` |
| Install | `/`, `/app/patient/install` | `/app/doctor/install` |
| Чужая зона | toast на своём hub | toast на своём hub |

---

## Этапы волны 2

### A. Блокировка + toast (сначала)

| Этап | Содержание | Файлы |
|------|------------|-------|
| **2.A0** ✅ | Константа query + helper редиректа на свой hub с флагом toast | `shared/lib/appAccessDeniedToast.ts`, `appAccessDeniedToast.test.ts` |
| **2.A1** ✅ | Client: чтение флага в shell, `react-hot-toast`, strip query | `AppAccessDeniedToastEffect`, `PatientAppShell`, `DoctorWorkspaceShell` |
| **2.A2** ✅ | Staff guards: `requireDoctorAccess`, `settings/layout`, `admin/layout` | `requireRole.ts`, staff layouts |
| **2.A3** ✅ | Patient: staff на `/app/patient/**` — тот же паттерн | `patient/layout.tsx` (только role-block) |
| **2.A4** ✅ | Тесты: guards → redirect на свой hub + query; toast helper unit | vitest / e2e |
| **2.A5** ✅ | INVENTORY, ACCEPTANCE_WAVE2 §access | `INVENTORY_AND_MATRIX.md`, `ACCEPTANCE_WAVE2.md`, `SCOPE_BOUNDARIES.md` |
| **2.A5+** ✅ | Доработка по аудиту: `next=` toast, тесты, docs sync | `LandingPwaClientBootstrap`, helpers в `appAccessDeniedToast.ts`, +6 тестов |

**Не делать:** `AccessDeniedScreen`, `/app/access-denied`, Dialog «нет доступа».

### §A — точки enforcement (итог)

| Механизм | Файл |
|----------|------|
| `requireDoctorAccess` | `requireRole.ts` |
| `requirePatientAccess`, `getOptionalPatientSession` | `requireRole.ts` |
| Role-block | `patient/layout.tsx` |
| Settings / admin layout | `settings/layout.tsx`, `admin/layout.tsx` |
| Toast consumer (hub) | `PatientAppShell`, `DoctorWorkspaceShell` |
| Toast consumer (install `next`) | `LandingPwaClientBootstrap` |

### B. Staff PWA (после 2.A2 или параллельно)

| Этап | Содержание |
|------|------------|
| **2.B0** ✅ | ADR: scope manifest, обязательность install | [`STAFF_PWA_ADR.md`](STAFF_PWA_ADR.md) |
| **2.B1** ✅ | `staff-pwa-icon-192/512` (LOGO_BERSONADMIN) | `public/staff-pwa-icon-*`, `staff-pwa-apple-touch.png` |
| **2.B2** ✅ | `manifest-staff` | `staffPwaManifest.ts`, `manifest-staff.webmanifest/route.ts` |
| **2.B3** ✅ | `/app/doctor/install` | `doctor/install/page.tsx`, `StaffPwaInstallSection.tsx` |
| **2.B4** ✅ | SW registration staff | `StaffPwaBootstrap.tsx` → `DoctorWorkspaceShell` |
| **2.B5** ✅ | Metadata install | `staffPwaLayoutMetadata.ts` → doctor/settings/admin layouts |
| **2.B6** ✅ | Smoke + `ACCEPTANCE_WAVE2.md` | vitest manifest/route/layouts + smoke `doctor/install` |
| **2.B7** ✅ | Ссылка на install в меню staff | `DoctorAdminSidebar`, `DoctorHeader` Sheet |
| **2.B8** ✅ | «Готово» без false positive patient standalone | `staffPwaInstallState.ts` (marker, не `standalone` alone) |

### §B — артефакты (итог)

| Область | Файлы |
|---------|--------|
| ADR | [`STAFF_PWA_ADR.md`](STAFF_PWA_ADR.md) |
| Manifest | `staffPwaManifest.ts`, `manifest-staff.webmanifest/route.ts`, `staffPwaLayoutMetadata.ts` |
| Install | `doctor/install/page.tsx`, `StaffPwaInstallSection.tsx`, `staffPwaInstallState.ts` |
| SW | `StaffPwaBootstrap.tsx` → `DoctorWorkspaceShell` |
| Иконки | `public/staff-pwa-icon-192/512.png`, `staff-pwa-apple-touch.png` |
| Навигация | `routePaths.doctorInstall`, sidebar + mobile Sheet |

---

## Решения до кода (2.B0) — закрыто в [`STAFF_PWA_ADR.md`](STAFF_PWA_ADR.md)

1. Scope staff manifest: **`/app`** (покрывает doctor/settings/admin).
2. Два ярлыка на устройстве — **да** (`id` `/app` vs `/app-staff`).
3. Staff push на install — **нет** в §B.
4. iOS — **да**, инструкции на `/app/doctor/install`.

**Блокировка — решено:** только toast, без экранов.

---

## Зависимости

- Волна 1 — **done** (2026-06-06).
- §B — **done** (LOGO_BERSONADMIN, ADR 2.B0, навигация, install-state).
- Фаза 5 PWA_INITIATIVE — **done** (см. [`PWA_INITIATIVE/ROADMAP.md`](../PWA_INITIATIVE/ROADMAP.md)).

---

## Вне scope волны 2

- Subdomain / второй деплой.
- Patient manifest/gate/push/SW.
- Отдельные forbidden-страницы и модалки.

---

## Definition of Done (волна 2)

- [x] §A Чужая зона: контент не показывается; на своём hub — **toast** (`react-hot-toast`).
- [x] §A Нет маршрутов/компонентов access-denied screen.
- [x] §A Entry в свой hub без изменений.
- [x] §B Staff PWA: install, manifest, иконки.
- [x] §A Patient install/manifest/gate — без регрессии (код не трогали).
- [x] `ACCEPTANCE_WAVE2.md` (§access и §B закрыты).

## Проверки

```bash
rg "app_access_denied|appAccessDenied" apps/webapp/src
rg "access-denied|AccessDeniedScreen" apps/webapp/src   # ожидание: 0 новых forbidden-screen
pnpm --filter webapp exec vitest run \
  src/shared/lib/appAccessDeniedToast.test.ts \
  src/shared/ui/AppAccessDeniedToastEffect.test.tsx \
  src/app-layer/guards/requireRole.doctorStaffAccess.test.ts \
  e2e/doctor-patient-role-layout-redirects.test.ts \
  src/app/api/doctor/clients/route.test.ts \
  src/shared/lib/pwa/pwaAppAccessPolicy.test.ts
# 38 tests (волна 2 §A access, 2026-06-06)

# staff PWA (§B)
pnpm --filter webapp exec vitest run \
  src/shared/lib/pwa/staffPwaManifest.test.ts \
  src/shared/lib/pwa/staffPwaInstallState.test.ts \
  src/app/manifest-staff.webmanifest/route.test.ts \
  src/shared/ui/doctor/pwa/StaffPwaInstallSection.test.tsx \
  e2e/doctor-staff-pwa-install.test.ts
# 11 tests §B fast (+ smoke inprocess: doctor/install page)

# волна 2 целиком (§A + §B fast)
pnpm --filter webapp exec vitest run \
  src/shared/lib/appAccessDeniedToast.test.ts \
  src/shared/ui/AppAccessDeniedToastEffect.test.tsx \
  src/app-layer/guards/requireRole.doctorStaffAccess.test.ts \
  e2e/doctor-patient-role-layout-redirects.test.ts \
  src/app/api/doctor/clients/route.test.ts \
  src/shared/lib/pwa/pwaAppAccessPolicy.test.ts \
  src/shared/lib/pwa/staffPwaManifest.test.ts \
  src/shared/lib/pwa/staffPwaInstallState.test.ts \
  src/app/manifest-staff.webmanifest/route.test.ts \
  src/shared/ui/doctor/pwa/StaffPwaInstallSection.test.tsx \
  e2e/doctor-staff-pwa-install.test.ts
# 49 tests — green (2026-06-07)

curl -sS localhost:3000/manifest-staff.webmanifest | jq '.start_url'   # → "/app/doctor" (ручной smoke)
rg "staff-pwa-icon|manifest-staff|doctor/install|staffPwaInstallState" apps/webapp/src apps/webapp/public
```

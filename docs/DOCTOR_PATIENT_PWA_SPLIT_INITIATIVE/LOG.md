# DOCTOR_PATIENT_PWA_SPLIT_INITIATIVE — LOG

## 2026-06-06 — Волна 2 этап 2.A3 (код)

**Сделано:**

- `patient/layout.tsx` — staff (`doctor`/`admin`) → `buildOwnHubUrlWithAccessDeniedToast(role)` вместо `getPostAuthRedirectTarget`.
- Тесты patient layout redirect в `e2e/doctor-patient-role-layout-redirects.test.ts`.

**Проверки:**

```bash
pnpm --filter webapp exec vitest run e2e/doctor-patient-role-layout-redirects.test.ts
# 7 tests — green
```

**Не делали:** `requirePatientAccess` / `getOptionalPatientSession` (2.A4).

## 2026-06-06 — Волна 2 этап 2.A2 (код)

**Сделано:**

- `requireDoctorAccess` — client → `buildOwnHubUrlWithAccessDeniedToast(role)`.
- `settings/layout` — client → patient hub + query (вместо profile).
- `admin/layout` — non-admin → doctor hub + query (вместо settings).
- Тесты guards/layouts обновлены под hub+query.

**Проверки:**

```bash
pnpm --filter webapp exec vitest run \
  src/app-layer/guards/requireRole.doctorStaffAccess.test.ts \
  e2e/doctor-patient-role-layout-redirects.test.ts
```

**Не делали:** `patient/layout.tsx` (2.A3), `requirePatientAccess` / staff→patient (2.A3).

## 2026-06-06 — Волна 2 этап 2.A1 (код)

**Сделано:**

- `AppAccessDeniedToastEffect.tsx` — client: toast + `router.replace` без `app_access_denied`.
- Подключено в `PatientAppShell` и `DoctorWorkspaceShell` (в `Suspense`).
- `AppAccessDeniedToastEffect.test.tsx` — 3 теста.

**Проверки:**

```bash
pnpm --filter webapp exec vitest run \
  src/shared/ui/AppAccessDeniedToastEffect.test.tsx \
  src/shared/lib/appAccessDeniedToast.test.ts \
  src/shared/ui/patient/PatientAppShell.test.tsx
```

**Не делали:** guards/layouts (2.A2–A3) — редиректы пока без query-флага.

## 2026-06-06 — Волна 2 этап 2.A0 (код)

**Сделано:**

- `apps/webapp/src/shared/lib/appAccessDeniedToast.ts` — константы query/toast, `buildOwnHubUrlWithAccessDeniedToast(role)`, парсинг/strip query, `showAppAccessDeniedToastIfFlagged`.
- `apps/webapp/src/shared/lib/appAccessDeniedToast.test.ts` — 5 unit-тестов.

**Проверки:**

```bash
pnpm --filter webapp exec vitest run src/shared/lib/appAccessDeniedToast.test.ts
# 1 file, 5 tests — green
```

**Не делали (следующие этапы):** wiring в guards/layouts (2.A2–A3), shell consumer (2.A1).

## 2026-06-06 — Волна 2: блок + toast, без экранов (уточнение)

**Решение владельца:** не отдельные экраны «нельзя» — **только стандартный toast** (`react-hot-toast`). Чужой кабинет не рендерим; редирект на **свой** hub с одноразовым query → toast в shell.

**Записано в:** [`WAVE2_STAFF_PWA.md`](WAVE2_STAFF_PWA.md) §A. Без `/app/access-denied`, без `AccessDeniedScreen`.

## 2026-06-06 — Волна 2: блокировка чужих зон (план)

**Исходный запрос:** не немой редирект в чужой кабинет. Уточнено → toast-only (см. запись выше).

## 2026-06-06 — Волна 1 закрыта (код)

**Сделано:**

- `admin/layout.tsx` — `import doctor.css` (parity с settings).
- Тесты: `requireRole.doctorStaffAccess.test.ts` (requireDoctorAccess / requirePatientAccess redirects).
- Тесты: `e2e/doctor-patient-role-layout-redirects.test.ts` (settings/admin layouts).
- Тесты: `POST /api/doctor/clients` → 403 для `client` (`route.test.ts`).

**Проверки:**

```bash
pnpm --filter webapp exec vitest run \
  src/app-layer/guards/requireRole.doctorStaffAccess.test.ts \
  src/modules/auth/redirectPolicy.test.ts \
  e2e/doctor-patient-role-layout-redirects.test.ts \
  src/app/api/doctor/clients/route.test.ts
# 4 files, 23 tests — green
rg "doctor\.css" apps/webapp/src/app/app/admin/layout.tsx
# doctor + settings + admin layouts — все три импортируют doctor.css
```

**Scope diff (только файлы волны 1):** `admin/layout.tsx`, три `*.test.ts`, `docs/DOCTOR_PATIENT_PWA_SPLIT_INITIATIVE/**` — без `app/patient/**`, manifest, sw, web-push.

**Этап 2:** guards/entry подтверждены существующим кодом + тестами; `redirectPolicy` / `AppEntryRsc` не менялись.

**Patient PWA:** не трогали (SCOPE_BOUNDARIES).

**Следующее:** волна 2 — [`WAVE2_STAFF_PWA.md`](WAVE2_STAFF_PWA.md).

## 2026-06-06 — Волна 2 Staff PWA в roadmap

**Вопрос:** где делать PWA админского кабинета.

**Ответ:** [`WAVE2_STAFF_PWA.md`](WAVE2_STAFF_PWA.md). Ссылка из `PWA_INITIATIVE/BACKLOG` фаза 5.

## 2026-06-06 — Уточнение scope: Patient PWA не трогаем

**Решение:** только doctor/settings/admin runtime. Patient frozen.

**Обновлено:** SCOPE_BOUNDARIES, INVENTORY, ROADMAP (две волны), ACCEPTANCE_WAVE1.

## 2026-06-06 — Старт волны

**Контекст:** Product Platform deferred.

**Baseline:** PATIENT_DOCTOR_UI_SPLIT закрыт 2026-06-04.

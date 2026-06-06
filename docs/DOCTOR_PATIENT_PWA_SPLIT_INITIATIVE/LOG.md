# DOCTOR_PATIENT_PWA_SPLIT_INITIATIVE — LOG

## 2026-06-07 — Staff web push + матрица уведомлений (post-§B)

**Сделано:**

- API `/api/doctor/web-push/*`; UI `/app/settings` (push + матрица 2 тем).
- Модуль `doctor-notifications`: per-owner задачи, per-staff сообщения (tg/max/push), integrator `sync-user-message`.
- `StaffWebPushBootstrap`, `StaffPwaPushOptIn`, defaults при subscribe.
- Docs: `STAFF_PWA_ADR` post-§B, `README`, `WAVE2`, `ACCEPTANCE_WAVE2` §C, `SCOPE_BOUNDARIES`, `api.md`, `INTEGRATOR_CONTRACT`.
- Тесты: **63** fast (49 + 14 push); fix `StaffPwaInstallSection.test` после push opt-in.

**Проверки:** `pnpm run ci` перед commit.

---

## 2026-06-07 — Синхронизация документации и плана (волна 2 closed)

**Сделано:**

- Единый статус **done** во всех docs инициативы: `README`, `ROADMAP`, `WAVE2_STAFF_PWA`, `ACCEPTANCE_WAVE2`, `INVENTORY`, `SCOPE_BOUNDARIES`, `STAFF_PWA_ADR`.
- `docs/README.md`, `PWA_INITIATIVE/ROADMAP.md` — фаза 5 Staff PWA → **done**.
- `INVENTORY` — таблица Staff PWA §B, тесты 49, дата 2026-06-07.
- `WAVE2` — этапы 2.B7–2.B8, combined vitest command.

**Итог инициативы:** волны 1–2 закрыты; ручной smoke install на стенде — опционально (`ACCEPTANCE_WAVE2`).

---

## 2026-06-07 — Волна 2 §B доведение до 100% (аудит → правки)

**Сделано:**

- `staffPwaInstallState` — marker вместо `standalone` для «готово» (нет false positive patient PWA).
- Навигация: «Установить приложение» в sidebar + mobile Sheet; заголовок в `doctorScreenTitles`.
- `DoctorHeader`: назад с install → `/app/doctor` (не `router.back()`).
- Import order в `settings/admin/layout.tsx`; убран дубль `requireDoctorAccess` на install page.
- Тесты: `StaffPwaInstallSection`, `staffPwaInstallState`, `e2e/doctor-staff-pwa-install`, smoke `doctor/install`.

**Проверки:**

```bash
pnpm --filter webapp exec vitest run \
  src/shared/lib/pwa/staffPwaManifest.test.ts \
  src/shared/lib/pwa/staffPwaInstallState.test.ts \
  src/app/manifest-staff.webmanifest/route.test.ts \
  src/shared/ui/doctor/pwa/StaffPwaInstallSection.test.tsx \
  e2e/doctor-staff-pwa-install.test.ts \
  src/shared/ui/doctorScreenTitles.test.ts
```

---

## 2026-06-07 — Волна 2 §B закрыта (Staff PWA)

**Трек 2.B (B0–B6):** staff manifest, install, иконки — **100%**.

| Артефакт | Статус |
|----------|--------|
| [`STAFF_PWA_ADR.md`](STAFF_PWA_ADR.md) | 2.B0 ADR |
| `public/staff-pwa-icon-*` | LOGO_BERSONADMIN |
| `staffPwaManifest.ts`, `/manifest-staff.webmanifest` | `start_url: /app/doctor`, `id: /app-staff` |
| `/app/doctor/install` | `StaffPwaInstallSection` (iOS copy) |
| `StaffPwaBootstrap` | SW `/sw.js`, scope `/app` |
| `staffPwaLayoutMetadata` | doctor/settings/admin layouts |
| [`ACCEPTANCE_WAVE2.md`](ACCEPTANCE_WAVE2.md) | §B signed off |

**Проверки:**

```bash
pnpm --filter webapp exec vitest run \
  src/shared/lib/pwa/staffPwaManifest.test.ts \
  src/app/manifest-staff.webmanifest/route.test.ts
# 3 tests — green
```

Patient `manifest.ts`, gate, SW push — **не в diff**.

---

## 2026-06-06 — Волна 2 §A закрыта (sign-off)

**Трек 2.A (A0–A5+):** cross-zone block + toast — **100%**.

| Артефакт | Статус |
|----------|--------|
| [`WAVE2_STAFF_PWA.md`](WAVE2_STAFF_PWA.md) | §A + §B done |
| [`ACCEPTANCE_WAVE2.md`](ACCEPTANCE_WAVE2.md) | §A signed off |
| [`INVENTORY_AND_MATRIX.md`](INVENTORY_AND_MATRIX.md) | матрица hub+toast |
| [`SCOPE_BOUNDARIES.md`](SCOPE_BOUNDARIES.md) | исключения §A |

**Следующий шаг (на момент записи):** §B Staff PWA — **закрыто** 2026-06-07.

---

## 2026-06-06 — Волна 2 §A доведение до 100% (аудит → правки)

**Сделано:**

- Toast для browser client: `AppAccessDeniedToastEffect` читает флаг в `next=`; mount на `LandingPwaClientBootstrap`.
- Helpers: `parseReturnToPath`, `searchParamsHasAccessDeniedToastInNext`, `stripAccessDeniedToastFromNextParam`.
- Тест: admin layout client; next-param effect; `pwaAppAccessPolicy` preserves flag in `next`.
- Docs: `SCOPE_BOUNDARIES` (исключения §A), `ACCEPTANCE_WAVE2` (A8, manual→auto), счётчик **38 tests**.

**Проверки:**

```bash
pnpm --filter webapp exec vitest run \
  src/shared/lib/appAccessDeniedToast.test.ts \
  src/shared/ui/AppAccessDeniedToastEffect.test.tsx \
  src/app-layer/guards/requireRole.doctorStaffAccess.test.ts \
  e2e/doctor-patient-role-layout-redirects.test.ts \
  src/app/api/doctor/clients/route.test.ts \
  src/shared/lib/pwa/pwaAppAccessPolicy.test.ts
# 38 tests — green
```

## 2026-06-06 — Волна 2 этап 2.A5 (docs)

**Сделано:**

- `INVENTORY_AND_MATRIX.md` — матрица cross-zone hub+toast, точки enforcement, тесты.
- `ACCEPTANCE_WAVE2.md` — §access (done); §B — закрыто 2026-06-07.
- `WAVE2_STAFF_PWA.md`, `ROADMAP.md` — статус §A closed.

**Примечание:** в плане нет этапа «2.A6»; выполнен **2.A5** по запросу «А6».

## 2026-06-06 — Волна 2 этап 2.A4 (код + тесты)

**Сделано:**

- `requirePatientAccess`, `getOptionalPatientSession` — staff → `buildOwnHubUrlWithAccessDeniedToast(role)`.
- Тесты: `requirePatientAccess`, `getOptionalPatientSession` в `requireRole.doctorStaffAccess.test.ts`.

**Проверки (волна 2 access):**

```bash
pnpm --filter webapp exec vitest run \
  src/shared/lib/appAccessDeniedToast.test.ts \
  src/shared/ui/AppAccessDeniedToastEffect.test.tsx \
  src/app-layer/guards/requireRole.doctorStaffAccess.test.ts \
  e2e/doctor-patient-role-layout-redirects.test.ts \
  src/app/api/doctor/clients/route.test.ts
# 6 files, 26 tests — green (до доведения §A)
rg "access-denied|AccessDeniedScreen" apps/webapp/src  # нет forbidden-screen
```

## 2026-06-06 — Волна 2 этап 2.A3 (код)

**Сделано:**

- `patient/layout.tsx` — staff (`doctor`/`admin`) → `buildOwnHubUrlWithAccessDeniedToast(role)` вместо `getPostAuthRedirectTarget`.
- Тесты patient layout redirect в `e2e/doctor-patient-role-layout-redirects.test.ts`.

**Проверки:**

```bash
pnpm --filter webapp exec vitest run e2e/doctor-patient-role-layout-redirects.test.ts
# 7 tests — green
```


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

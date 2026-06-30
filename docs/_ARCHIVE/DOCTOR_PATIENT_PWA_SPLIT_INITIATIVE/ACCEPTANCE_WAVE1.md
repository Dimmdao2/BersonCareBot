# Приёмка — волна 1 (Doctor Cabinet only)

**Статус:** закрыта в коде 2026-06-06 (автотесты + scope diff). Ручной smoke на стенде — по желанию оператора.

## Preflight

- [x] `git diff` не содержит путей из «Запрещено» в [`SCOPE_BOUNDARIES.md`](SCOPE_BOUNDARIES.md).
- [x] Vitest wave-1: `requireRole.doctorStaffAccess`, `redirectPolicy`, `doctor-patient-role-layout-redirects`, `api/doctor/clients/route` — 23 tests green.

## Staff manual smoke (браузер)

| # | Шаг | Ожидание |
|---|-----|----------|
| 1 | Login as **doctor** → `/app/doctor` | Кабинет, doctor chrome |
| 2 | **Doctor** → `/app/patient` | Redirect `/app/doctor` |
| 3 | **Client** → `/app/doctor/clients` | Redirect `/app/patient` |
| 4 | **Admin** → `/app/settings`, `/app/admin/...` | Shell с doctor.css |
| 5 | **Doctor** с сессией → `/app/tg` | Redirect `/app/doctor` |

## Patient regression (не изменилось)

| # | Шаг | Ожидание |
|---|-----|----------|
| P1 | **Client** standalone PWA → `/app/patient` | Кабинет открывается |
| P2 | **Client** browser → `/app/patient` | Install landing redirect |
| P3 | `/api/patient/web-push/status` | Контракт без изменений |

## Automated

- [x] `requireRole.doctorStaffAccess.test.ts`
- [x] `redirectPolicy.test.ts`
- [x] `e2e/doctor-patient-role-layout-redirects.test.ts`
- [x] `api/doctor/clients/route.test.ts` (client → 403)

## Sign-off

Волна 1 закрыта для merge: staff guards покрыты тестами, `admin` + `doctor.css`, patient paths не в diff.

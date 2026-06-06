# Волна 2 — Staff PWA + блокировка чужих зон

**Статус:** `planned` — волна 1 [закрыта](ROADMAP.md) 2026-06-06; **готова к старту**.

**Patient PWA (install/gate/manifest/SW)** — поведение **не меняем**. Исключение волны 2: **только** политика доступа по роли — см. §блокировка; без правок `PwaAppAccessGate`, `manifest.start_url`, patient push.

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

**Техника (черновик):** server guard → `redirect` на свой hub с одноразовым query, например `?app_access_denied=1` → client в `PatientAppShell` / `DoctorWorkspaceShell` вызывает `toast(...)` и убирает query (`replace` без параметра). **Не** заводить маршрут `/app/access-denied`.

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
| **2.A3** | Patient: staff на `/app/patient/**` — тот же паттерн | `patient/layout.tsx` (только role-block) |
| **2.A4** | Тесты: guards → redirect на свой hub + query; toast helper unit | vitest / e2e |
| **2.A5** | INVENTORY, ACCEPTANCE_WAVE2 §access | docs |

**Не делать:** `AccessDeniedScreen`, `/app/access-denied`, Dialog «нет доступа».

### B. Staff PWA (после 2.A2 или параллельно)

| Этап | Содержание |
|------|------------|
| **2.B0** | ADR: scope manifest, обязательность install |
| **2.B1** | `staff-pwa-icon-192/512` (LOGO_BERSONADMIN) |
| **2.B2** | `manifest-staff` |
| **2.B3** | `/app/doctor/install` |
| **2.B4** | SW registration staff |
| **2.B5** | Metadata install |
| **2.B6** | Smoke + `ACCEPTANCE_WAVE2.md` |

---

## Решения до кода (2.B0)

1. Scope staff manifest: узкий `/app/doctor` + `/app/settings` + `/app/admin` vs `/app`.
2. Два ярлыка на устройстве — ок?
3. Staff push на install — да/нет?
4. iOS — инструкция на `/app/doctor/install`.

**Блокировка — решено:** только toast, без экранов.

---

## Зависимости

- Волна 1; тесты волны 1 на редиректы **обновить** под hub+query в 2.A4.
- LOGO_BERSONADMIN.
- [`PWA_INITIATIVE/BACKLOG.md`](../PWA_INITIATIVE/BACKLOG.md).

---

## Вне scope волны 2

- Subdomain / второй деплой.
- Patient manifest/gate/push/SW.
- Отдельные forbidden-страницы и модалки.

---

## Definition of Done (волна 2)

- [ ] Чужая зона: контент не показывается; на своём hub — **toast** (`react-hot-toast`).
- [ ] Нет маршрутов/компонентов access-denied screen.
- [ ] Entry в свой hub без изменений.
- [ ] Staff PWA: install, manifest, иконки.
- [ ] Patient install/manifest/gate — без регрессии.
- [ ] `ACCEPTANCE_WAVE2.md`.

## Проверки

```bash
rg "app_access_denied|appAccessDenied" apps/webapp/src
rg "access-denied|AccessDeniedScreen" apps/webapp/src   # ожидание: 0 новых
pnpm --filter webapp exec vitest run src/app-layer/guards/requireRole.doctorStaffAccess.test.ts

# staff PWA
curl -sS localhost:3000/manifest-staff.webmanifest | jq '.start_url'
rg "staff-pwa-icon|manifest-staff|doctor/install" apps/webapp/src apps/webapp/public
```

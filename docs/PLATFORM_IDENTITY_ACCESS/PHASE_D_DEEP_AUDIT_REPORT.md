# Фаза D — глубокий поэтапный аудит (отчёт)

**Дата:** 2026-04-11  
**Нормативка:** `MASTER_PLAN.md` §5 D, `SPECIFICATION.md` §4, `PROMPTS_EXEC_AUDIT_FIX_GLOBAL.md` («Фаза D — AUDIT»), `SCENARIOS_AND_CODE_MAP.md` §7/§11.

**Метод:** этапы 0–10 плана deep audit (инвентаризация → policy → layout → REST → actions → RSC-матрица → grep → доки → doctor sanity → тесты → сводка).

---

## Этап 0 — Инвентаризация

| Категория | Количество / перечень |
|-----------|------------------------|
| `page.tsx` под `app/app/patient/**` | 29 файлов (см. дерево репозитория) |
| `layout.tsx` | `app/app/patient/layout.tsx` |
| `route.ts` под `app/api/patient/**` | 18 |
| `route.ts` под `app/api/booking/**` | 6 |
| `route.ts` под `app/api/auth/pin/**` | 3 (set, verify, login) |
| `"use server"` под `app/app/patient/**` | 5 файлов: `profile/actions.ts`, `reminders/actions.ts`, `diary/lfk/actions.ts`, `diary/symptoms/actions.ts`, `notifications/actions.ts` |

**Вне scope фазы D:** `/app/doctor/*`, `/api/admin/*`, `/api/doctor/*` (sanity отдельно), `/api/auth/pin/login` (поток входа без patient session gate — ожидаемо).

---

## Этап 1 — `patientRouteApiPolicy.ts`

| Проверка | Результат |
|----------|-----------|
| Согласованность `PATIENT_PAGE_PREFIXES_WITHOUT_PATIENT_TIER` / `patientPageAllowsGuestOptionalSession` / `patientPathRequiresBoundPhone` / `patientPageMinAccessTier` | Противоречий не найдено: `profile`/`bind-phone`/`help`/`install` не в guest-optional → `onboarding`; пути вне whitelist → `patient`. |
| `patientApiPathIsPatientBusinessSurface` | Покрывает `/api/patient/*`, `/api/booking/*`, `/api/auth/pin/*` кроме `pin/login`. |
| `patientPhonePolicy.ts` | Только re-export из `platform-access`. |
| `platform-access/index.ts` | Re-export без дублирования логики whitelist. |

**P2:** `patientServerActionPageAllowsOnboardingOnly` и `PATIENT_ONBOARDING_SERVER_ACTION_PAGE_PREFIXES` **не используются в runtime** (только тесты и комментарии) — техдолг относительно заявленной «серверной whitelist» для profile actions.

---

## Этап 2 — Middleware и layout

| Проверка | Результат |
|----------|-----------|
| `middleware.ts` для `/app/patient*` | Выставляет `x-bc-pathname`, `x-bc-search`. |
| `layout.tsx` при `DATABASE_URL` | `patientClientBusinessGate` + `patientPathRequiresBoundPhone(pathname)` → редирект bind-phone; `stale_session` → `/app?next=`. |
| Без `DATABASE_URL` | Snapshot `session.user.phone` + те же префиксы через `patientPathRequiresBoundPhone`. |
| Пустой pathname + `need_activation` | Осознанно **нет** редиректа по tier (избегание ложного bind-phone с главной); лог в non-test. Риск см. § «Зазоры». |

**P2 (edge):** при `need_activation` и **пустом** pathname пользователь теоретически может открыть страницу с `patientPathRequiresBoundPhone === true`, если навигация обошла middleware (редко); основная защита — RSC/API gates на конкретных страницах.

---

## Этап 3 — REST handlers

Проверены все 18 + 6 + 2 pin (set/verify):

- Все маршруты `/api/patient/*` и `/api/booking/*` используют **`requirePatientApiBusinessAccess`**.
- `POST /api/auth/pin/set` и `verify` — **`requirePatientApiBusinessAccess`**.
- `POST /api/auth/pin/login` — без patient gate; использует `buildAppDeps` + `findByPhone` для **входа** (не сессия пациента с бизнес-доступом) — **OK**.

**Зазоров не выявлено.**

---

## Этап 4 — Server actions

| Файл | Паттерн | Вердикт |
|------|---------|--------|
| `profile/actions.ts` | `requirePatientAccess` | OK — onboarding/активация (SPEC §4). |
| `reminders/actions.ts` | `requirePatientAccessWithPhone` | OK |
| `diary/lfk/actions.ts` | `requirePatientAccessWithPhone` | OK |
| `diary/symptoms/actions.ts` | `requirePatientAccessWithPhone` | OK |
| `notifications/actions.ts` | `requirePatientAccessWithPhone` | OK |

---

## Этап 5 — Матрица RSC (`page.tsx`)

| Страница | Данные по `userId` / БД | Gate | Вердикт |
|----------|-------------------------|------|---------|
| `page.tsx` (home) | Персональные блоки при `allow` | `patientRscPersonalDataGate` | OK |
| `cabinet/page.tsx` | Записи, intake | `patientRscPersonalDataGate` | OK |
| `diary/page.tsx` | Дневник | `patientRscPersonalDataGate` | OK |
| `diary/lfk/journal`, `diary/symptoms/journal` | Журналы | `patientRscPersonalDataGate` | OK |
| `notifications/page.tsx` | Email/каналы | `patientRscPersonalDataGate` | OK |
| `intake/lfk`, `intake/nutrition` | — | `requirePatientAccessWithPhone` | OK |
| `messages`, `reminders`, `reminders/journal/[ruleId]` | — | `requirePatientAccessWithPhone` | OK |
| `profile/page.tsx` | PIN, email, каналы | `requirePatientAccess` | OK (активация) |
| `bind-phone/page.tsx` | Нет БД по профилю | `requirePatientAccess` | OK |
| `help`, `install` | Нет БД по userId | `requirePatientAccess` | OK |
| `content/[slug]/page.tsx` | Каталог по slug (не персонально) | optional session | OK |
| `address/page.tsx` | Только iframe | optional session | OK |
| `booking/new/*`, `booking/page.tsx` | Нет загрузки персональных данных по userId на RSC | optional + redirect | OK |
| `lessons`, `emergency`, `diary/lfk`, `diary/symptoms` | Редиректы | — | OK |
| **`sections/[slug]/page.tsx`** | При `slug === "warmups"` и сессии: **`listRulesByUser`** после **`patientRscPersonalDataGate`** | `patientRscPersonalDataGate` | OK (**D-FIX 2026-04-11**) |
| `purchases/page.tsx` | `getPurchaseSectionState()` без userId (stub); полный контент при tier **patient** | `patientRscPersonalDataGate` + `PurchasesGuestAccess` (`rscGuestTier`) | OK (**D-FIX 2026-04-11**) |

---

## Этап 6 — Остатки `phone` / guards

| Находка | Классификация |
|---------|---------------|
| `layout.tsx` — `session.user.phone` без БД | Допустимо: fallback без `DATABASE_URL`. |
| `purchases/page.tsx` — `patientHasPhoneOrMessenger` | **Закрыто D-FIX 2026-04-11:** `patientRscPersonalDataGate` + `PurchasesGuestAccess` с `rscGuestTier`. |
| `profile/*`, `notifications/actions` — передача `phone` в каналы | UI/контекст, не gate. |
| `requirePatientPhone` в `requireRole.ts` | **Закрыто D-FIX 2026-04-11:** экспорт удалён. |

Иных **параллельных** guard-файлов с дублированием tier-логики не найдено.

---

## Этап 7 — SPEC §4 и документация

- **SPEC §4** (включая абзац RSC) согласован с доминирующим паттерном; **`sections/[slug]` warmups** — **исправлено D-FIX 2026-04-11** (`patientRscPersonalDataGate` перед `listRulesByUser`).
- **`guards.md`** — отражает `patientRscPersonalDataGate`.
- **`SCENARIOS_AND_CODE_MAP.md` §7** — дополнен примером `sections/warmups` и покупок (**D-FIX 2026-04-11**).

---

## Этап 8 — Doctor / admin

- В **`app/api/doctor/**`** нет импортов `requirePatientApiBusinessAccess` / `patientClientBusinessGate` — **OK** (отдельная модель доступа).
- Риск «обхода врача через patient gate» — не обнаружен.

---

## Этап 9 — Тесты

| Область | Покрытие |
|---------|----------|
| `patientRouteApiPolicy.test.ts` | Префиксы pathname/API, `resolvePatientLayoutPathname`. |
| `requireRole.patientTier.test.ts` | API gate + tier. |
| `requireRole.patientRscGate.test.ts` | `patientRscPersonalDataGate` (guest/allow/stale). |
| Booking / patient API | Негативы 403/401 в существующих тестах. |

**~~Пробел D-TST-1~~** — закрыт: `page.warmupsGate.test.tsx` (**фаза E — FIX**).

---

## Этап 10 — Сводка P0 / P1 / P2 и вердикт

| Приоритет | ID | Описание | Файл / символ |
|-------------|-----|----------|----------------|
| ~~**P1**~~ | D-RSC-1 | ~~RSC warmups без gate~~ | **Закрыто D-FIX 2026-04-11** |
| ~~**P2**~~ | D-PUR-1 | ~~Покупки по snapshot~~ | **Закрыто D-FIX 2026-04-11** |
| **P2** | D-SA-1 | ~~не enforced~~ → **закрыто** (E-REAUDIT): `patientOnboardingServerActionSurfaceOk` + `profile/actions.ts` | `onboardingServerActionSurface.ts` |
| ~~**P2**~~ | D-CLN-1 | ~~`requirePatientPhone`~~ | **Закрыто D-FIX 2026-04-11** |
| ~~**P2**~~ | D-TST-1 | ~~нет теста warmups~~ | **Закрыто E-FIX:** `page.warmupsGate.test.tsx` |

**P0:** не выявлено.

### Вердикт

**Вердикт после D-FIX 2026-04-11:** P1 и перечисленные P2 (D-PUR-1, D-CLN-1) закрыты. **D-SA-1** закрыт в **фазе E — повторный аудит** (`patientOnboardingServerActionSurfaceOk`, см. [`PHASE_E_REAUDIT_REPORT.md`](PHASE_E_REAUDIT_REPORT.md)). **D-TST-1** закрыт в **фазе E — FIX** (`page.warmupsGate.test.tsx`). Для регрессии — `pnpm run ci` и при изменениях policy короткий проход этапов 5–6.

**Следующий шаг:** фаза **E** завершена по D-хвостам (**D-TST-1**, **D-SA-1**); см. [`PHASE_E_REAUDIT_REPORT.md`](PHASE_E_REAUDIT_REPORT.md). Промпты: `PROMPTS_EXEC_AUDIT_FIX_GLOBAL.md`.

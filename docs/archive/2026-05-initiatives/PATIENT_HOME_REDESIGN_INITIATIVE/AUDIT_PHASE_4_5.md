# AUDIT_PHASE_4_5

## 1. Verdict: PASS

Phase 4.5 соответствует ТЗ инициативы ([README §6 Phase 4.5](README.md)) и проверенным пунктам ниже:

- **Точный `/app/patient` без сессии:** в [`apps/webapp/src/app/app/patient/layout.tsx`](apps/webapp/src/app/app/patient/layout.tsx) при `!session` и [`patientLayoutAllowsUnauthenticatedAccess(pathname)`](apps/webapp/src/modules/platform-access/patientRouteApiPolicy.ts) рендерится `PatientClientLayout` без `redirect`. В [`page.tsx`](apps/webapp/src/app/app/patient/page.tsx) при `!session` нет `redirect`, рендерится non-personal главная.
- **Внутренние `/app/patient/...` без сессии:** если `patientLayoutAllowsUnauthenticatedAccess` ложно (любой путь кроме нормализованного `"/app/patient"`), layout выполняет `redirect(\`${routePaths.root}?next=...\`)` с `returnTo = pathname + search` (или fallback на `routePaths.patient`).
- **Персональные данные без сессии:** [`PatientHomeToday.tsx`](apps/webapp/src/app/app/patient/home/PatientHomeToday.tsx) — `listRulesByUser` / `listForPatient` только при `personalTierOk && session`; `personalizedName` только при `personalTierOk && session`. Анонимная главная: [`AppShell`](apps/webapp/src/app/app/patient/page.tsx) с `user={null}`, `patientHideRightIcons`, `patientHideHome` — нет опроса [`useReminderUnreadCount`](apps/webapp/src/modules/reminders/hooks/useReminderUnreadCount.ts) из шапки.
- **`session === null`:** тип `AppSession | null`, ветка `anonymousGuest`, маппинг drilldown и media в [`patientHomeGuestNav.ts`](apps/webapp/src/app/app/patient/home/patientHomeGuestNav.ts).
- **Media:** публичная отдача через API не расширялась; для анонима в UI обнуляются превью с префиксом `/api/media/` ([`stripApiMediaForAnonymousGuest`](apps/webapp/src/app/app/patient/home/patientHomeGuestNav.ts), использование в `PatientHomeToday`).
- **Whole-home тесты:** три сценария в [`PatientHomeToday.test.tsx`](apps/webapp/src/app/app/patient/home/PatientHomeToday.test.tsx) (anonymous / authorized без tier / patient).

## 2. Mandatory fixes

None.

## 3. Minor notes

1. **Пустой `pathname` без сессии:** `patientLayoutAllowsUnauthenticatedAccess("")` → `false`; пользователь уходит на логин с `next`, а не на публичную главную. Это сознательная защита при отсутствии `x-bc-pathname` / подходящего referer (см. JSDoc в policy).

2. **`need_activation` (OAuth без доверенного телефона):** [`patientPathsAllowedDuringPhoneActivation`](apps/webapp/src/modules/platform-access/patientRouteApiPolicy.ts) по-прежнему **не** включает `/app/patient` — при наличии сессии и gate `need_activation` главная пациента ведёт на bind-phone. Аноним без сессии главную видит; залогиненный без активации телефона — нет. Это продуктовое расхождение до Phase 4.5; в рамках 4.5 не менялось намеренно.

3. **Ручной E2E в браузере** в этом аудите не выполнялся; границы маршрутов подтверждены кодом + unit/integration тестами policy и RTL главной.

## 4. Tests reviewed/run

### Reviewed (Phase 4.5 и смежная policy)

- [`apps/webapp/src/modules/platform-access/patientRouteApiPolicy.test.ts`](apps/webapp/src/modules/platform-access/patientRouteApiPolicy.test.ts) — в т.ч. `patientLayoutAllowsUnauthenticatedAccess` (exact home, trailing slash, отрицательные внутренние пути).
- [`apps/webapp/src/app/app/patient/home/patientHomeGuestNav.test.ts`](apps/webapp/src/app/app/patient/home/patientHomeGuestNav.test.ts)
- [`apps/webapp/src/app/app/patient/home/PatientHomeToday.test.tsx`](apps/webapp/src/app/app/patient/home/PatientHomeToday.test.tsx)
- [`apps/webapp/src/app/app/patient/home/PatientHomeBookingCard.test.tsx`](apps/webapp/src/app/app/patient/home/PatientHomeBookingCard.test.tsx)

### Executed during audit

Command:

`pnpm --dir apps/webapp exec vitest run src/modules/platform-access/patientRouteApiPolicy.test.ts src/app/app/patient/home/patientHomeGuestNav.test.ts src/app/app/patient/home/PatientHomeToday.test.tsx src/app/app/patient/home/PatientHomeBookingCard.test.tsx`

Result:

- `Test Files 4 passed (4)`
- `Tests 29 passed (29)`

## 5. Explicit security/auth boundary confirmation

| Граница | Подтверждение |
|--------|----------------|
| Единственная публичная точка layout без сессии | `normalizeAppPatientPath(pathname) === "/app/patient"` в [`patientLayoutAllowsUnauthenticatedAccess`](apps/webapp/src/modules/platform-access/patientRouteApiPolicy.ts). |
| Вложенные маршруты без сессии | Редирект на [`routePaths.root`](apps/webapp/src/app-layer/routes/paths.ts) с `next` в [`layout.tsx`](apps/webapp/src/app/app/patient/layout.tsx). |
| Персональные порты БД на RSC главной | Только при `personalTierOk && session` в [`PatientHomeToday.tsx`](apps/webapp/src/app/app/patient/home/PatientHomeToday.tsx). |
| Auth-on-drilldown | Внутренние цели оборачиваются в `appLoginWithNextHref` для `anonymousGuest` (карточки + маппинг списков в `PatientHomeToday`). |
| Cookies / session model | Не менялись (нет правок `modules/auth/*` и cookie-логики в Phase 4.5). |
| `GET /api/media/:id` | Нет изменений в `app/api/media` в рамках этой фазы; аноним не получает новых прав на ассеты — только деградация превью на главной для URL с префиксом `/api/media/`. |

## 6. No slug hardcode confirmation

Проверка по `apps/webapp/src` на редакционные slug из [`CONTENT_PLAN.md`](CONTENT_PLAN.md) (выборочно: `office-work`, `office-neck`, `standing-work`, `young-mom`, `breathing-gymnastics`, `antistress-sleep`, `face-self-massage`, `posture-exercises`, `longevity-gymnastics`, `home-gym`, `back-pain-rehab`, `neck-headache-rehab`, `breathing-foundation`, `healthy-feet-knees`, `diastasis-pelvic-floor`, `healthy-shoulders`, `beautiful-posture`, `eye-relax`, `balance-day`, `tight-shoulders`, `strong-feet`, `breathing-after-covid`, `deep-relax`):

- **Совпадений нет.**

Тесты Phase 4.5 используют только нейтральные fixture-slug (`fixture-warmup-page`, `fixture-section-a`), не строки из таблиц CONTENT_PLAN.

---

**Вывод:** Phase 4.5 проходит аудит. Обязательных исправлений нет.

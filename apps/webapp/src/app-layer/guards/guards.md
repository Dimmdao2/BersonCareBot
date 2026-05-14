# guards

Проверки доступа по сессии и роли.

- **requireSession** — требует авторизованную сессию; иначе редирект на вход. Для страниц и действий, доступных любой роли (например настройки).
- **requirePatientAccess** — требует сессию с ролью пациента; иначе редирект. Для страниц раздела пациента.
- **requireDoctorAccess** — требует сессию с ролью врача или админа; иначе редирект. Для страницы врача.
- **requirePatientAccessWithPhone** — `requirePatientAccess` + для `client` проверка **tier patient** из БД (`patientClientBusinessGate` → `resolvePlatformAccessContext`); без `DATABASE_URL` — fallback на телефон в сессии (тесты). Точечный редирект «только по телефону в сессии» не используется — см. этот gate и **`patientRscPersonalDataGate`** для RSC.
- **requirePatientApiBusinessAccess** — для Route Handlers: тот же критерий, что у `requirePatientAccessWithPhone`; 401 / 403 с `error: patient_activation_required` и `redirectTo` (bind-phone) при onboarding / без доверенного телефона у канона. **`requirePatientApiSessionWithPhone`** — алиас (устаревшее имя).
- **patientClientBusinessGate** (`modules/platform-access/patientClientBusinessGate.ts`) — единая реализация критерия tier/телефон для guards и API (в т.ч. `/api/booking/*`). При **`DATABASE_URL` и ошибке БД** в `resolvePlatformAccessContext` — **fail-safe** `need_activation` для `client` (не поднимать доступ по snapshot-сессии при неизвестном tier).
- **Route & API policy (фаза D):** `modules/platform-access/patientRouteApiPolicy.ts` (re-export `@/modules/platform-access`) — whitelist guest / onboarding / patient для страниц `/app/patient/*`, `patientApiPathIsPatientBusinessSurface` для `/api/patient/*` и `/api/booking/*`, `patientSessionSnapshotHasPhone` для UI-snapshot (не для бизнес-gate). Устаревший shim: `app-layer/guards/patientPhonePolicy.ts` реэкспортирует `resolvePatientLayoutPathname` и `patientPathRequiresBoundPhone`.
- **patientPathRequiresBoundPhone** + **middleware** (`x-bc-pathname` / `x-bc-search`) + **`app/app/patient/layout.tsx`** — для `client` при `DATABASE_URL` редирект согласован с **tier** (`patientClientBusinessGate`); без БД — snapshot `session.user.phone` + тот же список путей из политики. Вне whitelist навигации — только при бизнес-доступе (напоминания, сообщения, intake и т.д.).
- **getOptionalPatientSession** — возвращает сессию или null; редирект только при роли не-пациент. Для страниц с `patientPageMinAccessTier` = **guest** (меню, кабинет, визард записи, дневник как просмотр, …).
- **patientRscPersonalDataGate** — RSC перед чтением персональных данных из БД по `userId`: тот же **`patientClientBusinessGate`**, что у API; `guest` / `allow`; при `stale_session` — редирект на `/app?next=`.

**Согласование RSC и политики:** страницы с **`getOptionalPatientSession`** должны попадать под tier **guest** в `patientPageMinAccessTier`; профиль / bind-phone / help / install — **onboarding** (`requirePatientAccess`); напоминания, сообщения, intake — **patient** (`requirePatientAccessWithPhone`). Мутации — API/actions с **`requirePatientApiBusinessAccess`** / **`requirePatientAccessWithPhone`**. Там, где после optional session идут запросы в БД (кабинет, дневник, уведомления, главная и т.д.) — **`patientRscPersonalDataGate`**.

Используются в серверных компонентах и серверных действиях (actions).

## Защита в глубину (пациент + телефон)

- **Сервер:** `patientRouteApiPolicy` (`patientPathRequiresBoundPhone`, `resolvePatientLayoutPathname`) + редирект в `app/app/patient/layout.tsx` (заголовки `x-bc-pathname` / `x-bc-search` из `proxy.ts`; если `x-bc-pathname` пуст — fallback по `Referer`). RSC с персональными данными из БД — **`patientRscPersonalDataGate`**.
- **API:** чувствительные Route Handlers под `/api/patient/*` и **`/api/booking/*`** (операции от имени пациента) обязаны вызывать **`requirePatientApiBusinessAccess`** (или алиас `requirePatientApiSessionWithPhone`); иначе обход UI возможен через `fetch`.
- **Server actions:** чувствительные действия — **`requirePatientAccessWithPhone`**. Onboarding-мутации профиля (`profile/actions.ts`) — дополнительно **`patientOnboardingServerActionSurfaceOk`** (`modules/platform-access/onboardingServerActionSurface.ts`): pathname из `x-bc-pathname` / referer должен попадать в whitelist `patientServerActionPageAllowsOnboardingOnly` (закрытие **D-SA-1**).
- **Клиент (Mini App):** восстановление cookie при 401 — **`miniAppSessionRecovery.ensureMessengerMiniAppWebappSession`**; состояние гейта контакта и ссылки на ботов — **`patientMessengerContactGate`** (`getPatientMessengerContactGateDetail`, `resolveMessengerContactGateBotHref`, `resolveBotHrefAfterMessengerSessionLoss`); UI — **`PatientSharePhoneViaBotPanel`** + оркестраторы `MiniAppShareContactGate`, `PatientBindPhoneClient`.

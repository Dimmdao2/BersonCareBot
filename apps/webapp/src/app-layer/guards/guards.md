# guards

Проверки доступа по сессии и роли.

- **requireSession** — требует авторизованную сессию; иначе редирект на вход. Для страниц и действий, доступных любой роли (например настройки).
- **requirePatientAccess** — требует сессию с ролью пациента; иначе редирект. Для страниц раздела пациента.
- **requireDoctorAccess** — требует сессию с ролью врача или админа; иначе редирект. Для страницы врача.
- **requirePatientPhone** — устаревшая точечная проверка телефона в сессии; для бизнес-действий — **tier patient** через `requirePatientAccessWithPhone` / **`requirePatientApiBusinessAccess`** (`requirePatientApiSessionWithPhone` — алиас в `requireRole.ts`).
- **requirePatientAccessWithPhone** — `requirePatientAccess` + для `client` проверка **tier patient** из БД (`patientClientBusinessGate` → `resolvePlatformAccessContext`); без `DATABASE_URL` — fallback на телефон в сессии (тесты).
- **requirePatientApiBusinessAccess** — для Route Handlers: тот же критерий, что у `requirePatientAccessWithPhone`; 401 / 403 с `error: patient_activation_required` и `redirectTo` (bind-phone) при onboarding / без доверенного телефона у канона. **`requirePatientApiSessionWithPhone`** — алиас (устаревшее имя).
- **patientClientBusinessGate** (`modules/platform-access/patientClientBusinessGate.ts`) — единая реализация критерия tier/телефон для guards и API (в т.ч. `/api/booking/*`).
- **patientPathRequiresBoundPhone** (`patientPhonePolicy.ts`) + **middleware** (`x-bc-pathname` / `x-bc-search`) + **`app/app/patient/layout.tsx`** — для `client` при `DATABASE_URL` редирект согласован с **tier** (`patientClientBusinessGate`); без БД — прежняя логика по snapshot `session.user.phone` + allowlist. Кабинет, дневник, напоминания, запись, покупки и т.д. вне allowlist — только при бизнес-доступе пациента.
- **getOptionalPatientSession** — возвращает сессию или null; редирект только при роли не-пациент. Для главного меню пациента, скорой помощи, уроков, контента — разрешён просмотр без входа (гость).

**До фазы D:** часть RSC (кабинет, дневник, покупки, визард записи) комбинирует **`getOptionalPatientSession`** + **`patientHasPhoneOrMessenger`** с гостевым UI; разграничение по tier для маршрутов вне allowlist — в **`patient/layout.tsx`**; мутации — через API с **`requirePatientApiBusinessAccess`**. Профиль (`/app/patient/profile`) — **`requirePatientAccess`** по продуктовому allowlist, не **`requirePatientAccessWithPhone`**.

Используются в серверных компонентах и серверных действиях (actions).

## Защита в глубину (пациент + телефон)

- **Сервер:** политика путей `patientPhonePolicy` + редирект в `app/app/patient/layout.tsx` (нужны заголовки `x-bc-pathname` / `x-bc-search` из `middleware.ts`; если `x-bc-pathname` пуст — fallback по `Referer` через `resolvePatientLayoutPathname`).
- **API:** чувствительные Route Handlers под `/api/patient/*` и **`/api/booking/*`** (операции от имени пациента) обязаны вызывать **`requirePatientApiBusinessAccess`** (или алиас `requirePatientApiSessionWithPhone`); иначе обход UI возможен через `fetch`.
- **Server actions:** чувствительные действия — **`requirePatientAccessWithPhone`**.
- **Клиент (Mini App):** восстановление cookie при 401 — **`miniAppSessionRecovery.ensureMessengerMiniAppWebappSession`**; состояние гейта контакта и ссылки на ботов — **`patientMessengerContactGate`** (`getPatientMessengerContactGateDetail`, `resolveMessengerContactGateBotHref`, `resolveBotHrefAfterMessengerSessionLoss`); UI — **`PatientSharePhoneViaBotPanel`** + оркестраторы `MiniAppShareContactGate`, `PatientBindPhoneClient`.

# guards

Проверки доступа по сессии и роли.

- **requireSession** — требует авторизованную сессию; иначе редирект на вход. Для страниц и действий, доступных любой роли (например настройки).
- **requirePatientAccess** — требует сессию с ролью пациента; иначе редирект. Для страниц раздела пациента.
- **requireDoctorAccess** — требует сессию с ролью врача или админа; иначе редирект. Для страницы врача.
- **requirePatientPhone** — редирект на `/app/patient/bind-phone?next=...`, если у пациента нет нормализованного телефона в webapp (только телефон; мессенджер без телефона не считается).
- **requirePatientAccessWithPhone** — `requirePatientAccess` + `requirePatientPhone` (server actions с побочными эффектами).
- **requirePatientApiSessionWithPhone** — для Route Handlers: 401/403 JSON без `redirect` (поле `phone_required` + `redirectTo`).
- **patientPathRequiresBoundPhone** (`patientPhonePolicy.ts`) + **middleware** (`x-bc-pathname` / `x-bc-search`) + **`app/app/patient/layout.tsx`** — пациент с сессией без телефона не открывает разделы вне allowlist (главное меню, bind-phone, профиль, sections/, content/, help, install, address, lessons-редирект). Кабинет, дневник, напоминания, запись, покупки и т.д. — только с телефоном.
- **getOptionalPatientSession** — возвращает сессию или null; редирект только при роли не-пациент. Для главного меню пациента, скорой помощи, уроков, контента — разрешён просмотр без входа (гость).

Используются в серверных компонентах и серверных действиях (actions).

## Защита в глубину (пациент + телефон)

- **Сервер:** политика путей `patientPhonePolicy` + редирект в `app/app/patient/layout.tsx` (нужны заголовки `x-bc-pathname` / `x-bc-search` из `middleware.ts`; пустой pathname в layout → редирект по телефону не срабатывает — осознанный компромисс).
- **API:** каждый чувствительный Route Handler под `/api/patient/*` обязан вызывать **`requirePatientApiSessionWithPhone`** (или эквивалент); иначе обход UI возможен через `fetch`.
- **Server actions:** чувствительные действия — **`requirePatientAccessWithPhone`**.
- **Клиент (Mini App):** восстановление cookie при 401 — **`miniAppSessionRecovery.ensureMessengerMiniAppWebappSession`**; состояние гейта контакта и ссылки на ботов — **`patientMessengerContactGate`** (`getPatientMessengerContactGateDetail`, `resolveMessengerContactGateBotHref`, `resolveBotHrefAfterMessengerSessionLoss`); UI — **`PatientSharePhoneViaBotPanel`** + оркестраторы `MiniAppShareContactGate`, `PatientBindPhoneClient`.

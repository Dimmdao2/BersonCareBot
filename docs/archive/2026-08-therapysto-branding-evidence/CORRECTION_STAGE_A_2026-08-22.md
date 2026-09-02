# Коррекция этапа A по вердикту аудита FAIL — 2026-08-22

База: `d37390274` (аудит FAIL). Клон: `/home/dev/dev-projects/bcb-wt-therapysto-stage-a-20260822`,
ветка `wt/therapysto-stage-a-20260822`. Бриф: коррекция трёх достижимых нарушений (`F1`, `F2`, `F3`)
из `AUDIT_STAGE_A_2026-08-22.md` + `X4` (`.env.example`).

Это не финальный аудит этапа `A` — `A3` (полная инвентаризация всего репозитория с заменой) и `A4`
(активные owner/contract/runbook доки целиком) в мой бриф не входили и в этом документе не закрываются.
Чек-лист `IMPLEMENTATION_PLAN.md` не трогал — приёмка этапа целиком не моё решение.

## X1 — `F1`: staff-логины показывали Therapygo — ИСПРАВЛЕНО

Причина (подтверждена аудитом): `app/app/(role-login)/**` не имеет layout, наследует корневой
`app/layout.tsx`, который теперь патиентский.

Правка — тем же seam'ом, что уже используют `doctor`/`admin`/`settings` layouts
(`staffPwaLayoutMetadata`), третьего места не заводил:

- `apps/webapp/src/app/app/(role-login)/doctor/login/page.tsx`,
  `apps/webapp/src/app/app/(role-login)/admin/login/page.tsx` — добавлен
  `export const metadata: Metadata = staffPwaLayoutMetadata;` (тот же объект, что и в
  `doctor/layout.tsx`/`admin/layout.tsx`). Закрывает `<title>` и
  `apple-mobile-web-app-title`.
- `apps/webapp/src/app/app/AppEntryRsc.tsx` — видимая брендовая строка шапки
  (`<PatientAppShell title=…>`) была захардкожена в `PATIENT_DEFAULT_SURFACE.name` для ВСЕХ входов
  (patient/doctor/admin/tg/max). Теперь зависит от `roleLoginPortal`: `doctor`/`admin` →
  `STAFF_SURFACE.name`, иначе (patient, `/app`, `/app/tg`, `/app/max`) → `PATIENT_DEFAULT_SURFACE.name`.

Побочный эффект (не отдельная правка, пришёл вместе с переиспользованием `staffPwaLayoutMetadata`):
`/app/doctor/login` и `/app/admin/login` теперь линкуют `manifest-staff.webmanifest`, а не пациентский
манифест — закрывает смежный факт из `F1` («специалист установит Therapygo»), который аудит явно
пометил как НЕ регрессию и не требовал чинить. Побочный, не отдельная машинерия.

**Живая проверка (dev-сервер этого клона, порт 5301, без правок env):**

```
curl -s http://127.0.0.1:5301/app/doctor/login | grep -o "<title>[^<]*</title>"
→ <title>Therapysto</title>
curl -s http://127.0.0.1:5301/app/admin/login  | grep -o "<title>[^<]*</title>"
→ <title>Therapysto</title>
curl -s http://127.0.0.1:5301/app/doctor/login | grep -o 'title="[^"]*">Therapysto<'
→ title="Therapysto">Therapysto<        (шапка + apple-mobile-web-app-title тоже Therapysto)
curl -s http://127.0.0.1:5301/app/patient/login | grep -o "<title>[^<]*</title>"
→ <title>Therapygo</title>              (пациентский вход НЕ тронут)
```

## X2 — `F2`: env-override не долетал до клиентских компонентов — ИСПРАВЛЕНО

Причина: 9 `'use client'` компонентов читали литерал `PATIENT_DEFAULT_SURFACE_NAME` напрямую
(env-override невозможен — литерал вшит в JS-бандл на этапе сборки).

Choke point: `@/shared/ui/PlatformProvider` — единственный провайдер, уже смонтированный один раз в
`RootLayout` (`app/layout.tsx`) для всего дерева. Расширен, не продублирован:

- `PlatformProvider.tsx` — добавлен prop `patientSurfaceName: string`, новый
  `PatientSurfaceNameContext` (fallback-дефолт — литерал, только для деревьев без провайдера, в
  реальном рендере не используется) и хук `usePatientSurfaceName()`.
- `app/layout.tsx` — `<PlatformProvider serverHint={…} patientSurfaceName={PATIENT_DEFAULT_SURFACE.name}>`.
  Значение резолвится один раз на сервере (env-override уже применён `config/productSurfaces.ts`) и
  плывёт вниз обычным React-контекстом — второго способа задать имя не заведено (`TPB-16`).
- 7 клиентских компонентов переведены с прямого импорта литерала на `usePatientSurfaceName()`:
  `PatientTopNav.tsx`, `ContactSupportPageClient.tsx`, `BookingDoneClient.tsx`,
  `CabinetActiveBookings.tsx`, `PasskeySection.tsx`, `AuthBootstrap.tsx`, `PwaInstallSection.tsx`.
- `buildCalendarLinks.ts` — не компонент (обычная функция, вызывается и из
  `sendBookingConfirmationEmail.ts`, который в брифе прямо запрещён к правке — этап C). Добавлен
  необязательный параметр `appName` с дефолтом-литералом (поведение вызова из
  `sendBookingConfirmationEmail.ts` не меняется, файл не тронут). `BookingDoneClient.tsx` передаёт
  `usePatientSurfaceName()` явно.
- `CabinetActiveBookings.tsx`: `generateIcs`/`downloadIcs` были свободными функциями с тем же
  литералом в PRODID — прокинул `appName` параметром от вызывающего компонента.

`STAFF_SURFACE_NAME`-импортёры (`StaffPasskeySection.tsx`, `LandingHeader.tsx`, `installSteps.ts`,
`DoctorAdminSidebar.tsx`) не трогал — у staff-имени нет env-override (владелец, `TPB-01`), прямой
импорт литерала для них корректен и был корректен уже сегодня.

**Живая проверка (dev-сервер этого клона, порт 5302, `PATIENT_APP_NAME=QA-Renamed`):**

```
curl -s http://127.0.0.1:5302/app/patient/login   | grep -o 'title="[^"]*">QA-Renamed<'
→ title="QA-Renamed">QA-Renamed<        (server RSC — было QA-Renamed и раньше)
curl -s http://127.0.0.1:5302/app/contact-support | grep -o 'title="[^"]*">QA-Renamed<'
→ title="QA-Renamed">QA-Renamed<        (client-компонент — ДО фикса аудит здесь видел "Therapygo")
curl -s http://127.0.0.1:5302/app/contact-support | grep -c Therapygo
→ 0                                     (литерал больше нигде не протекает)
curl -s http://127.0.0.1:5302/app/doctor/login | grep -o 'title="[^"]*">Therapysto<'
→ title="Therapysto">Therapysto<        (staff-имя НЕ переопределяется PATIENT_APP_NAME)
```

### Тихая утечка (наблюдение, не чинил отдельно)

Бриф просил: если способ `X2` закрывает утечку `env.ts`→client bundle заодно — сказать; если нет — не
городить машинерию. Мой фикс её не закрывает и не должен: `PlatformProvider.tsx` импортирует только
`PATIENT_DEFAULT_SURFACE_NAME` из `config/productSurfaceNames.ts` (литерал без env), а не
`config/productSurfaces.ts`/`config/env.ts`. Клиентские компоненты после правки импортируют
`PlatformProvider`, не `productSurfaceNames` напрямую (кроме двух staff-компонентов, которые и раньше
были безопасны). Дыра остаётся ровно такой, какой её описал аудит: ничто в дереве не мешает
СЛЕДУЮЩЕМУ клиентскому компоненту импортировать `config/productSurfaces` напрямую и утащить `env.ts` в
бандл. Не мой скоуп — владельцу на заметку, машинерию под неё не изобретал.

## X3 — `F3`: два вхождения вне `apps/webapp/src` + инвентаризация по всему репо

### Исправлено (2 файла из брифа)

- **`apps/webapp/public/maintenance.html`** — `<title>`/`.brand` `BersonCare` → `Therapysto`.
  Оставлена статикой (страницу отдаёт nginx по `error_page 502/503/504`, конфиг в неё не
  импортируется), добавлен HTML-комментарий, что это ручной дубль имени, который следующий rename
  обязан поправить руками.
- **`apps/webapp/public/sw.js`** — `showNotification(title || 'BersonCare', …)` →
  `|| 'Therapygo'`. Перед правкой проверил, кто реально это увидит (бриф прямо просил доказать, не
  гадать):
  - `sw.js` — **общий файл**, регистрируется ОБЕИМИ поверхностями:
    `registerPatientServiceWorker.ts` (patient, scope `/app`) И
    `shared/ui/doctor/pwa/StaffPwaBootstrap.tsx` (staff, тот же файл, тот же scope). Это НОВЫЙ факт
    относительно брифа — сам файл не patient-only.
  - Но достижим fallback `|| 'BersonCare'` только с patient-стороны:
    `patientWebPushNotify.ts:232` пропускает отправку, только если title И body ОБА пустые — пустой
    title при непустом body уходит. Проверил все 3 staff-facing push-пути
    (`notifyDoctorPatientMessageToStaff.ts`, `sendAdminIncidentStaffWebPush.ts`,
    `notifySpecialistTaskReminder.ts`) — у всех title всегда непустой литерал
    (`'Новое сообщение'`/`input.pushTitle`/`'Задача'`), фоллбек для staff недостижим сегодня.
  - Вывод: имя пациентского продукта (`Therapygo`), не платформы — фактический получатель пуша с
    пустым title всегда пациент. `sw.js` не может импортировать `config/productSurfaceNames.ts` (сырой
    браузерный файл, не часть бандла) — литерал, как и в `maintenance.html`, с тем же
    предупреждением-комментарием на будущий rename.

### `X4` — `.env.example`

`PATIENT_APP_NAME`/`PATIENT_APP_ORIGIN` добавлены как закомментированные примеры с описанием
(дефолты остаются — санкционированное отступление от `A1`, не переигрывал). Отдельно пояснено, что у
staff-имени (`Therapysto`) env-override нет.

### Повторная инвентаризация по всему репозиторию (не только `apps/webapp/src`)

Команда: `git grep -c "BersonCare\|BersonAdmin" -- . ':!node_modules'` → 306 файлов / 779 строк
(case-sensitive `BersonCare`) + 21 `BersonAdmin`. Полный список нечитаем как чек-лист; классифицирован
по корзинам, а не построчно:

| Корзина | Где | Вердикт |
| --- | --- | --- |
| **product/runtime, user-visible** | `apps/webapp/public/maintenance.html`, `public/sw.js` | **исправлено выше** |
| **product/runtime, user-visible, DB-side** | `deploy/postgres/generated/prod-to-target/schema-pre.sql`, `deploy/postgres/organization-member-invites-rls.sql` — definer-функции строят текст OTP: `'Ваш код BersonCare: ' \|\| p_code`, `'Код подтверждения BersonCare'` | **найдено, НЕ тронуто** — брифом БД запрещена («PROD, TEST, деплой, БД, push — не трогать»). Это реальный текст, который сегодня видит пользователь в SMS/email с кодом входа. Для владельца: этаж этой находки не в `apps/webapp/src`, а в схеме БД + `apps/integrator/src/integrations/bersoncare/*` (`sendSmsRoute.ts`, `sendEmailRoute.ts`, `sendOtpRoute.ts`, `relayOutboundRoute.ts`, `operatorAlertRelayRoute.ts`, `deliveryAdapter.ts` (email/web-push)) — те же литералы `'BersonCare'`/`'Ваш код BersonCare: …'`/`'Код подтверждения BersonCare'`. `apps/integrator/**` прямо в списке «не трогать» этого брифа — не тронул ни строки. |
| **deploy/nginx, user-visible** | `deploy/host/setup-nginx-tls.sh:98` — `return 503 "BersonCare: host is provisioned…"` (текст, который видит браузер, если хост поднят, а приложение не задеплоено) | **найдено, НЕ тронуто** — `deploy/**` запрещён этим брифом. |
| **QA/dev-скрипт, потенциально user-visible** | `apps/webapp/scripts/qa-push-direct.mjs:46` — `title: 'BersonCare — тест-пуш 🔔'` (ручной dev-скрипт для проверки пуша, не рантайм-путь) | **найдено, НЕ тронуто** — не в списке `X1–X4`, не изобретал скоуп. |
| **technical (repo/env/systemd/npm/docs-tooling identifiers)** | пути `/home/dev/dev-projects/BersonCareBot`, `bersoncarebot-*.service` Description=, имена БД/логинов, `deploy/systemd/**`, `tools/**`, `.gitleaks.toml`/`.semgrep*`/`.trivyignore`, `deploy/nginx/bersoncarebot-webapp.vhost.template.conf` (имя файла) | не user-visible продукту, действие не требуется |
| **history/reference docs** | `AGENTS.md`, `README.md`, `ARCHITECTURE.md`, `PORTFOLIO_CHAT_SUMMARY.md`, `docs/**`, `.cursor/**`, `.lead/**`, `runs/**`, `apps/webapp/INTEGRATOR_CONTRACT.md` (описывает те же OTP-флоу текстом документации) | справочные/архивные — вне `A3`/`A4` этого брифа, не трогал |
| **уже классифицировано аудитом** | 8 строк в `apps/webapp/src` (passkey/totp/тест-фикстура/письмо пациенту/CSS-комментарий/doctor-комментарий/`auth.md`) | без изменений, см. таблицу в `AUDIT_STAGE_A_2026-08-22.md` |

Самое важное для владельца из этой инвентаризации: **реальный текст OTP-кода, который сегодня получает
пользователь по SMS/email, всё ещё говорит «BersonCare»** — источник в `apps/integrator/src/integrations/
bersoncare/*` и в двух SQL-файлах `deploy/postgres/**`. Это не входило в мой бриф (интегратор и БД —
явный запрет), но это самая заметная user-facing находка инвентаризации; решение по ней — за владельцем.

## Гейты

- `pnpm --filter webapp typecheck` → exit 0 (дважды: до и после чистки `.next/dev`).
- `npx eslint <14 изменённых .ts/.tsx>` → exit 0, без warnings.
- `pnpm --filter webapp build` (`next build`) → exit 0. `grep -rl "dev-session-secret-change-me-min-16"
  .next/static/` → 0 файлов (секрет не утёк, как и до правки).
- Затронутые тесты: `sendBookingConfirmationEmail.outbound.test.ts` (8 тестов) и
  `staffPwaManifest.unit.test.ts` — оба файла зелёные, `buildIcsContent`-вызов из
  `sendBookingConfirmationEmail.ts` не менялся (новый параметр — с дефолтом).
- Живые прогоны — см. команды в `X1`/`X2` выше (порты 5301/5302 этого клона, серверы остановлены
  после проверки).

## Не тронуто (явно, по запрету брифа)

`modules/auth/passkeyAuth.ts`, `modules/staff-security/totp.ts`, `apps/integrator/**`,
`bersoncare-tweakcn-theme.css`, `id`/`scope`/`start_url` манифестов, `sendBookingConfirmationEmail.ts`
(содержимое письма — только добавлен необязательный параметр с дефолтом в вызываемую им функцию),
`staffPwaManifest.unit.test.ts` (не удалял), PROD/TEST/деплой/БД/push, `IMPLEMENTATION_PLAN.md`
(чек-лист этапа не трогал — приёмка не моё решение).

## Вопрос владельцу

Нет. Все три находки (`F1`–`F3`) закрыты в рамках заявленного скоупа брифа; DB/integrator-находка из
инвентаризации — не вопрос-развилка, а факт для сведения (см. таблицу выше), решение по ней делает
владелец/ведущий вне этого брифа.

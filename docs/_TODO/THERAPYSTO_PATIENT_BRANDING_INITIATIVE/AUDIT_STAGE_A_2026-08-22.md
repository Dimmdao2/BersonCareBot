# Независимый адверсарный аудит — этап A Therapysto (коммит `c3136e23e`)

**Дата:** 2026-08-22. **База:** `af1e62430`. **Аудируемый коммит:** `c3136e23e`, 33 файла.
**Клон:** `/home/dev/dev-projects/bcb-wt-therapysto-stage-a-20260822`, ветка `wt/therapysto-stage-a-20260822`.
**Оракул:** `IMPLEMENTATION_PLAN.md`, требования `TPB-01`, `TPB-03`, `TPB-04`, `TPB-06`, `TPB-08`,
`TPB-09`, `TPB-15`, `TPB-16` и этап `A` (`A1`–`A4`).

## Вердикт: `FAIL`

Три достижимых нарушения owner-требований + одно отклонение от текста этапа `A1`. Ничего не чинил
(§24.6): единственная правка продукта в этом аудите — недостающий acceptance-тест контракта манифеста,
который бриф аудитора прямо поручил дописать.

---

## Находки

### F1 — `MUST FIX`. Экран входа доктора и админа клиники теперь показывает имя ПАЦИЕНТСКОГО продукта

Нарушено `TPB-08` («Branding влияет только на patient-facing surface; staff/admin видят Therapysto»)
и `TPB-01`.

- `apps/webapp/src/app/layout.tsx:28,40` — корневые `title` и `appleWebApp.title` переведены на
  `PATIENT_DEFAULT_SURFACE.name`.
- `apps/webapp/src/app/app/AppEntryRsc.tsx:85` — `<PatientAppShell title={PATIENT_DEFAULT_SURFACE.name}>`.
- Этот же `AppEntryRsc` рендерит СТАФФ-логины: `apps/webapp/src/app/app/(role-login)/doctor/login/page.tsx`
  и `.../admin/login/page.tsx` (`roleLoginPortal="doctor"|"admin"`). Своих метаданных у них нет, у
  `app/app/layout.tsx` тоже нет — значит наследуется корневой fallback.

Комментарий в `layout.tsx:20-24` утверждает, что staff-зоны переопределяют метаданные через
`staffPwaLayoutMetadata`. Это верно для `doctor`/`settings`/`admin`/`account`/`manage` **layout**-ов, но
экраны `(role-login)` в них не входят — они лежат в собственной route-группе без layout-а.

**Воспроизведение (живой прогон, dev-сервер этого клона на 5301):**

```
curl -s http://127.0.0.1:5301/app/doctor/login | grep -o "<title>[^<]*</title>"
→ <title>Therapygo</title>
curl -s http://127.0.0.1:5301/app/admin/login  | grep -o "<title>[^<]*</title>"
→ <title>Therapygo</title>
```

В теле страницы видимая брендовая строка шапки — `title="Therapygo">Therapygo</p>`, а
`<meta name="apple-mobile-web-app-title" content="Therapygo">`. До коммита там было `BersonCare Webapp` /
`BersonCare` — то есть этап должен был закрыть `TPB-01`/`TPB-08` на этом периметре, а вместо этого
поставил имя ЧУЖОЙ поверхности.

Смежный факт (НЕ регрессия этого коммита, существовал до него): `/app/doctor/login` линкует
`/manifest.webmanifest` — пациентский манифест. Специалист, ставящий приложение с экрана входа,
установит Therapygo.

### F2 — `MUST FIX`. У имени поверхности два источника; deploy-config долетает только до server-рендера

Нарушено `TPB-09` («Standard patient name/origin меняются deploy config без data migration») и дух
`TPB-16`.

`config/productSurfaceNames.ts` отдаёт голые литералы, `config/productSurfaces.ts` — значение с
применённым env-override. Все `'use client'` компоненты (12 продуктовых call-site'ов,
`git grep -c productSurfaceNames -- apps/webapp/src`) читают ЛИТЕРАЛ и env-override игнорируют.

**Воспроизведение (измерено):** dev-сервер этого клона на 5302 с `PATIENT_APP_NAME=QA-Renamed`:

```
curl -s http://127.0.0.1:5302/app/patient/login   → брендовая строка: QA-Renamed   (server, env)
curl -s http://127.0.0.1:5302/app/contact-support → брендовая строка: Therapygo    (client, литерал)
```

Это два экрана в одном шаге друг от друга: ссылка «поддержка» стоит прямо на экране входа
(`AppEntryRsc.tsx:93`, `routePaths.loginContactSupport`). Смена имени через deploy config даёт
продукт с двумя разными именами.

Затронутые клиентские call-site'ы: `PatientTopNav.tsx`, `ContactSupportPageClient.tsx`,
`BookingDoneClient.tsx`, `CabinetActiveBookings.tsx` (PRODID в .ics), `PasskeySection.tsx`,
`AuthBootstrap.tsx`, `PwaInstallSection.tsx`, `StaffPasskeySection.tsx`, `LandingHeader.tsx`,
`DoctorAdminSidebar.tsx`, плюс общие `installSteps.ts` и `buildCalendarLinks.ts`.

**Важно:** сам факт двух файлов — НЕ нарушение `TPB-16`, разделение доказано необходимым (см. «Проверено
и чисто», п. 1). Дефект в том, что клиентская половина — захардкоженный литерал, а не значение,
протянутое от резолва поверхности.

### F3 — `MUST FIX`. Два user-visible вхождения `BersonCare` остались вне `apps/webapp/src`

Нарушено `TPB-15` / `TPB-01`. Инвентарь исполнителя был ограничен `apps/webapp/src` (8 оставшихся строк,
все классифицированы корректно). Команда инвентаря плана
(`CURRENT_STATE_AND_GAP_REPORT.md:16`) — по всему репозиторию, и §1.1 там прямо предупреждает, что
список точек не исчерпывающий.

1. `apps/webapp/public/maintenance.html:8` (`<title>BersonCare — обновление</title>`) и `:75`
   (`<div class="brand">BersonCare</div>`). Страница отдаётся nginx по `error_page 502 503 504` для
   вебапп-vhost и на PROD, и на TEST: `deploy/nginx/bersoncarebot-webapp.vhost.template.conf:27-30`,
   `deploy/host/apply-test-nginx-webapp.sh:156-159`. Её видит ЛЮБОЙ пользователь при любом сбое/деплое.
2. `apps/webapp/public/sw.js:55` — `showNotification(title || 'BersonCare', …)`. Достижимо: отправка
   отсекает только случай «и title, и body пустые» (`patientWebPushNotify.ts:232`), пустой `title` при
   непустом `body` проходит, и пуш приходит пациенту с заголовком `BersonCare`.

Какое имя должно стоять на `maintenance.html` — вопрос владельцу/ведущему, а не мой: страница общая для
обеих поверхностей, а разведение по хосту — этап `B`.

### F4 — отклонение от текста этапа `A1` (deploy inputs получили дефолты)

`A1` дословно: «standard patient `name` и `origin` — **обязательные deploy inputs без
placeholder/default бренда**». Реализация (`apps/webapp/src/config/env.ts:38,40`) сделала обе
переменные необязательными:

```
PATIENT_APP_NAME:   z.string().min(1).default(PATIENT_DEFAULT_SURFACE_NAME)   // 'Therapygo'
PATIENT_APP_ORIGIN: z.string().url().default('https://therapygo.ru')          // ПРОДОВЫЙ домен
```

Последствие: окружение, забывшее переменную, не падает, а молча получает продовый пациентский origin.
Сегодня это латентно — `PATIENT_DEFAULT_SURFACE.origin` не имеет ни одного потребителя
(`grep -rn "PATIENT_DEFAULT_SURFACE.origin" apps/webapp/src` вне определения → 0), но абсолютные
пациентские ссылки этапа `B` встанут именно на него.

Вторая половина той же находки: ни одна из переменных не описана в `apps/webapp/.env.example` —
единственном шаблоне deploy-конфига (`grep -n PATIENT_APP apps/webapp/.env.example` → пусто). Ручка,
которой `TPB-09` обещает смену имени, оператору не видна.

---

## Проверено — проблем нет

1. **Разделение `productSurfaceNames.ts` / `productSurfaces.ts` — настоящее, не замаскированный дубль.**
   Проверено инъекцией, а не чтением: `PatientTopNav.tsx` (реальный `'use client'`) переведён на импорт
   `PATIENT_DEFAULT_SURFACE` из `config/productSurfaces`, прогнан `next build`.
   - Сборка НЕ упала (формулировка исполнителя «ломается» сильнее факта), но код `config/env.ts` уехал в
     браузерный чанк: `grep -rl "dev-session-secret-change-me-min-16" .next/static/` → 1 файл
     (`chunks/3qg6edyppqhc8.js`, 468 516 байт).
   - На коммитнутом коде та же команда → **0 файлов**.
   Значит `TPB-16` разделением не нарушен: это не дубль, а граница бандла. Инъекция откачена.
   **Оговорка для ведущего:** утечка тихая — в репозитории нет ничего, что помешает следующему
   клиентскому компоненту импортировать `productSurfaces`.
2. **Server-only код в клиентский бандл не протёк.** Ни один `'use client'` файл не импортирует
   `config/env` или `config/productSurfaces` (проверено графом импортов + grep по собранным чанкам, п. 1).
   Три server-компонента, которые импортируют `productSurfaces` (`LandingFooter`, `WhySection`,
   `PatientSectionSubscriptionCallout`), поднимаются только до server-`page.tsx`.
3. **Юридические страницы: изменено только имя сервиса.**
   `git diff af1e62430 c3136e23e -- apps/webapp/src/app/legal` — 6 изменённых строк, все брендовые.
   Юридическое лицо оператора, реквизиты, ответственность, сроки хранения, права пользователя не
   тронуты («указанный оператором» — `privacy/page.tsx:71`, строка вне диффа). Живой рендер:
   `/legal/terms` → «…веб-приложения Therapysto (далее — «Сервис»)», пробелы корректны.
4. **Контракт установленного приложения цел.** Собранный пациентский манифест:
   `{"id":"/app", … "start_url":"/app/patient","scope":"/app"}`, изменились только `name`/`short_name`.
   Staff: `id:'/app-staff'`, `scope:'/app'`, `start_url:'/app/doctor'` — тоже только имена.
   Добрано покрытие в `apps/webapp/src/shared/lib/pwa/staffPwaManifest.unit.test.ts` (3 теста, зелёные).
   Fault injection (`id:'/app'` → `'/app-patient'`) валит новый тест — откачено.
5. **Запрещённое не тронуто.** В 33 файлах диффа нет `modules/auth/passkeyAuth.ts`,
   `modules/staff-security/totp.ts`, `apps/integrator/**`, `package.json`, миграций/имён таблиц и ролей,
   `bersoncare-tweakcn-theme.css`. **Привязка passkey к домену не изменилась ни на йоту:** `rpId`
   по-прежнему выводится из `env.APP_BASE_URL` (`passkeyAuth.ts:21,32`), `PATIENT_APP_ORIGIN` там не
   читается.
6. **`TPB-04`:** `git grep -In "staff\.therapysto|patient\.therapysto"` вне документов инициативы → 0.
7. **`TPB-06`:** BersonCare-specific ветвлений в диффе нет.
8. **Приложение поднимается без новых env.** `grep -n PATIENT_APP apps/webapp/.env.dev .env` → пусто;
   dev-сервер на 5301 отдал `/`, `/legal/terms`, `/app/*/login` на дефолтах.
9. **Гейты (свои прогоны, не отчёт исполнителя):**
   - `pnpm --filter webapp typecheck` → exit 0.
   - `npx eslint <30 изменённых файлов> + новый тест` → exit 0.
   - `next build` (через `host-orch/run-tests.sh`) → exit 0, дважды (инъекция и чистый).
   - затронутые тесты (7 файлов / 36 тестов) → PASS.
   - Оговорка: первый прогон typecheck дал 200+ `TS1005`/`TS1128` — ВСЕ внутри
     `.next/dev/types/{routes.d.ts,validator.ts}`, обрезанных артефактов прерванного dev-сервера в этом
     клоне; в `src/` — ноль ошибок. После удаления stale-каталога — exit 0. К коммиту отношения не имеет.

## Оставшиеся 8 вхождений в `apps/webapp/src` — классификация

`git grep -n "BersonCare\|BersonAdmin" -- apps/webapp/src` → 8 строк, `BersonAdmin` → 0.

| Строка | Класс | Вердикт |
| --- | --- | --- |
| `modules/auth/passkeyAuth.ts:31` | отложено владельцем 22.08 (passkey) | оставить |
| `modules/staff-security/totp.ts:51` | отложено владельцем 22.08 | оставить |
| `modules/auth/passwordAuth.route.test.ts:333` | фикстура отложенного issuer | оставить |
| `modules/patient-booking/sendBookingConfirmationEmail.ts:105,116` | подпись письма пациенту — этап C | оставить |
| `app/styles/bersoncare-tweakcn-theme.css:2` | комментарий в запрещённом файле | оставить |
| `shared/ui/doctor/DoctorDnaFlatListRow.tsx:2` | комментарий, не user-visible | оставить |
| `modules/auth/auth.md:3` | «BersonCare webapp» в активном модульном доке | **рекомендация**: формально периметр `A4`; не находка |

## Наблюдения (не находки)

- `components/landing/WhySection.tsx` — **мёртвый компонент**: `git grep -n WhySection -- apps/webapp/src`
  находит только его собственное определение, импортёров ноль. Его переименование не видно нигде.
  Инвентарь `CURRENT_STATE_AND_GAP_REPORT.md` §1.1 числит его user-facing точкой — это неверно.
- Пациентский текст про passkey теперь говорит «не передаётся Therapygo», а системный диалог покажет RP
  name `BersonCare` (`passkeyAuth.ts:31`). Прямое следствие отложенного владельцем passkey, не дефект
  коммита.
- Полноту `A4` (активные owner/contract/runbook доки) я не проверял — этого нет в моём брифе. Коммит
  тронул только `apps/webapp/ARCHITECTURE.md` и `apps/webapp/README.md`; закрыт ли `A4` целиком —
  открыто.

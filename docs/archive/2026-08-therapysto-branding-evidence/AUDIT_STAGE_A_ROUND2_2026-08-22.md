# Повторный независимый адверсарный аудит — этап A Therapysto после коррекции

**Дата:** 2026-08-22. **Проверяемые коммиты:** `f8778803c` (воркер) + `f3361a4f3` (ведущий), поверх
`c3136e23e` + `d37390274`. **Клон:** `/home/dev/dev-projects/bcb-wt-therapysto-stage-a-20260822`,
ветка `wt/therapysto-stage-a-20260822`, HEAD `6265a9b89`.
**Прошлый вердикт:** `AUDIT_STAGE_A_2026-08-22.md` (`FAIL`, находки `F1`–`F4`).
**Оракул:** `IMPLEMENTATION_PLAN.md` — `TPB-08` («Branding влияет только на patient-facing surface;
staff/admin видят Therapysto»), `TPB-09`, `TPB-15`, `TPB-16`, Gate A.

## Вердикт: `FAIL`

Три находки прошлого круга (`F1`, `F2`, `F3`) закрыты — проверено воспроизведением тех же команд, а
не по отчёту. Но находка `F1` не исчерпана: **это уже третий и четвёртый её остаток**. Коррекция
закрыла ДВЕ конкретные staff-страницы (`/app/doctor/login`, `/app/admin/login`) и одно поле
(`description`), а не КЛАСС «staff-поверхность наследует пациентскую идентичность». Ещё два
staff-facing экрана из того же класса продолжают представляться пациентским продуктом.

Ничего не чинил (§24.6). Единственный записанный файл — этот отчёт.

---

## Находки

### R1 — `MUST FIX`. Экран регистрации специалиста представляется Therapygo — один клик от staff-лендинга

Нарушено `TPB-08`. Достижимо анонимно, видимая брендовая строка (не только метаданные).

Лендинг `/` — это staff-маркетинг: `<title>Therapysto — кабинет специалиста</title>`. **Все пять**
его CTA «Создать кабинет» ведут на `/app?intent=specialist`
(`components/landing/LandingHeader.tsx:108`, `HeroSection.tsx:40`, `FinalCta.tsx:20`,
`PracticePathsSection.tsx:53`, `PricingTeaserSection.tsx:27`). Этот query-параметр включает именно
экран регистрации специалиста (`shared/ui/patient/AuthBootstrap.tsx:165`,
`initialSpecialistSignupView`).

Маршрут `/app` рендерится через `AppEntryRsc` без `roleLoginPortal`, поэтому правка коррекции
(`AppEntryRsc.tsx:85-89`) сознательно оставляет ему пациентскую идентичность, а собственных
метаданных у него нет — берётся пациентский корень.

**Воспроизведение (живой прогон, dev-сервер этого клона на 5313, дефолтный env):**

```
curl -s http://127.0.0.1:5313/ | grep -o "<title>[^<]*</title>"
→ <title>Therapysto — кабинет специалиста</title>

curl -s "http://127.0.0.1:5313/app?intent=specialist" | grep -o 'title="[^"]*">[^<]*<'
→ title="Therapygo">Therapygo<          ← ВИДИМАЯ брендовая строка шапки
curl -s "http://127.0.0.1:5313/app?intent=specialist" | grep -oE '<title>[^<]*</title>|<meta name="description" content="[^"]*"|<link rel="manifest"[^>]*>|<meta name="apple-mobile-web-app-title"[^>]*>'
→ <title>Therapygo</title>
→ <meta name="description" content="Patient web application for Therapygo."
→ <link rel="manifest" href="/manifest.webmanifest"/>
→ <meta name="apple-mobile-web-app-title" content="Therapygo"/>
curl -s "http://127.0.0.1:5313/app?intent=specialist" | grep -c Therapysto
→ 0
```

Специалист жмёт «Создать кабинет» на странице Therapysto и попадает на экран Therapygo. До этапа A
корень отдавал `BersonCare Webapp` / `Patient and doctor web application for the BersonCare platform`
(`git show af1e62430:apps/webapp/src/app/layout.tsx`) — нейтрально для обеих аудиторий. Пациентским
корень стал именно в `c3136e23e`, то есть нарушение внесено аудируемой работой.

Смежный, но НЕ находка: ссылка «Войти» с того же лендинга ведёт на голый `/app`, который сегодня
обслуживает и пациентов, и персонал. Как разводить общий вход — продуктовое решение (кандидат на
этап `B`, host-резолвер), а не дефект коррекции. Отмечаю как вопрос ведущему/владельцу, работу из
него не выводил.

### R2 — `MUST FIX`. Экран принятия приглашения в клинику (админ/доктор) представляется Therapygo

Нарушено `TPB-08`. Достижимо анонимно по ссылке из письма приглашения.

`app/app/clinic/invites/accept/page.tsx` — приём приглашения ПЕРСОНАЛА: превью инвайта типизировано
`invitedRole: 'admin' | 'doctor'` (`InviteAcceptClient.tsx:20`). У страницы нет своих метаданных, в
`app/app/clinic/**` нет layout — наследуется пациентский корень целиком: `title`, `description`,
`apple-mobile-web-app-title`, `manifest` и иконки.

**Воспроизведение (тот же сервер 5313):**

```
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:5313/app/clinic/invites/accept
→ 200                                    (анонимно, без сессии)

curl -s http://127.0.0.1:5313/app/clinic/invites/accept | grep -oE '<title>[^<]*</title>|<meta name="description" content="[^"]*"|<link rel="manifest"[^>]*>|<meta name="apple-mobile-web-app-title"[^>]*>'
→ <title>Therapygo</title>
→ <meta name="description" content="Patient web application for Therapygo."
→ <link rel="manifest" href="/manifest.webmanifest"/>
→ <meta name="apple-mobile-web-app-title" content="Therapygo"/>
```

Ровно та же причина, что у `F1`: route-группа без layout наследует корневой fallback. Коррекция
пропатчила два конкретных page-файла, а не проверила ВСЕ маршруты вне staff-layout'ов.

Сама тема письма-приглашения персонала уже переведена на Therapysto (подэтап `A0.3`, см.
`IMPLEMENTATION_PLAN.md:281`) — то есть приглашённый получает письмо «Therapysto», а по ссылке
попадает на «Therapygo».

### R3 — `SHOULD FIX`. Нет теста, который ловит класс `F1`; Gate A такой тест требует

Gate A дословно: «targeted config/**metadata**/auth tests». `TPB-08`: «Доказательство: cross-surface
metadata/UI tests».

Единственный тест периметра — `shared/lib/pwa/staffPwaManifest.unit.test.ts` (3 теста): он проверяет
СОДЕРЖИМОЕ объекта `staffPwaLayoutMetadata` и контракт манифестов, но НЕ проверяет, какие маршруты
этот объект получают. Поэтому он был зелёным и когда `/app/doctor/login` отдавал Therapygo, и когда
`description` был пациентским, и остаётся зелёным сейчас, при R1 и R2.

```
grep -rln "staffPwaLayoutMetadata|productSurface|apple-mobile-web-app-title|usePatientSurfaceName" \
  apps/webapp/src --include=*.test.ts --include=*.test.tsx
→ apps/webapp/src/shared/lib/pwa/staffPwaManifest.unit.test.ts   (единственный файл)
```

Три круга подряд один и тот же класс находят живым curl'ом, а не гейтом — это и есть причина, по
которой `F1` не закрывается с первого раза. Постоянный тест «в коде нет такой-то строки» здесь не
нужен и не предлагается; нужен тест соответствия «маршрут → идентичность поверхности».

---

## Проверено — проблем нет

Числа получены командами, приведёнными рядом. Все живые прогоны — dev-серверы ЭТОГО клона на портах
5311 (дефолтный env), 5312 (`PATIENT_APP_NAME=QA-Renamed`), 5313 (дефолтный env); все остановлены
после проверки. Порт 5200 не трогал.

1. **`F1` (staff-логины) закрыт — по факту, тем же способом воспроизведения.** Сервер 5311:

   | Маршрут | title | description | apple-title | manifest |
   | --- | --- | --- | --- | --- |
   | `/app/doctor/login` | `Therapysto` | `Кабинет специалиста и администратора Therapysto.` | `Therapysto` | `/manifest-staff.webmanifest` |
   | `/app/admin/login` | `Therapysto` | то же | `Therapysto` | `/manifest-staff.webmanifest` |
   | `/app/patient/login` | `Therapygo` | `Patient web application for Therapygo.` | `Therapygo` | `/manifest.webmanifest` |

   Видимая брендовая строка шапки: `curl -s .../app/doctor/login | grep -o 'title="[^"]*">[^<]*<'`
   → `title="Therapysto">Therapysto<`.

2. **Остаток `F1` про `description` закрыт, и ДРУГИХ полей того же класса на закрытых staff-зонах
   не осталось.** Корневой `app/layout.tsx:27-41` объявляет ровно четыре брендозависимых поля:
   `title`, `description`, `icons`, `appleWebApp`. `staffPwaLayoutMetadata.ts` после `f3361a4f3`
   перекрывает все четыре плюс `manifest`. `OpenGraph`/`twitter`/`applicationName`/`keywords`/
   `metadataBase` в корне НЕ объявлены вовсе:

   ```
   grep -rn "openGraph|twitter|applicationName|keywords|metadataBase" apps/webapp/src --include=*.ts --include=*.tsx
   → apps/webapp/src/app/page.tsx:19,22,37   (только лендинг, его собственный generateMetadata;
                                              page-метаданные наследникам не передаются)
   ```

   Иконки проверил живым прогоном, а не рассуждением о слиянии метаданных Next:
   `/app/doctor/login` → `staff-pwa-icon-192/512.png`, `staff-pwa-apple-touch.png`, без единой
   пациентской; `/app/patient/login` → `pwa-icon-192/512.png`, `apple-touch-icon.png` + `shortcut
   icon`. Пациентская иконка на staff-зону не протекает.

3. **`F2` (env-override не долетал до клиента) закрыт.** Сервер 5312 с `PATIENT_APP_NAME=QA-Renamed`:

   ```
   /app/patient/login    title=QA-Renamed   QA-Renamed×10  Therapygo×0  Therapysto×0
   /app/contact-support  title=QA-Renamed   QA-Renamed×9   Therapygo×0  Therapysto×0   ← был Therapygo
   /app                  title=QA-Renamed   шапка >QA-Renamed<
   /app/tg               title=QA-Renamed   шапка >QA-Renamed<
   /app/max              title=QA-Renamed   шапка >QA-Renamed<
   /app/doctor/login     title=Therapysto   Therapysto×9   QA-Renamed×1
   /app/admin/login      title=Therapysto   Therapysto×9   QA-Renamed×1
   ```

   Единственное вхождение `QA-Renamed` на staff-экранах — проп провайдера в RSC-payload
   (`\"patientSurfaceName\":\"QA-Renamed\"`), не отображаемый текст; видимая строка —
   `title="Therapysto">Therapysto<`. **Пациентский override staff-имя не переопределяет.**

   Механика проверена и структурно: ни один display-путь больше не читает литерал.
   `grep -rn "PATIENT_DEFAULT_SURFACE_NAME" apps/webapp/src` → 4 продуктовых упоминания, все
   не-display: дефолт схемы `env.ts:38`, определение в `productSurfaceNames.ts:23`, fallback контекста
   `PlatformProvider.tsx:23`, дефолт параметра `buildCalendarLinks.ts:58`. Оставшиеся прямые
   импортёры `productSurfaceNames` — четыре staff-компонента, все берут `STAFF_SURFACE_NAME`, у
   которого override нет по решению владельца (`TPB-01`).

4. **`F3` (вхождения вне `apps/webapp/src`) закрыт.** `grep -rn "BersonCare|BersonAdmin"
   apps/webapp/public/` → **0 строк**. `maintenance.html:15,82` → `Therapysto`; `sw.js:64` →
   `showNotification(title || 'Therapygo', …)`. Оба помечены в файле комментарием, что это ручной
   дубль имени — как просил бриф коррекции. В `apps/webapp/src` те же 8 строк, что классифицировал
   прошлый круг, без изменений.

5. **Контракт установленного приложения цел (регрессия не внесена).** Живые манифесты с сервера 5312:
   - пациентский: `{"id":"/app", … "start_url":"/app/patient","scope":"/app"}` — при
     `PATIENT_APP_NAME=QA-Renamed` изменились только `name`/`short_name`;
   - staff: `{"id":"/app-staff", … "start_url":"/app/doctor","scope":"/app"}`, `name`/`short_name`
     = `Therapysto`, override его не трогает.

6. **Привязка passkey к домену не изменилась.** `git diff af1e62430 f3361a4f3 --
   apps/webapp/src/modules/auth/passkeyAuth.ts apps/webapp/src/modules/staff-security/totp.ts` →
   пусто. `rpId` по-прежнему `new URL(env.APP_BASE_URL).hostname` (`passkeyAuth.ts:21,32`),
   `PATIENT_APP_ORIGIN` там не читается.

7. **Юридические страницы не тронуты и рендерятся корректно.** Ни `legal/**` в списке изменённых
   файлов обоих коммитов, ни расхождений в живом рендере: `/legal/terms` → 6× `Therapysto` (платформа)
   + 3× имя пациентской поверхности; `/legal/privacy` → 8 + 3. `BersonCare` — 0.

8. **Запрещённое не тронуто.** Точный состав коррекции — 20 файлов:
   `git show --name-only --format="" f8778803c f3361a4f3` → 18 файлов кода/статики + 1 отчёт
   + `staffPwaLayoutMetadata.ts`. Ни `passkeyAuth.ts`, ни `totp.ts`, ни `apps/integrator/**`, ни
   `package.json`, ни миграций, ни `bersoncare-tweakcn-theme.css`, ни `staffPwaManifest.unit.test.ts`
   (тесты аудитора не удалены — 3 теста на месте).
   ⚠️ Замечание к методу: `git diff d37390274 f3361a4f3` даёт 41 файл, но это шум от merge-коммита
   `de07a1b71`, притянувшего `feat/doctor-ui-rebuild`. Судить о скоупе по нему нельзя.

9. **Тихая утечка `env.ts` в клиентский бандл не открылась** (проверено сборкой, как в прошлом круге).
   `NODE_ENV=production next build` → exit 0. Затем:
   - `grep -rl "dev-session-secret-change-me-min-16" .next/static/` → **0 файлов**;
   - `grep -rl "ALLOW_DEV_AUTH_BYPASS|SESSION_SECRET" .next/static/` → **0 файлов**.

   Граница держится: ни один `'use client'`-файл не импортирует `@/config/env` или
   `@/config/productSurfaces` (проверено по графу импортов + грепом по собранным чанкам). Дыра
   остаётся ровно такой, как её описал прошлый круг: механики, запрещающей следующему клиентскому
   компоненту сделать такой импорт, в репозитории нет. Это наблюдение, не находка — пункта плана под
   него нет, и бриф коррекции прямо запретил городить под него машинерию.

10. **Третьего места с именем не появилось — `TPB-16` соблюдён.** `PlatformProvider` расширен, а не
    продублирован: файл уже существовал, провайдер уже был смонтирован ровно один раз в `RootLayout`
    (`app/layout.tsx:71`). Добавлены один контекст и один хук над тем же деревом:
    `grep -rn "PlatformProvider" apps/webapp/src` → 1 монтирование, 7 потребителей через
    `usePatientSurfaceName()`, 1 через существующий `PlatformContext`. Параллельного
    getter/resolver/store нет.

11. **Скоуп не разогнан.** Каждый из 18 изменённых файлов кода ложится на `X1`–`X4` брифа коррекции:
    `X1` — 3 файла (2 login-page + `AppEntryRsc.tsx`); `X2` — 10 файлов (`PlatformProvider.tsx`,
    `layout.tsx`, 7 клиентских компонентов, `buildCalendarLinks.ts`) + 2 файла документации
    (`config.md`, `productSurfaceNames.ts` — только комментарии); `X3` — `maintenance.html`, `sw.js`;
    `X4` — `.env.example` (5 строк, все закомментированные). Новых модулей, гейтов, скриптов и
    проверочной машинерии не появилось. Оговорка `A1` (дефолты у обеих переменных остаются) —
    санкционированное ведущим отступление, воркер его не переигрывал.

12. **Гейты — свои прогоны, не отчёт исполнителя.**
    - `pnpm exec tsc --noEmit` → exit 0 (после `rm -rf .next/dev`; про stale-артефакты прошлый круг
      уже предупреждал).
    - `pnpm exec eslint <16 изменённых .ts/.tsx/.js>` → exit 0, без warnings.
    - `NODE_ENV=production next build` → exit 0.
    - `pnpm exec vitest --run staffPwaManifest.unit.test.ts sendBookingConfirmationEmail.outbound.test.ts`
      → 2 файла / 8 тестов PASS.

## Наблюдения (не находки, работу из них не выводил)

- **`.ics` в письме подтверждения записи не подхватывает `PATIENT_APP_NAME`.**
  `buildCalendarLinks.ts:58` получил параметр `appName` с дефолтом-литералом; клиентский вызов
  (`BookingDoneClient.tsx:74`) передаёт env-разрешённое имя, а серверный
  (`sendBookingConfirmationEmail.ts:77`) — нет, поэтому `PRODID` письма останется `Therapygo` после
  переименования. Файл прямо запрещён брифом коррекции (этап C). Формально это остаток `TPB-09`, но
  закрывать его — решение ведущего по границе этапов, а не моё.
- **`sw.js` и `maintenance.html` после переименования через deploy config протухнут** — литералы
  статические. Так предписал бриф коррекции («оставь статикой»), в обоих файлах стоит комментарий-
  предупреждение. Отмечаю для полноты, не как дефект коррекции.
- **Стоп-состояние окружения:** dev-серверы 5301/5302 от прогона коррекции остались жить (PID 3869258
  и 3869728, cwd этого клона), хотя отчёт коррекции говорит «серверы остановлены после проверки».
  Остановил их перед своими прогонами — два `next dev` в одном каталоге делят `.next` и исказили бы
  измерения. Замер отчёта коррекции это, скорее всего, не портит (он снят до), но формулировка
  «остановлены» была неверна.
- **`A3`/`A4` не проверял** — их нет в моём брифе. Repo-wide инвентаризация коррекции классифицирована
  по корзинам, а не построчно; её главный вывод (текст OTP `«Ваш код BersonCare»` в
  `apps/integrator/**` и `deploy/postgres/**`) — открытый вопрос владельца, не работа этапа A.

## Что нужно от ведущего/владельца

1. `R1` и `R2` — прямые нарушения `TPB-08`, требование в плане владельца есть → чинить.
2. `R3` — Gate A требует metadata-теста; без него класс `F1` продолжит всплывать после каждого круга.
3. Вопрос (НЕ работа): как общий вход `/app`, на который ведёт «Войти» со staff-лендинга, должен
   представляться, пока хост один на обе поверхности. Пункта плана под это нет; кандидат на этап `B`.

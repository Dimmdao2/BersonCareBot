# Коррекция этапа A, круг 3 — закрыт КЛАСС «staff-поверхность наследует пациентскую идентичность»

**Дата:** 2026-08-22. **Ветка:** `wt/therapysto-stage-a-20260822`, поверх `c1272da42`.
**Оракул:** `IMPLEMENTATION_PLAN.md` — `TPB-08`, `TPB-09`, `TPB-16`, Gate A.
**Входы:** `AUDIT_STAGE_A_2026-08-22.md` (`F1`–`F4`), `AUDIT_STAGE_A_ROUND2_2026-08-22.md` (`R1`–`R3`).

## Почему прошлые два круга не закрывали класс

Идентичность объявлял КАЖДЫЙ маршрут сам: корневой `app/layout.tsx` отдавал пациентские
`title/description/icons/appleWebApp`, а staff-зона перекрывала их своим `export const metadata` —
девять объявлений в девяти файлах. Маршрут, которого в этих девяти нет, молча получал пациентскую
идентичность. Круг 1 добавил два объявления, ведущий — одно поле; круг 2 нашёл ещё два маршрута того
же класса. Перечисление страниц поимённо не закрывает класс: следующая страница в перечень не попадает.

## Что сделано: идентичность больше не объявляется на маршруте

Одна таблица «путь запроса → поверхность» (`src/config/surfaceRoutes.ts`) и **одна точка применения** —
`generateMetadata` корневого layout. Она задаёт сразу и метаданные/манифест/иконки, и видимое имя в
шапке (через тот же единственный `PlatformProvider`). Путь до layout доносит `src/proxy.ts` заголовком
`x-bc-pathname` — seam, который уже существовал для patient-layout policy, второй не заведён.

Следствие: новая страница внутри классифицированного поддерева получает верную идентичность, **ничего
не объявляя**. Забыть нечего — объявлять больше нечего. Девять прежних объявлений удалены.

**Изменённые файлы**

| Файл | Что |
| --- | --- |
| `src/config/surfaceRoutes.ts` | НОВЫЙ. Таблица правил + `classifyRequestSurface` / `resolveRequestSurface`. Чистый модуль (без env), импортируется и edge-proxy, и тестом. |
| `src/shared/lib/surface/surfaceLayoutMetadata.ts` | НОВЫЙ. `patientLayoutMetadata` (переехало из корневого layout) + `surfaceLayoutMetadata()` / `surfaceDisplayName()`. |
| `src/shared/lib/surface/requestSurface.server.ts` | НОВЫЙ. Чтение заголовка пути в RSC. |
| `src/app/layout.tsx` | `metadata` → `generateMetadata()` через резолвер; `PlatformProvider` получает имя разрешённой поверхности. |
| `src/proxy.ts` | Заголовок пути ставится на весь matcher (был только `/app/patient`); в matcher добавлен `/`. |
| `src/app/app/AppEntryRsc.tsx` | Заголовок shell'а — из той же таблицы, а не перечислением порталов. |
| `src/shared/ui/PlatformProvider.tsx` + 7 потребителей | `usePatientSurfaceName` → `useSurfaceName`: на staff-маршруте хук отдаёт `Therapysto`, а не пациентское имя. |
| `src/shared/lib/pwa/patientPwaManifest.ts`, `src/app/manifest.webmanifest/route.ts` | Пациентский манифест переехал из file-based `app/manifest.ts` в route handler — см. «Почему» ниже. URL, `id`, `scope`, `start_url`, тексты байт в байт прежние. |
| 9 layout/page staff-зон | Удалены `export const metadata = staffPwaLayoutMetadata` — их работу делает единственная точка. |
| `src/config/surfaceRoutes.unit.test.ts` | НОВЫЙ. Гейт `R3`. |

**Почему пришлось трогать пациентский манифест.** Next вставляет file-based metadata (`app/manifest.ts`)
в `<head>` САМ, и она приоритетнее `metadata.manifest` корневого layout. Пока идентичность объявляли
staff-зоны у себя (дочерний сегмент), это было незаметно. После переезда идентичности в корень
file-based манифест перекрывал бы staff-манифест на КАЖДОЙ staff-странице — персонал ставил бы
пациентское приложение. Замерено: до переезда `/app/doctor/login` отдавал `/manifest.webmanifest`.

## Гейт `R3` — `src/config/surfaceRoutes.unit.test.ts`

Список маршрутов берётся **с диска** обходом `src/app/**/page.tsx`, а не из памяти. Проверяет: каждый
маршрут дерева классифицирован; набор верхнеуровневых каталогов заморожен (иначе широкое последнее
правило `/[clinicSlug]` проглотит новую односегментную staff-страницу); маршруты вне matcher'а proxy
классифицированы как `patient` (иначе fallback их подменит); staff-маршруты отдают Therapysto во всех
четырёх брендозависимых полях + манифест; пациентские не задеты.

**Проверен инъекцией неисправности (три штуки, все пойманы):**

| Инъекция | Результат |
| --- | --- |
| Убрано правило `/app/clinic` (страница возвращена на пациентский корень) | 2 теста красных, в т.ч. `+ "/app/clinic/invites/accept"` в списке неклассифицированных |
| `/app/doctor` объявлен пациентским | 4 теста красных |
| Добавлена новая верхнеуровневая страница `/pricing` | 1 тест красный: `+ "pricing"` |

После восстановления — 33/33 зелёных.

## Живая проверка

Dev-сервер этого клона на 5321 (дефолтный env) и 5322 (`PATIENT_APP_NAME=QA-Renamed`); 5200 не трогал;
оба сервера остановлены после проверки (`ss -ltn | grep -E ":5321|:5322"` → пусто).

**Полный обход дерева (149 маршрутов, `page.tsx` без `api`):** 17 отрендерились анонимно, 132 отдали
307/308 на свой логин, **расхождений с ожидаемой поверхностью 0.**

**Анонимно достижимые staff-маршруты — все четыре:**

| Маршрут | title | description | manifest | apple-title | видимая шапка |
| --- | --- | --- | --- | --- | --- |
| `/` | `Therapysto — кабинет специалиста` | своё (лендинг) | `/manifest-staff.webmanifest` | `Therapysto` | — |
| `/app?intent=specialist` | `Therapysto` | `…администратора Therapysto.` | `/manifest-staff.webmanifest` | `Therapysto` | `Therapysto` |
| `/app/clinic/invites/accept` | `Therapysto` | то же | `/manifest-staff.webmanifest` | `Therapysto` | брендовой строки нет |
| `/app/doctor/login`, `/app/admin/login` | `Therapysto` | то же | `/manifest-staff.webmanifest` | `Therapysto` | `Therapysto` |

Иконки на всех четырёх — `staff-pwa-icon-192/512.png` + `staff-pwa-apple-touch.png`, ни одной пациентской.

**Под сессией** (вход `POST /api/auth/email-password/login`, три учётки владельца на DEV):
`/app/doctor`, `/app/doctor/patients`, `/app/doctor/schedule`, `/app/account`, `/app/doctor/install`,
`/app/admin/system-health`, `/app/admin/promo`, `/app/manage` → `Therapysto` + staff-манифест,
вхождений `Therapygo` — **0**. `/app/patient`, `/app/patient/profile`, `/app/patient/booking`,
`/app/patient/install` → `Therapygo` + `/manifest.webmanifest`, вхождений `Therapysto` — **0**.

**Soft-navigation проверена, а не предположена.** Метаданные теперь живут в корне; вопрос был, обновятся
ли они при клиентском переходе. Flight-payload целевого маршрута
(`curl -H 'RSC: 1' .../app/doctor/login`) содержит `"title","0",{"children":"Therapysto"}` и
`manifest-staff.webmanifest` — Next разрешает метаданные под целевой маршрут целиком, включая корневой
`generateMetadata`.

**`PATIENT_APP_NAME=QA-Renamed` (порт 5322):** `/app`, `/app/patient/login`, `/app/tg`, `/app/max`,
`/app/contact-support` → `QA-Renamed`, `Therapygo`×0, `Therapysto`×0; манифест `"name":"QA-Renamed — …"`.
Staff-маршруты: `Therapysto`, `QA-Renamed`×**0** (в круге 2 имя ещё протекало в RSC-payload пропом
провайдера — теперь провайдер несёт имя разрешённой поверхности, и утечки нет). `manifest-staff`
не тронут.

**Гейты:** `tsc --noEmit` exit 0 · `eslint` по 28 изменённым файлам exit 0, без warnings ·
`NODE_ENV=production next build` exit 0 · vitest по затронутым зонам (`config`, `shared/lib/pwa`,
`shared/ui`, `middleware`, `modules/platform-access`, `accessLifecycleSurfaces`) — 22 файла / 151 тест
PASS. Секрет в клиентский бандл не утёк: `grep -rl "dev-session-secret-change-me-min-16" .next/static/`
→ 0, `grep -rlE "ALLOW_DEV_AUTH_BYPASS|SESSION_SECRET" .next/static/` → 0.

## Найдено измерением, не по списку брифа

**Лендинг `/` отдавал пациентский манифест и пациентские иконки.** Круги 1 и 2 его не поймали: заголовок
и описание у него свои и правильные (`Therapysto — кабинет специалиста`), а `manifest`/`icons`/
`apple-mobile-web-app-title` он молча наследовал от пациентского корня. При этом собственный текст
лендинга обещает обратное: `INSTALL_SUCCESS_NOTE` (`components/landing/installSteps.ts:15`) — «Готово:
иконка **Therapysto** появится на экране телефона», — а установка ставила приложение с именем Therapygo.
Единая точка починила это, не спрашивая: лендинг классифицирован как staff, потому что он и есть
staff-маркетинг.

⚠️ **Это меняет поведение установки с лендинга, и это стоит подтвердить владельцу.** Раньше установка с
`/` давала пациентское приложение (`id: /app`, `start_url: /app/patient`), теперь даст приложение
персонала (`id: /app-staff`, `start_url: /app/doctor`). Уже установленные приложения не задеты — у них
свой манифест, и `id`/`scope`/`start_url` ни одного манифеста не менялись. Смежная деталь:
`StandaloneRootRedirect` (`components/landing/StandaloneRootRedirect.tsx`) уводит standalone-запуск с `/`
на `/app/patient`; при `start_url: /app/doctor` он просто не срабатывает, старые установки продолжают
работать как работали. Отменить — одна строка: правило `/` в `SURFACE_ROUTE_RULES` на `patient`.

## Найдено, но НЕ тронуто

- **Голый `/app` при одном хосте на обе поверхности** — открытый вопрос владельца из круга 2, пункта
  плана нет. Правило для него оставлено `patient`, то есть поведение сегодняшнее; в таблице записано
  явной строкой с пометкой «кандидат в этап B». Решение `Y1` его НЕ закрывает.
- `buildCalendarLinks.ts:58` — серверный вызов из `sendBookingConfirmationEmail.ts` не передаёт
  env-имя, `PRODID` письма останется прежним. Файл запрещён брифом (этап C).
- `public/sw.js:64`, `public/maintenance.html` — статические литералы имени, помечены комментарием в
  круге 2; так предписал бриф коррекции.
- Ветка rewrite в `src/proxy.ts` (`doctorRouteRedirectResponse`) возвращает ответ до проставления
  заголовка пути. Сегодня эта ветка отдаёт только 308-редиректы (браузер перезапрашивает и проходит
  через proxy заново), rewrite удалён — то есть недостижимо; записано как известное ограничение.
- `apps/integrator/**` и `deploy/postgres/**` (текст OTP «Ваш код BersonCare») — открытый вопрос
  владельца, не работа этапа A.

## Запрещённое не тронуто

`git diff --name-only` не содержит `modules/auth/passkeyAuth.ts`, `modules/staff-security/totp.ts`,
`apps/integrator/**`, `bersoncare-tweakcn-theme.css`, `sendBookingConfirmationEmail.ts`, миграций,
`package.json`. `id`/`scope`/`start_url` обоих манифестов не менялись — проверено живыми ответами
`/manifest.webmanifest` (`"id":"/app"…"start_url":"/app/patient"`) и `/manifest-staff.webmanifest`
(`"id":"/app-staff"…"start_url":"/app/doctor"`). Тест аудитора
`shared/lib/pwa/staffPwaManifest.unit.test.ts` не удалён: в нём изменён один импорт
(`@/app/manifest` → `./patientPwaManifest`, тот же builder переехал), все проверки на месте.

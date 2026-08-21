# MOB-00 — ADR и результаты разведочного spike

Дата: 2026-08-21. Ветка: `feat/doctor-ui-rebuild`. Основание работы: разморозка `MOB-00` владельцем
2026-08-21 (шапка [`MASTER_PLAN.md`](MASTER_PLAN.md), коммит `43dbdbe72`). Разморожен только `MOB-00`.

Spike собран и выброшен за пределами репозитория:
`/tmp/claude-1001/-home-dev-dev-projects-BersonCareBot/f8026cf8-1be0-4a30-bce6-5a64868687cb/scratchpad/mob00/`.
В репозиторий не добавлено ни одного Capacitor-пакета, ни `ios/`, ни `android/`, ни mobile schema, ни provider
keys. `pnpm-lock.yaml` не изменён. Единственный созданный файл репозитория — этот документ.

---

## 1. Verdict

**Гипотеза «Capacitor как native runtime» подтверждается. Гипотеза «внутрь Capacitor помещается существующий
`apps/webapp`» — ОПРОВЕРГНУТА.**

Формулировка §2 `MASTER_PLAN.md` («отдельный `apps/mobile` с React + Capacitor и локальным web bundle, который
ходит в JSON API текущего backend») выдерживает проверку. Формулировка «поместить текущий webapp в native
оболочку» — нет, и не «дорого», а структурно невозможно без превращения webapp в SPA.

Verdict по шкале задания: **viable only with named structural changes.** Изменения перечислены ниже, каждое —
с измеренной ценой.

Три причины, каждая проверена на живом коде и живом сервере:

1. **У webapp нет и не может быть корневого `index.html`.** `output: 'standalone'`
   (`apps/webapp/next.config.ts:29`); все 149 `page.tsx` — server components (0 из 149 несут `'use client'`);
   92 динамических сегмента и ни одного `generateStaticParams`; 30 модулей Server Actions; 456 route handlers,
   из которых 209 файлов импортируют `drizzle-orm`/`pg` и 141 — `node:*`. `output: 'export'` отбрасывает
   `headers()` и `redirects()` из конфига и физически не собирает ни один из этих путей.
2. **Backend сегодня не отвечает ни одному клиенту с чужим origin.** Ни один эндпоинт не отдаёт
   `Access-Control-Allow-Origin` (проверено curl'ом на живом dev-сервере, §3.2), а живой headless-браузер с
   локального bundle получил `Failed to fetch` даже на `GET /api/health` (§3.3).
3. **Строгий same-origin CSRF-гейт в `apps/webapp/src/proxy.ts:33-51` отклоняет ЛЮБОЙ мутирующий запрос
   мобильного клиента** — и WebView-вариант, и native-HTTP-вариант. Пять разных попыток, все `403
   csrf_origin_forbidden` (§3.2). Это не «слабое место», а корректно работающая защита; мобильному клиенту
   нужен собственный класс мутации, а не ослабление существующего.

Production `server.url` в spike не использовался ни разу и в собранном Android-проекте отсутствует (§3.4).
Прототип НЕ зависит от него — то есть запрет соблюдён, и это не является скрытым опровержением.

### Что именно надо сделать (структурные изменения и их цена)

| # | Изменение | Почему обязательно | Измеренная цена |
|---|---|---|---|
| S1 | Отдельный `apps/mobile`: React SPA + Capacitor, локальный bundle | у webapp нет статического выхода | новый пакет, роутер, шелл |
| S2 | Token-based mobile session (access+refresh) параллельно cookie-сессии | bearer-пути для пользователя нет вообще | новый subsystem: выпуск/ротация/отзыв + Keystore |
| S3 | Новый CSRF `mutationClass` для native-клиента (по Authorization, не по Origin) | все мутации сейчас 403 | точечная правка `csrfOrigin.ts` + тесты |
| S4 | CORS-политика с явным allowlist native-origin | сейчас CORS нет совсем | точечная, но требует security review |
| S5 | Bootstrap/screen-data API для RSC-страниц | 37 из 42 patient-страниц грузят данные внутри RSC | ~30-40 новых JSON-эндпоинтов |
| S6 | HTTP-эквиваленты Server Actions | 5 patient-actions без HTTP | 5 эндпоинтов |
| S7 | API base URL вместо относительных `/api/...` | 67 call-site'ов только в patient-UI | механическая, но сквозная правка |
| S8 | Push-target registration для `fcm`/`apns` | сегодня есть только `web_vapid` | новая таблица+API (это `MOB-03`) |
| S9 | Клиентский эквивалент auth/role-гейта из `proxy.ts` | в bundle нет сервера, который редиректит | клиентский guard + серверная проверка на каждом API |

---

## 2. Current dependency map (чекбокс 1)

### 2.1 Конфигурация Next

- `output: 'standalone'` — `apps/webapp/next.config.ts:29`.
- `headers()` — 3 группы, включая CSP `frame-ancestors 'self'` на `/app/:path*` — `next.config.ts:37-75`.
- `redirects()` — 7 постоянных редиректов patient-диари/treatment — `next.config.ts:76-102`.
- `serverExternalPackages`: `sharp`, `fluent-ffmpeg`, 5×`@ffmpeg-installer/*` — `next.config.ts:104-112`.
- `outputFileTracingIncludes` тянет нативные бинарники `sharp` для `/api/internal/media-preview/process` —
  `next.config.ts:31-36`.
- `rewrites`/`i18n`/`images`/`basePath`/`assetPrefix`/`trailingSlash` отсутствуют.
  `grep -n "rewrites\|i18n\|images\|basePath\|assetPrefix\|trailingSlash" apps/webapp/next.config.ts` → пусто.

`output: 'export'` несовместим с `headers()`, `redirects()`, route handlers, Server Actions и с 13 сегментами
`export const dynamic = 'force-dynamic'`.

### 2.2 SSR/RSC

```
$ cd apps/webapp && find src/app -name page.tsx | wc -l              → 149
$ grep -rl "use client" --include=page.tsx src/app | wc -l           → 0
$ grep -rl "app-layer/guards" --include=page.tsx src/app | wc -l     → 100
$ grep -rln "redirect(" --include=page.tsx src/app | wc -l           → 51
$ find src/app -type d -name "[[]*" | wc -l                          → 92
$ grep -rl "generateStaticParams" src/app | wc -l                    → 0
```

Все 149 страниц и все 14 `layout.tsx` — server components. 100 страниц вызывают серверный role-guard
(`apps/webapp/src/app-layer/guards/requireRole.ts`) прямо в теле RSC. 12 не-тестовых файлов импортируют
`next/headers`, в том числе чокпойнт чтения сессии `apps/webapp/src/modules/auth/service.ts:2` и
`apps/webapp/src/app/app/patient/layout.tsx:2,55` (читает заголовки `x-bc-pathname`/`x-bc-search`, которые
инжектит `proxy.ts:111-119`).

### 2.3 Cookie-аутентификация

- Имена: `bersoncare_webapp_session`, `bersoncare_fresh_login` —
  `apps/webapp/src/modules/auth/sessionCookieNames.ts:1-3`.
- Значение = `base64url(JSON) + "." + HMAC-SHA256`, проверка через `node:crypto`/`timingSafeEqual` —
  `apps/webapp/src/modules/auth/sessionCookie.ts:1,42-50,123-148`. **Этот код принципиально не исполним в
  WebView** — он серверный.
- Флаги: `httpOnly: true`, `sameSite: 'lax'`, `secure` в production, `path: '/'` — `sessionCookie.ts:188-196`.
  `SameSite=Lax` означает, что из `capacitor://localhost` / `https://localhost` кука не прикрепится.
- Скользящее продление делает proxy: `sessionCookie.ts:227-245`, вызовы `proxy.ts:62,69,121`.
- **Bearer-пути для пользователя нет.** Единственные `Authorization` — machine-to-machine
  (`INTERNAL_JOB_SECRET` на cron-эндпоинтах, напр.
  `apps/webapp/src/app/api/internal/saas-billing/renewal/tick/route.ts:25`) и исходящие вызовы к провайдерам.

### 2.4 CSRF — главный барьер

`apps/webapp/src/middleware/csrfOrigin.ts`, вызывается из `apps/webapp/src/proxy.ts:33-51`.

- `classifyCsrfMutation` (`csrfOrigin.ts:94-108`): любой `POST/PUT/PATCH/DELETE` на `/app` или `/api/*` —
  класс `browser`.
- `decideCsrfOrigin` (`csrfOrigin.ts:181-220`):
  - `Sec-Fetch-Site !== 'same-origin'` → reject (`csrfOrigin.ts:194-196`);
  - ожидаемый origin строится из `Host` + `X-Forwarded-Proto` (`csrfOrigin.ts:121-139`);
  - `Origin` обязан совпасть (`:203-209`), иначе `Referer` (`:211-217`), иначе reject `source_headers_missing`
    (`:219`).
- Уже существующие не-браузерные классы: `integrator_hmac` (15 путей, `csrfOrigin.ts:1-17`),
  `internal_bearer` (20 путей, `:19-39`), `payment_webhook` (3 паттерна, `:41-45`), `apple_form_post` (`:47`).

**Это и есть готовое место для S3.** Мобильный клиент должен получить пятый класс мутации, авторизуемый
токеном, а не origin'ом. Правило `browser` при этом не ослабляется — то есть PASS-критерий «proof не требует
ослабить cookie/CSRF/CORS для всего интернета» достижим.

### 2.5 proxy.ts (Next middleware в репозитории отсутствует)

`apps/webapp/src/proxy.ts`, matcher `['/app', '/app/:path*', '/api/:path*']` (`proxy.ts:126-128`). Делает:
correlation-id (`:29-32`), CSRF-гейт (`:33-51`), 308-редиректы doctor-URL (`:52-65`), platform-context
(`:67-72`), **auth-гейт: нет сессии → 302 на login с `?next=`** (`:74-86`), role-гейт (`:87-110`), инжекция
заголовков для `/app/patient/*` (`:111-119`), продление сессии (`:121-123`).

Живое подтверждение серверного auth-редиректа:

```
$ curl -s -i http://127.0.0.1:5200/app/patient | head -5
HTTP/1.1 307 Temporary Redirect
location: /app/patient/login?next=%2Fapp%2Fpatient
```

В локальном bundle такого сервера нет — вся эта логика становится клиентской (то есть неавторитетной) и
обязана дублироваться серверной проверкой на каждом API.

### 2.6 API routes

```
$ cd apps/webapp && find src/app/api -name route.ts | wc -l   → 456
```

`api/doctor` 167 · `api/patient` 69 · `api/admin` 55 · `api/auth` 48 · `api/integrator` 27 · `api/booking` 26 ·
`api/internal` 16 · `api/media` 13 · `api/clinic` 11 · `api/account` 8 · остальные ≤3.

Это **хорошая новость** для мобильного: значительная часть данных уже доступна как JSON. Плохая — эти маршруты
писались для same-origin браузера (см. 2.3–2.4).

### 2.7 PWA-гейты, которые надо выключить внутри native shell

- Service worker `apps/webapp/public/sw.js` (161 строка), **без перехвата `fetch`** (`sw.js:2`) — то есть
  offline-кеша он не даёт вовсе; обрабатывает `push` (`sw.js:26-60`) и клик по уведомлению (`sw.js:13-24`).
- 3 точки регистрации SW: `src/components/landing/LandingPwaClientBootstrap.tsx:14-15`,
  `src/shared/ui/patient/marketing/PwaInstallSection.tsx:60-61`,
  `src/shared/ui/doctor/pwa/StaffPwaBootstrap.tsx:17-18`.
- Манифесты: `src/app/manifest.ts:11-25` (`start_url: '/app/patient'`, `display: 'standalone'`) и
  `src/app/manifest-staff.webmanifest`.
- `beforeinstallprompt`: `PwaInstallSection.tsx:31,51,67`, `StaffPwaInstallSection.tsx:49,60`.
- Web Push/VAPID: `src/shared/lib/webPush/pushCapability.ts:12,50,53,64` (жёстко привязан к scope `/app` —
  `:53`), бутстрапы `PatientWebPushBootstrap.tsx:37-51`, `StaffWebPushBootstrap.tsx:15-29`, серверные маршруты
  `api/patient/web-push/{status,subscribe,unsubscribe}` и `api/integrator/web-push/*`.

Требование `MASTER_PLAN.md` §8 «native platform detector отключает PWA install/SW UI, не притворяясь
standalone PWA» реализуемо: все точки перечислены и их 5 + VAPID-цепочка.

### 2.8 Файлы и медиа

Двухфазная схема через presigned S3, 13 маршрутов `src/app/api/media/*`.

- Upload: `POST /api/media/presign` — `src/app/api/media/presign/route.ts:26-31,46`, гейт
  `requireDoctorWorkspaceApiContext()`.
- Download: `GET /api/media/[id]` отдаёт **307-редирект** на presigned URL —
  `src/app/api/media/[id]/route.ts:24-36`, авторизация `:38-45`.
- Presign делает сервер: `src/infra/s3/client.ts`; структурный lint-гейт единственной двери —
  `apps/webapp/scripts/check-media-upload-door.mjs:1-5` (включён в `pnpm lint`).
- Превью/транскод требуют серверных `sharp`/`ffmpeg` (`next.config.ts:31-36,104-112`) — это остаётся на сервере.

Для мобильного: сама схема пригодна (presigned URL заливается напрямую в S3, минуя CORS-проблему нашего API),
но требует абсолютных URL и native-safe file handling.

### 2.9 Server Actions

```
$ cd apps/webapp && grep -rln "^'use server'" src | wc -l   → 30
```
22 в `app/app/doctor/*`, 5 в `app/app/patient/*`, 3 в `app/app/settings/*`. Server Action — это RSC-протокол RPC;
статического эквивалента нет, каждому нужен HTTP-эндпоинт.

### 2.10 Origin-допущения

- `NEXT_PUBLIC_APP_BASE_URL` (9 упоминаний) используется только как дополнение к `window.location.origin` при
  нормализации markdown-ссылок. **Настраиваемого API base URL в клиенте нет — он предполагает same-origin.**
- Клиентских вызовов с относительным путём: `grep -rnE "fetch\((\`|')/api" src | grep -v '\.test\.' | wc -l`
  → **294** call-site'а в 136 файлах.
- Серверный канонический origin: `apps/webapp/src/config/env.ts:31,214` (`APP_BASE_URL`, дефолт
  `http://127.0.0.1:5200`).
- i18n нет вовсе — единственное измерение без цены миграции.

---

## 3. Spike evidence (чекбоксы 2 и 3)

Всё ниже реально исполнено. Раздел 3.5 честно перечисляет, что исполнить не удалось.

### 3.1 Что построено

Одноразовый Capacitor-проект в scratchpad: `@capacitor/core|cli|android` **8.5.0**, `webDir: "www"`,
рукописный `www/index.html`, который из локального bundle стучится в живой dev-сервер webapp.

```
$ npx cap add android
✔ Adding native android project in android in 31.38ms
✔ Copying web assets from www to android/app/src/main/assets/public in 2.35ms
[success] android platform added!
$ ls android/app/src/main/assets/public
cordova.js  cordova_plugins.js  index.html
$ grep -rn "server" capacitor.config.json android/app/src/main/assets/capacitor.config.json
(пусто) → NO server block — local bundle only
$ du -sh android → 640K
```

Сгенерированный проект: `minSdk 24`, `compileSdk/targetSdk 36`, AGP `8.13.0`, Gradle `8.14.3`.

**Что это доказывает:** механика Capacitor «локальный bundle с корневым `index.html` внутри APK-ассетов, без
`server.url`» работает и воспроизводима. **Чего не доказывает:** что этим bundle может быть `apps/webapp` —
см. §2.1, webapp такой директории не производит.

### 3.2 CSRF/CORS-стена — curl по живому dev-серверу `127.0.0.1:5200`

Ни один ответ не содержит `Access-Control-Allow-Origin` — проверено для origin'ов `https://localhost`,
`capacitor://localhost`, `https://app.bersoncare.ru`, `http://localhost` на `GET /api/me` (все четыре — 401
`unauthorized`, ни одного CORS-заголовка).

Мутирующий запрос, 5 вариантов, все на `POST /api/auth/exchange`:

| Вариант | Заголовки | Ответ |
|---|---|---|
| A | без `Origin` и `Referer` (native HTTP-клиент) | `403 {"ok":false,"error":"csrf_origin_forbidden"}` |
| B | `Origin: http://127.0.0.1:5200` + `Sec-Fetch-Site: cross-site` | `403 csrf_origin_forbidden` |
| C | `Origin: https://localhost` (Capacitor Android по умолчанию) | `403 csrf_origin_forbidden` |
| D | `Origin: capacitor://localhost` (Capacitor iOS по умолчанию) | `403 csrf_origin_forbidden` |
| E | `Authorization: Bearer …`, без `Origin` | `403 csrf_origin_forbidden` |

Контроль: тот же запрос с `Origin: http://127.0.0.1:5200` и без `Sec-Fetch-Site` проходит CSRF-гейт и получает
`403 {"ok":false,"error":"access_denied"}` — то есть отказ уже прикладной, не CSRF. Это доказывает, что гейт
срабатывает именно на origin, а не на чём-то ещё.

**Вывод:** вариант E — ключевой. Даже native HTTP-мост Capacitor (`CapacitorHttp`), который обходит CORS,
упирается в тот же 403, потому что он не шлёт `Origin`, а гейт трактует отсутствие обоих заголовков как отказ
(`csrfOrigin.ts:219`). Обходного пути на стороне клиента не существует; нужен S3.

### 3.3 Живой браузерный движок с локального bundle

`www/` отдан статикой на `http://127.0.0.1:15999` (другой origin, тот же класс cross-origin, что и
`https://localhost` у Capacitor), страница открыта в headless Chromium 151:

```
$ chromium-browser --headless=new --virtual-time-budget=15000 --dump-dom http://127.0.0.1:15999/index.html
origin = http://127.0.0.1:15999
api    = http://127.0.0.1:5200
GET  /api/health: NETWORK/CORS FAILURE :: Failed to fetch
GET  /api/me (credentials:include): NETWORK/CORS FAILURE :: Failed to fetch
POST /api/auth/exchange: NETWORK/CORS FAILURE :: Failed to fetch
DONE
```

Даже безопасный `GET /api/health` не проходит: CORS отсутствует полностью, браузер режет ответ до того, как
дело дойдёт до CSRF. **Это evidence класса «browser engine», а не «device»** — см. 3.5.

### 3.4 Запрет `server.url` соблюдён

Ни `capacitor.config.json`, ни `android/app/src/main/assets/capacitor.config.json` не содержат блока `server`
(команда и пустой вывод — в 3.1). Единственный рабочий прототип НЕ опирается на `server.url`, поэтому
опровержения по этому основанию нет.

### 3.5 Что доказать НЕ удалось и почему — измерено

| Требование чекбокса 3 | Статус | Факт |
|---|---|---|
| iOS simulator | **невозможно** | iOS Simulator требует macOS/Xcode. Бокс — headless Linux. Нужен owner-approved macOS/Xcode runner (`MOB-O7`), это гейт `MOB-01`. |
| Android emulator | **не запускался** | `/dev/kvm` существует, но недоступен пользователю `dev` (`crw-rw---- root:kvm`, `uid=1001(dev)` не в группе `kvm`) → только software-эмуляция, непригодная. |
| Сборка APK | **не выполнялась** | JDK нет: `which javac` → NONE; `/usr/lib/jvm/*` содержит только JRE 21. Сборка потребовала бы apt-установку JDK + Android SDK/build-tools/platform-36 (единицы ГБ) на боксе, который делят другие агенты и соседний production-сервис. Осознанно не делал: `MOB-01` — тот самый этап, где «воспроизводимый Android build» и является результатом. |
| API call | **доказано** — но в виде отказа (3.2, 3.3) |
| session exchange | **не доказано** | dev-bypass на этом сервере закрыт: `/api/auth/dev-bypass` → 404, `POST /api/auth/exchange {"token":"dev:client"}` с корректным origin → `403 access_denied`. Аутентифицированный экран поэтому не проверялся. |
| authenticated screen | **не доказано** | см. выше |
| app link | **не доказано** | требует устройства |
| push token stub | **не доказано** | требует FCM-проекта (`MOB-O6`) и устройства |
| logout/revoke | **не доказано** | требует S2, которого не существует |

Ресурсы бокса на момент замера: `df -h /` → 236G, занято 131G, свободно 95G; `free -g` → 31G RAM, доступно 19G;
swap 32G (заметка «no swap» устарела); load average 1.57. То есть места хватало — решение не ставить
тулчейн принято по scope, а не по ресурсам, и по недоступности KVM, из-за которой SDK всё равно не дал бы
device-proof.

---

## 4. Reuse boundary (чекбокс 4)

Линия проходит **между JSON-контрактом API и рендером**, а не внутри домена.

**Общее (переиспользуется):**
- TypeScript-типы API-ответов и доменные enum'ы — сегодня они живут внутри `apps/webapp/src`; для мобильного их
  надо вынести в `packages/…` как типы. Рабочего frontend-пакета в workspace сейчас нет: `packages/` содержит
  только `db-principal`, `platform-merge`, `operator-db-schema`, `error-tracking`.
- Presentational-примитивы `apps/webapp/src/shared/ui/primitives` и patient-компоненты. Замер чистоты:
  `grep -rlE "from '@/app-layer|drizzle-orm|next/headers|server-only|@/infra" src/shared/ui/patient | wc -l`
  → **12** из **97** файлов. То есть 85 из 97 переносимы как есть, 12 требуют развязки.
- Design-токены/DNA — чистый CSS/TS, переносятся полностью.

**Только mobile (адаптеры, дублирования домена нет):**
- native session storage (Keychain/Keystore), token refresh;
- HTTP-клиент с абсолютным base URL и `Authorization` (замена 294 относительных `fetch('/api/...')`);
- клиентский router/guard — эквивалент решений `proxy.ts:74-110`, **неавторитетный**: авторитет остаётся на
  сервере в `requireRole` и в API;
- push registration (`fcm`/`apns`), deep-link routing, file picker/downloader.

**Явно НЕ переносится (остаётся на сервере, дублировать запрещено):** `apps/webapp/src/app-layer/guards/*`,
tenant/RLS-логика, presign, транскод, вся бизнес-валидация. Мобильный клиент не получает DB-доступа и не
поднимает параллельный backend — все данные только через существующие 456 маршрутов и те, что добавит S5.

---

## 5. Exact API gap list (чекбокс 5)

Чего мобильному нужно и чего сегодня нет ни в одном из 456 маршрутов:

| # | Пробел | Проверка |
|---|---|---|
| G1 | Выпуск native-сессии (access+refresh) по email/OAuth/messenger-коду | bearer-пути для пользователя нет: все `Authorization` — M2M или исходящие |
| G2 | Ротация refresh-токена | нет |
| G3 | Класс CSRF-мутации для native-клиента | `csrfOrigin.ts:53-58` — 5 классов, native среди них нет; все 5 проб → 403 |
| G4 | CORS-ответы для allowlist-origin native-приложения | ни один ответ не несёт `Access-Control-Allow-*` |
| G5 | Список активных device-сессий и их отзыв | нет маршрута; требование `MASTER_PLAN.md` §6 |
| G6 | Регистрация push-target `fcm`/`apns` | есть только `api/patient/web-push/{status,subscribe,unsubscribe}` (`web_vapid`) |
| G7 | Bootstrap/screen-data JSON для RSC-страниц | 37 из 42 patient-страниц грузят данные внутри RSC через `app-layer/guards` |
| G8 | HTTP-эквиваленты 5 patient Server Actions | `grep -rl "use server" src/app/app/patient` → 5 |
| G9 | «Куда меня пустить» (portal/role landing) как API | сейчас это решение принимает `proxy.ts:74-110` редиректом |
| G10 | Минимально поддерживаемая версия клиента (forced update) | `GET /api/version` отдаёт только `buildId`+`startedAt` (`src/app/api/version/route.ts`) — семантики min-version нет |
| G11 | Абсолютные media-URL для native-загрузчика | `GET /api/media/[id]` отвечает 307 на presigned URL (`route.ts:24-36`) — работает, но контракта абсолютных URL в клиенте нет |

G3 и G4 — **аддитивные** изменения (новый класс, новый allowlist), а не ослабление существующих правил. Это
прямо удовлетворяет PASS-критерию «proof не требует ослабить cookie/CSRF/CORS для всего интернета».

---

## 6. Пересчитанная оценка (чекбокс 6)

Текущая оценка плана: **~4–7 недель** на Android-first patient MVP после `MOB-00` (§3 `MASTER_PLAN.md`).
Она **занижена**, потому что предполагала, что переиспользуется существующая auth и существующие API.

Измеренные драйверы patient-периметра:

```
$ cd apps/webapp
$ find src/app/app/patient -name page.tsx | wc -l                                       → 42
$ grep -rl 'app-layer/guards' --include=page.tsx src/app/app/patient | wc -l            → 37
$ find src/app/api/patient src/app/api/patient-app -name route.ts | wc -l               → 70
$ grep -rl "use server" src/app/app/patient | wc -l                                     → 5
$ grep -rl "use client" src/app/app/patient src/shared/ui/patient | wc -l               → 157
$ find src/app/app/patient src/shared/ui/patient -name '*.tsx' | wc -l                  → 277
$ grep -rnE "fetch\((\`|')/api" src/app/app/patient src/shared/ui/patient | grep -v '\.test\.' | wc -l → 67
```

| Этап | Оценка плана | Пересчёт | Причина расхождения |
|---|---:|---:|---|
| `MOB-01` shell/build/signing | 1–2 нед | **1–2 нед** | подтверждается: `cap add android` отработал за 31 мс, проект 640K; цена — только CI, подписи и Android SDK |
| `MOB-02` mobile auth/session | 1–2 нед | **3–4 нед** | token-инфраструктуры нет вообще (G1,G2,G5) + новый CSRF-класс (G3) + CORS (G4) + Keystore + security-аудит |
| API gap fill (нет в плане отдельно) | — | **1–2 нед** | G7–G11: ~30–40 bootstrap-эндпоинтов + 5 экшенов |
| `MOB-03` app push | 2–3 нед | **2–3 нед** | подтверждается; чужой гейт — `MOB-O6`/`G-04B`, не инженерия |
| `MOB-04` patient surfaces | 2–6 нед | **4–6 нед** | 42 экрана, 157 client-компонентов переносимы, но 37 экранов теряют RSC-загрузку данных и 67 fetch-call-site'ов меняют транспорт |

**Итог Android-first patient MVP: ~10–15 недель** вместо ~4–7. Основной прирост — `MOB-02` и не учтённый
планом gap-fill; `MOB-01` и `MOB-03` оценены верно.

iOS в это число не входит и не может быть оценён отсюда: без owner-approved macOS/Xcode runner (`MOB-O7`)
никакой iOS-оценки, кроме умозрительной, не существует. Ориентир плана «8–14 недель на Android+iOS с
patient+staff parity» следует считать неподтверждённым — пересчёт staff-периметра (57 doctor-страниц,
167 doctor-маршрутов, 22 doctor Server Actions) в `MOB-00` не входил.

---

## 7. Открытые вопросы владельцу

Каждый — с рекомендацией и безопасным дефолтом. Ни один не является работой, которую агент вправе начать сам.

1. **Подтверждаете ли вы отказ от идеи «webapp внутри оболочки» в пользу отдельного `apps/mobile`?**
   Рекомендация: да — иного технического пути нет (§1). Safe default: `apps/mobile`, webapp не трогаем.
2. **Согласны ли вы с пересчитанной оценкой ~10–15 недель на Android-first patient MVP вместо ~4–7?**
   Рекомендация: принять новую цифру и внести её в §3 плана. Safe default: оставить старую как «оценка до
   MOB-00», добавить новую как «после MOB-00» — так виден источник расхождения.
3. **Разрешаете ли добавить пятый CSRF-класс мутации (native, по токену) и CORS-allowlist для native-origin?**
   Это единственный способ дать мобильному хоть один POST. Рекомендация: да, но с обязательным независимым
   security-аудитом до попадания в TEST. Safe default: не делать до `MOB-02`.
4. **Нужен ли macOS/Xcode runner (`MOB-O7`) до начала `MOB-01`, или Android идёт первым в одиночку?**
   Рекомендация: Android первым; iOS-архитектура проверяется на бумаге, runner заказывается параллельно, чтобы
   не блокировать. Safe default: Android-only в `MOB-01`.
5. **Ставить ли на этот бокс Android SDK+JDK (единицы ГБ), или Android-сборка едет в отдельный CI-раннер?**
   Рекомендация: отдельный раннер — бокс делят агенты и соседний production. Safe default: не ставить.
   Напоминание: `/dev/kvm` пользователю `dev` недоступен, поэтому эмулятор здесь всё равно не поедет без
   изменения групп — это отдельное решение по инфраструктуре.
6. **Owner gates §4 (persona, store, single binary, billing) остаются открытыми.** Техническое ядро от них не
   зависело, но `MOB-01` без них не стартует. Рекомендация: закрыть одним листом.

---

## 8. Соответствие чекбоксам §4 «AI work»

Отмечать чекбоксы в `MASTER_PLAN.md` этот документ не стал — приёмка за владельцем. Статус по фактам:

| Чекбокс §4 | Статус | Где evidence |
|---|---|---|
| dependency map | **закрыт** | §2 |
| disposable Capacitor shell с локальным `index.html`, без `server.url` | **закрыт** | §3.1, §3.4 |
| доказать на Android device/emulator и iOS simulator | **НЕ закрыт** | §3.5 — evidence класса browser-engine (§3.3), не device; iOS невозможен на Linux |
| reuse boundary | **закрыт** | §4 |
| exact API gap list | **закрыт** | §5 |
| пересчёт оценки | **закрыт** | §6 |

Против PASS-критериев `MOB-00`: «local bundle без remote `server.url`» — доказано; «proof не требует ослабить
cookie/CSRF/CORS для всего интернета» — доказано, что нужные изменения аддитивны (G3, G4); «один typed
session/push/deep-link boundary» — спроектирован (§4, §5), но не реализован; «owner принимает
persona/platform/order и новую оценку» — открыт. **`MOB-00` не PASS до закрытия device-evidence и приёмки
владельцем.**

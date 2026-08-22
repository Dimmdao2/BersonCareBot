# Пересмотр объёма этапа `A` + закрытие `A3`/`A4` — 2026-08-22

**Ветка:** `wt/therapysto-stage-a-20260822`, клон `/home/dev/dev-projects/bcb-wt-therapysto-stage-a-20260822`.
**Что это:** пятый заход по этапу `A`, но первым делом — **пересмотр** того, что четыре предыдущих круга
объявили закрытым, и только потом остаток (`A3`, `A4`, хвост `config.md`).
**Приземления нет** — режим владельца из шапки `IMPLEMENTATION_PLAN.md`.

---

## 1. Главное первым: заявленное закрытие проверено и держится, но у него есть цена

Три из четырёх кругов заявляли закрытие, которое аудит опровергал, поэтому проверял независимо от
их отчётов. **Дырявого закрытия не нашёл.** Единый конфиг, единая точка идентичности и гейт — на месте
и работают. Но нашлось другое: **`TPB-15` нельзя закрывать**, и причина не в webapp, а в том, что круги
меряли не там.

**Находка `S-1` (блокирует `TPB-15`, `TPB-01`).** Текст кода входа по e-mail и SMS до сих пор говорит
«BersonCare», и он **виден персоналу**, а не только пациентам. Специалист, регистрирующийся на
Therapysto, и сотрудник, принимающий приглашение в клинику, получают письмо «**Код подтверждения
BersonCare**» с телом «**Ваш код BersonCare: NNNNNN**».

Цепочка (проверена по коду, не по отчёту):

| Шаг | Файл | Что |
| --- | --- | --- |
| staff-вход | `apps/webapp/src/app/api/auth/specialist-signup/start/route.ts:8` | регистрация специалиста → `startEmailChallenge` |
| staff-вход | `apps/webapp/src/app/api/clinic/invites/accept/start/route.ts:8` | приём приглашения ПЕРСОНАЛА → `startEmailChallenge` |
| общий | `apps/webapp/src/modules/auth/emailAuth.ts:277` | `startEmailChallenge`; при настроенной БД идёт **не** через integrator, а через durable enqueue |
| **живой источник текста** | `deploy/postgres/organization-member-invites-rls.sql:929,931` | definer-функция `app.email_auth_start_challenge` кладёт `'Ваш код BersonCare: '` и `'Код подтверждения BersonCare'` прямо в `outgoing_delivery_queue` |
| fallback без БД | `apps/integrator/src/integrations/bersoncare/sendEmailRoute.ts:161-162` | те же две строки хардкодом |
| SMS | `apps/integrator/src/integrations/bersoncare/sendSmsRoute.ts:130` | `Ваш код BersonCare: ${code}` |
| мессенджер | `apps/integrator/src/integrations/bersoncare/sendOtpRoute.ts:112` | `Код для входа в BersonCare: ${code}` |

Почему четыре круга это пропустили: круг 1 мерил `apps/webapp/src`, круги 2–4 мерили **идентичность
страницы** (title/manifest/шапка). Текст письма не страница и не в webapp — он в SQL и в интеграторе.

**Почему я это не чиню, а докладываю.** Три причины, каждая самостоятельная:

1. Бриф прямо запрещает: integrator — только чтение; в SQL и миграции не лезть.
2. **Заменой строки это не чинится по существу.** Один и тот же путь обслуживает и персонал, и
   пациентов. Персоналу нужно «Therapysto», пациенту стандартного входа — «Therapygo», пациенту
   клиники — бренд клиники. Подставить сюда «Therapysto» — значит показать пациенту клиники имя
   платформы, то есть ровно то, что запрещает `TPB-06`/`TPB-08`.
3. Правильное решение — не строка, а **параметр**: имя поверхности должен передавать вызывающий
   (webapp, который единственный знает поверхность запроса), а integrator и definer-функция обязаны
   перестать иметь собственный дефолт. Это правка контракта `/api/bersoncare/send-email` +
   `send-sms` + `send-otp` и definer-функции — то есть работа этапа `C` (механизм брендинга), а не
   строковый rename этапа `A`.

**Что это значит для чек-листа:** `TPB-15` остаётся открытым, и закрыть его в границах этапа `A`
нельзя. Это не провал круга — это неверно проведённая граница этапа. Развилку выношу владельцу
(вопрос `Q1` в §6).

---

## 2. `V1` — пункт этапа `A` → состояние → доказательство

| Пункт | Состояние | Доказательство (проверено мной, не по отчёту исполнителя) |
| --- | --- | --- |
| `A0` (staff rename) | **закрыт** | `/manifest-staff.webmanifest` → `"name":"Therapysto","short_name":"Therapysto"`; живой прогон, §4 |
| `A1` единый typed config | **закрыт** | `config/productSurfaces.ts` + `config/productSurfaceNames.ts`. Проверил не чтением, а перечислением потребителей: `git grep -n "productSurfaceNames\|productSurfaces\|STAFF_SURFACE\|PATIENT_DEFAULT_SURFACE" -- apps/webapp/src` → **все** 20 продуктовых call-site'ов импортируют отсюда, второго геттера/константы/стора нет. Единственные литералы имени вне конфига — `public/maintenance.html` и `public/sw.js`, см. `S-2` |
| `A2a` единый identity seam | **закрыт** | `grep -rn "export const metadata" apps/webapp/src/app/` → **2** вхождения (было 11), оба — `legal/*`, оба берут `PLATFORM_NAME` из того же конфига. Единственная точка — `app/layout.tsx:33 generateMetadata` |
| `A2b` metadata-часть Gate A | **закрыт** | `surfaceRoutes.unit.test.ts` + `proxy.route.test.ts`: 61 тест PASS, §5. Гейт строит предикат из `config.matcher` самого `proxy.ts` — второй копии нет (`proxy.ts:131` фиксирует, что копия удалена) |
| `A2b` остаток (legal, периметр) | **не закрыт** (был открыт и остаётся) | найден конкретный симптом `S-3`: `/legal/terms` отдаёт `<title>… · Therapysto</title>`, но `apple-mobile-web-app-title=Therapygo` и `manifest=/manifest.webmanifest` — одна страница с двумя идентичностями |
| `A3` инвентаризация по всему репо | **закрыт частично** | §3: 4839 вхождений / 1230 файлов разложены по четырём корзинам. Корзина «правим сейчас» в границах брифа оказалась **пустой** — всё user-visible в staff-периметре уже сделано кругами 1–4. Не закрыт до конца из-за `S-1` |
| `A4` активные документы | **закрыт** | §4.2: 7 файлов правлены на месте; список того, что сознательно не трогал, — там же |
| Gate A: auth tests | **не закрыт** | пункт этапом не брался ни разу; `TPB-17`/`TPB-17a`/`TPB-19` не реализованы |
| Gate A: lint + typecheck | **закрыт** | §5 |
| `TPB-01` | **закрыт частично** | staff-поверхность = Therapysto живьём (§4.1); но `S-1` — письмо с кодом входа персоналу; `passkeyAuth.ts:31 rpName` и `totp.ts:51 issuer` = `'BersonCare'` (исключены владельцем, `Q2`) |
| `TPB-03` | **закрыт** | `PATIENT_APP_NAME`/`PATIENT_APP_ORIGIN` в `config/env.ts:40`, дефолт `Therapygo`/`https://therapygo.ru`; `/manifest.webmanifest` → `"name":"Therapygo — забота о твоём здоровье"` |
| `TPB-04` | **закрыт** | `git grep -rn "staff\.therapysto\|patient\.therapysto"` → **3** вхождения, все три — сам план и gap-report, где эти поддомены перечислены как ЗАПРЕЩЁННЫЕ. В коде, deploy-конфиге и активных доках — **0** |
| `TPB-15` | **НЕ закрыт** | `S-1` |
| `TPB-16` | **закрыт с оговоркой** | параллельных резолверов нет (см. `A1`); оговорка — `S-2`, два статических файла в `public/`, которые физически не могут импортировать конфиг |

---

## 3. `V2` — инвентаризация по ВСЕМУ репозиторию

Команда (все формы написания, все файлы под git, бинарники исключены):

```
git grep -cIi "bersoncare\|berson care\|berson-care\|berson_care" -- . | awk -F: '{s+=$NF} END {print s}'
git grep -lIi "bersoncare\|berson care\|berson-care\|berson_care" -- . | wc -l
```

**4839 вхождений в 1230 файлах** (всего в репозитории 7210 файлов под git).

Разбивка по каталогам получена так:

```
git grep -cIi "bersoncare\|berson care\|berson-care\|berson_care" -- . \
 | awk -F: '{n=$NF; sub(/:[0-9]+$/,"",$0); split($0,a,"/"); top=(a[2]!=""? a[1]"/"a[2] : a[1]); cnt[top]+=n} \
   END {for (t in cnt) printf "%6d  %s\n", cnt[t], t}' | sort -rn
```

### Корзина 1 — «правим сейчас» (user-visible имя продукта в staff-периметре)

**ПУСТО.** Это результат, а не отговорка, и вот чем он доказан:

```
git grep -nI "BersonCare" -- apps/webapp/src        # → 6 строк, все шесть перечислены ниже
```

Шесть оставшихся строк в `apps/webapp/src` — и ни одна не подпадает под корзину 1:

| Строка | Корзина | Почему |
| --- | --- | --- |
| `app/styles/bersoncare-tweakcn-theme.css:2` | 2 | комментарий в файле из явного allowlist брифа |
| `modules/auth/passkeyAuth.ts:31` `rpName: 'BersonCare'` | 4 | исключён владельцем; см. `Q2` |
| `modules/auth/passwordAuth.route.test.ts:333` `otpauth://totp/BersonCare:test` | 2 | тест, зеркалящий `totp.ts:51`; поедет вместе с ним |
| `modules/staff-security/totp.ts:51` `issuer = 'BersonCare'` | 4 | исключён владельцем; см. `Q2` |
| `modules/patient-booking/sendBookingConfirmationEmail.ts:105,116` `С уважением, BersonCare` | 4 | пациентский текст, этап `C` |

Живая проверка того же утверждения — §4.1: на восьми staff-маршрутах `BersonCare` встречается **0** раз.

### Корзина 2 — не трогаем, техническое

Формы получены командой:

```
git grep -hoIiE "[A-Za-z0-9_@/.-]{0,24}(bersoncare|berson[ _-]care)[A-Za-z0-9_@/.-]{0,24}" \
  -- apps packages admin scripts tools public | sort | uniq -c | sort -rn
```

| Форма | Вхождений | Что это |
| --- | ---: | --- |
| `@bersoncare/db-principal`, `@bersoncare/platform-merge`, `@bersoncare/operator-db-schema`, `@bersoncare/error-tracking`, `@bersoncare/webapp` | 332 | npm-имена рабочего пространства |
| `x-bersoncare-signature` / `-timestamp` / `-idempotency-key` / `-contact-channel` (оба регистра) | 145 | заголовки M2M-контракта webapp↔integrator |
| `/api/bersoncare/*` (`send-email`, `send-sms`, `send-otp`, `relay-outbound`, `request-contact`, `operator-alert-relay`, `booking/lifecycle-event`, `reminder-rules`) | 41 | маршруты контракта интегратора |
| `/home/dev/dev-projects/BersonCareBot`, `/opt/projects/bersoncarebot`, `/opt/env/bersoncarebot` | 30 | пути на диске и на хосте |
| `bersoncarebot_test`, `bersoncare_platform`, `bersoncare_bot`, `bersoncare_webapp_session`, `bersoncare_web_chat_id`, `bersoncare_fresh_login`, `bersoncare_messenger_surface`, `bersoncare_analytics_client_session`, `__bersoncare_fiscal_receipt` | 42 | имена БД, ролей, cookie, ключей хранилища |
| `registerBersoncare*Route`, `Bersoncare*Deps` | 45 | идентификаторы кода интегратора |
| `bersoncarebot-*.service`, `bersoncarebot-*.conf`, cron.d | 24 | systemd/nginx/cron юниты |
| `bersoncare-booking*.ics`, `bersoncare-tweakcn-theme.css`, `theme-bersoncare-doctor-dna` | 20 | имена файлов и CSS-классов |
| `bersoncare.ru`, `test.bersoncare.ru`, `www.bersoncare.ru` | 95 в активных доках/deploy | **сегодняшние живые адреса**; см. §4.3 |
| `apps/integrator/src/integrations/bersoncare/` | каталог | явный allowlist брифа |

### Корзина 3 — не трогаем, история

```
git grep -cIi "bersoncare\|berson care\|berson-care\|berson_care" \
  -- docs/_TODO docs/archive docs/REPORTS runs .cursor/plans docs/audit docs/design \
  | awk -F: '{s+=$NF} END {print s}'      # → 2795
```

**2795 вхождений (58% всего репозитория)** — очередь аудита, архивы, отчёты кругов, прогоны,
`.cursor/plans`, и `docs/design/**` (33 файла: HTML-снимки дизайн-лаборатории и Design DNA v1.0/v1.1 —
статические артефакты прошлого UI, не активные документы).

### Корзина 4 — этап `C`, только доложить

| Место | Кто читает | Почему не строка, а механизм |
| --- | --- | --- |
| `deploy/postgres/organization-member-invites-rls.sql:929,931` + `apps/integrator/.../sendEmailRoute.ts:161-162` + `sendSmsRoute.ts:130` + `sendOtpRoute.ts:112` | **и пациент, и персонал** | `S-1`. Один путь на три разных правильных имени — нужен параметр от вызывающего |
| `apps/webapp/src/modules/patient-booking/sendBookingConfirmationEmail.ts:105,116` | пациент | подпись письма о записи → бренд клиники |
| `apps/webapp/public/sw.js:64` `title \|\| 'Therapygo'` | пациент | fallback-заголовок push'а; для пациента клиники правильное имя — бренд клиники |
| `apps/integrator/.../operatorAlertRelayRoute.ts:95,114`, `integrations/email/deliveryAdapter.ts:79`, `web-push/deliveryAdapter.ts:133` | оператор/владелец | дефолт `'BersonCare'` при отсутствующем `metadata.title` |
| `apps/webapp/src/modules/auth/passkeyAuth.ts:31`, `modules/staff-security/totp.ts:51` | **персонал** | исключены владельцем, но видны персоналу — `Q2` |

---

## 4. Что изменено

### 4.1 `V3` — живой прогон (доказательство ДО правок доков и ПОСЛЕ)

`next dev -p 5347` из этого клона (порт 5200 не тронут), `.env.dev`, `rm -rf .next/dev`.

| Маршрут | `<title>` | `apple-mobile-web-app-title` | manifest | `BersonCare` |
| --- | --- | --- | --- | ---: |
| `/` | `Therapysto — кабинет специалиста` | Therapysto | `/manifest-staff.webmanifest` | 0 |
| `/app/doctor/login` | `Therapysto` | Therapysto | staff | 0 |
| `/app/admin/login` | `Therapysto` | Therapysto | staff | 0 |
| `/app/manage` | `Therapysto` | Therapysto | staff | 0 |
| `/app/settings` | `Therapysto` | Therapysto | staff | 0 |
| `/app/contact-support?from=staff-factor` | `Therapysto` | Therapysto | staff | 0 |
| `/legal/terms` | `Условия использования · Therapysto` | **Therapygo** | **patient** | 0 |
| `/app/patient/login` | `Therapygo` | Therapygo | `/manifest.webmanifest` | 0 |
| `/app/contact-support` | `Therapygo` | Therapygo | patient | 0 |

`/app/doctor`, `/app/patient`, `/app/patient/cabinet` → `307` на свой login (не сломано, редиректы целы).
Манифесты: staff `"name":"Therapysto"`, patient `"name":"Therapygo — забота о твоём здоровье"`.

Строка `/legal/terms` — это **`S-3`**, симптом открытого `A2b`, а не регрессия моей работы.

### 4.2 `T3`/`A4` — активные документы, правлено на месте

| Файл | Что заменено |
| --- | --- |
| `README.md:3` | «Монорепозиторий платформы BersonCare» → карта имён: Therapysto (`therapysto.ru`) у персонала, Therapygo (`therapygo.ru`) — общий вход пациентов, бренд клиники — у её пациентов; `BersonCare` — первая клиника-арендатор, в идентификаторах остаётся |
| `docs/PRODUCT_OVERVIEW.md:1,11` | заголовок и §«Суть»: платформа названа Therapysto, добавлена та же карта имён |
| `docs/ARCHITECTURE/SCREEN_ARCHITECTURE_GUIDE.md:1,42` | заголовок и «BersonCare — это два UI-мира» → кабинет специалиста Therapysto / приложение пациента Therapygo-или-бренд-клиники |
| `docs/ARCHITECTURE/SPECIALIST_CABINET_STRUCTURE.md:1` | «кабинета специалиста BersonCare» → «(Therapysto)» |
| `docs/ARCHITECTURE/TOOLING_AND_PACKAGES_DECISIONS.md:174,183-185` | три места, где продукт назван BersonCare |
| `apps/webapp/src/modules/auth/auth.md:3` | «(BersonCare webapp)» → Therapysto у персонала / Therapygo у пациентов + ссылка на `config/productSurfaces.ts` |

Сносок рядом со старым вариантом не добавлял — везде замена на месте.

### 4.3 `T3` — что сознательно НЕ переписал (владельцу списком, как просил бриф)

| Место | Почему не тронул |
| --- | --- |
| `bersoncare.ru` / `test.bersoncare.ru` — 95 вхождений в `deploy/**`, `SERVER CONVENTIONS.md`, `HOST_DEPLOY_README.md`, `AGENTS.md` | это **факт сегодняшнего деплоя**: там прямо сейчас живут PROD и TEST. Переезд на `therapysto.ru`/`therapygo.ru` — этап `B`. Заменить сейчас = сделать runbook'и ложными и опасными (в них `systemctl stop` и `curl` по этим адресам) |
| `# BersonCareBot` в `README.md:1`, `ARCHITECTURE.md:1`, `AGENTS.md:1`, `.cursor/rules/000-start-here.mdc` | имя **репозитория** (`dimmdao/BersonCareBot`), корзина 2 |
| `SERVER CONVENTIONS.md:50,53,296,332,673,679` | `BersonCareBot` там — граница скоупа документа («только наши vhost'ы, не storylama»), т.е. имя репозитория, а не продукта |
| `docs/ARCHITECTURE/FULL PLATFORM MODEL.md:37,371`, `PLATFORM_IDENTITY_SCENARIOS_AND_CODE_MAP.md:1` | «Backend платформа (BersonCareBot)» — тоже имя репозитория/бэкенда |
| `docs/ARCHITECTURE/BERSONCARE_SCREEN_SPECIFICATION.md` | правка неочевидна: имя в **имени файла**, переименование тянет входящие ссылки. Решение владельца |
| `docs/design/**` (33 файла, Design DNA v1.0/v1.1, дизайн-лаборатория) | «BersonCare Design DNA» — имя **дизайн-системы**, а не продукта; плюс это статические снимки прошлого UI. Переименование дизайн-системы — отдельное решение владельца |
| `docs/OWNER_DECISIONS.md:265` | дословная цитата владельца — история |
| `docs/ARCHITECTURE/ADMIN_ACCESS_MODEL.md:105` | цитирует литерал `'Пациент BersonCare'`, которого **в коде уже нет** (`git grep "Пациент BersonCare"` → 0 в `apps/`), и утверждает, что завести ключ может только пациент — а `app/app/account/StaffPasskeySection.tsx` уже существует. Документ протух по **существу**, а не по имени; правка задевает passkey, исключённый владельцем |

### 4.4 `T4` — хвосты

- `apps/webapp/src/config/config.md:12`: `usePatientSurfaceName()` → `useSurfaceName()` (хук переименован кругом 3, ссылка осталась мёртвой).
- Других ссылок на удалённое **нет**. Проверено перечислением, а не «не нашёл»:
  - `git grep -n "usePatientSurfaceName"` → в коде и активных доках 0; остались только отчёты кругов (корзина 3);
  - `git grep -n "app/manifest\b\|from '@/app/manifest'"` (файл `app/manifest.ts` удалён на этой ветке) → 2 вхождения, оба — пояснительный комментарий в `shared/lib/pwa/patientPwaManifest.ts:9,14` о том, что файл **был** там; это описание истории переезда, а не мёртвая ссылка;
  - `git grep -n "staffPwaLayoutMetadata"` → 4 вхождения, все живые (символ существует, `shared/lib/pwa/staffPwaLayoutMetadata.ts:11`);
  - `git diff --diff-filter=D --name-only feat/doctor-ui-rebuild...HEAD` → удалён ровно один файл, `apps/webapp/src/app/manifest.ts`.

---

## 5. `V4` — гейт

| Проверка | Команда | Итог |
| --- | --- | --- |
| typecheck | `pnpm --filter webapp typecheck` (после `rm -rf apps/webapp/.next/dev`) | **exit 0** |
| scoped lint | `npx eslint src/config src/shared/lib/surface src/shared/lib/pwa src/proxy.ts` | **exit 0**, 0 ошибок |
| затронутые тесты | `npx vitest run src/config/surfaceRoutes.unit.test.ts src/proxy.route.test.ts src/shared/lib/pwa/staffPwaManifest.unit.test.ts src/app-layer/operator-alerts/sendOperatorFallbackEmail.unit.test.ts` | **4 файла / 61 тест PASS** |
| живой прогон | `next dev -p 5347`, 12 маршрутов | §4.1 |

Full CI не гонялся. Деплоя, записи в TEST, обращений к БД и push — не было.

---

## 6. Открытые вопросы владельцу

**`Q1` (из `S-1`) — где чинить текст кода входа.** Письмо и SMS с кодом говорят «BersonCare» и это
видит **персонал**, а не только пациенты. Один путь обслуживает три разных правильных имени
(Therapysto / Therapygo / бренд клиники), поэтому строкой не лечится. Варианты:

- **(а)** оставить в этапе `C` вместе с остальным механизмом брендинга — тогда `TPB-15` закрывается в
  `C`, а не в `A`, и до тех пор специалист на Therapysto получает письмо «BersonCare». **Рекомендую**:
  так текст чинится один раз и правильно для всех трёх случаев.
- **(б)** вынести отдельным подэтапом `A5` прямо сейчас: webapp начинает передавать имя поверхности в
  `/api/bersoncare/send-email|send-sms|send-otp`, integrator и definer-функция теряют собственный
  дефолт. Это правка интегратора и SQL — оба запрещены текущим брифом, нужна отдельная команда.

**`Q2` — passkey и TOTP у персонала.** `passkeyAuth.ts:31 rpName: 'BersonCare'` и `totp.ts:51
issuer = 'BersonCare'` исключены владельцем 22.08 («паскей отложим потом, они выключены»). Отмечаю
факт: обе строки **видны персоналу** — `rpName` показывает ОС в системном окне ключа, `issuer` — в
приложении-аутентификаторе. Инженерная деталь на будущее: `rpName` — только отображаемое имя,
привязка к домену живёт в `rpId` (`appUrl.hostname`), так что смена `rpName` уже заведённые ключи не
ломает. Ничего не менял и не предлагаю менять до команды.

**`Q3` — `admin/` мёртв.** `admin/` (Vite-заглушка с текстом «Заглушка. Admin UI будет доступен на
admin.bersonservices.ru») **не входит в `pnpm-workspace.yaml`** — не собирается, не деплоится, в
продукт не попадает. Плюс упоминает третий домен, `admin.bersonservices.ru`, которого нет в карте
имён. Предлагаю удалить каталог отдельным решением; молча удалять не стал.

---

## 7. Находки без владельческой развилки (для плана, не работа этого хода)

- **`S-2` (оговорка к `TPB-16`).** Имя платформы прописано литералом ещё в двух местах помимо конфига:
  `apps/webapp/public/maintenance.html` (`Therapysto — обновление`, отдаёт nginx по `error_page
  502/503/504`, когда приложение лежит) и `apps/webapp/public/sw.js:64` (`title || 'Therapygo'`).
  Это **структурное** исключение, а не недоделка: оба файла — статика из `public/`, отдаются как есть
  и импортировать `config/productSurfaces.ts` не могут по построению. Круг 1 поймал их как F3 и
  заменил строку — правильно по факту, но «единый seam» строго говоря имеет две дырки, и это надо
  назвать вслух, а не считать закрытым.
- **`S-3` (симптом открытого `A2b`).** `/legal/terms` и `/legal/privacy` — единственные две страницы
  с собственным `export const metadata`. Они перекрывают только `title` (`… · Therapysto` через
  `PLATFORM_NAME`), а `apple-mobile-web-app-title`, `manifest` и иконки берут из корневого layout,
  который классифицирует `/legal` как пациентскую поверхность. Итог — одна страница с двумя
  идентичностями. Это ровно тот класс, который закрывал `A2a`; здесь он остался, потому что `A2b`
  открыт. Адрес назван, правку не делал — `A2b` в мой бриф не входит.

---

## 8. НЕ СДЕЛАНО

- `TPB-15` не закрыт — `S-1`, ждёт `Q1`.
- `A2b` (legal-страницы и остальной периметр) — не брался, в бриф не входил; симптом описан в `S-3`.
- auth-часть Gate A (`TPB-17`, `TPB-17a`, `TPB-19`) — не бралась ни одним из пяти заходов.
- `docs/ARCHITECTURE/BERSONCARE_SCREEN_SPECIFICATION.md`, `docs/design/**`, `ADMIN_ACCESS_MODEL.md:105`
  — не правил, причины в §4.3, решение владельца.
- Full CI не гонялся; приземления нет по режиму владельца.
- **Чужие правки в дереве.** На момент коммита в клоне лежали НЕ мои изменения (`admin/index.html`,
  `admin/src/App.tsx`, `apps/webapp/src/shared/ui/doctor/DoctorDnaFlatListRow.tsx`,
  `deploy/HOST_DEPLOY_README.md`, `docs/ARCHITECTURE/SERVER CONVENTIONS.md` — по одной строке в каждом,
  `Berson Care`/`BersonCare` → `Therapysto`, время правки 21:33, мои — 21:31). Я их **не коммитил**:
  коммичу только свои файлы поимённо. Владельцу стоит знать, что в этот клон писал кто-то ещё.

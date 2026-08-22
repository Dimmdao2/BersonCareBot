# Пересмотр объёма этапа `A` + закрытие `A3`/`A4` — 2026-08-22

**Ветка:** `wt/therapysto-stage-a-20260822`, клон `/home/dev/dev-projects/bcb-wt-therapysto-stage-a-20260822`.
**Что это:** пятый заход по этапу `A`, но первым делом — **пересмотр** того, что четыре предыдущих круга
объявили закрытым, и только потом остаток (`A3`, `A4`, хвост `config.md`).
**Приземления нет** — режим владельца из шапки `IMPLEMENTATION_PLAN.md`.

---

## 1. Главное первым: заявленное закрытие оказалось дырявым

Три из четырёх кругов заявляли закрытие, которое аудит опровергал, поэтому проверял независимо от
их отчётов. Единая точка идентичности и metadata-гейт держатся, но три заявления о полном закрытии
не подтвердились:

1. **`TPB-15` нельзя закрывать:** круги не увидели staff-visible OTP-текст вне webapp (`S-1`).
2. **`A1` закрыт только частично:** конфиг единый, но `PATIENT_APP_NAME` и `PATIENT_APP_ORIGIN` имеют
   defaults, хотя пункт плана требует обязательные deploy inputs без default бренда.
3. **`A4` закрыт только частично:** семь исправленных документов не были всем активным периметром;
   дополнительные SaaS-контракты исправлены этим ходом, а большой противоречивый domain-plan вынесен
   владельцу без самовольной переработки (§4.3).

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
| `A1` единый typed config | **закрыт частично** | Один config/seam есть: `config/productSurfaces.ts` + `config/productSurfaceNames.ts`, второго getter/store не найдено. Но `config/env.ts` задаёт `.default(PATIENT_DEFAULT_SURFACE_NAME)` и `.default(PATIENT_DEFAULT_SURFACE_ORIGIN)`, вопреки тексту пункта про обязательные deploy inputs. Самовольно удалять defaults нельзя: это меняет deploy-контракт. |
| `A2a` единый identity seam | **закрыт** | После закрытия legal-хвоста `git grep -n "export const metadata" -- apps/webapp/src/app` → **0**; единственная точка metadata — `app/layout.tsx:33 generateMetadata`. |
| `A2b` metadata-часть Gate A | **закрыт** | `surfaceRoutes.unit.test.ts` + `proxy.route.test.ts` + manifest test: 60 тестов PASS, §5. Гейт строит предикат из `config.matcher` самого `proxy.ts` — второй копии нет (`proxy.ts:131` фиксирует, что копия удалена) |
| `A2b` остаток (legal, периметр) | **закрыт** | Две route-local metadata-декларации удалены: legal теперь получает title/apple-title/manifest из одного root seam. Живой результат — §4.1. |
| `A3` инвентаризация по всему репо | **закрыт частично** | §3: весь tracked repo разложен по четырём корзинам. Найдены и исправлены два staff-visible литерала в standalone `admin/`; старое заявление «корзина пуста» было ложным. Не закрыт до конца из-за `S-1`. |
| `A4` активные документы | **закрыт частично** | §4.2: исправлены первоначальные семь и ещё семь active contract/runbook-групп. Большой `CLINIC_PUBLIC_PAGE_AND_URL_FLIP_2026-08-19.md` одновременно содержит новую карту и старый несовместимый domain-контракт; по указанию брифа вынесен списком, а не переписан на своё усмотрение (§4.3). |
| Gate A: auth tests | **не закрыт** | пункт этапом не брался ни разу; `TPB-17`/`TPB-17a`/`TPB-19` не реализованы |
| Gate A: lint + typecheck | **закрыт** | §5 |
| `TPB-01` | **закрыт частично** | staff-поверхность = Therapysto живьём (§4.1); но `S-1` — письмо с кодом входа персоналу; `passkeyAuth.ts:31 rpName` и `totp.ts:51 issuer` = `'BersonCare'` (исключены владельцем, `Q2`) |
| `TPB-03` | **закрыт частично** | Конфиг и patient manifest уже Therapygo, но требуемый отдельный full domain ещё не разведён по Host (этап `B`), а deploy inputs сейчас необязательны из-за defaults (`A1`). |
| `TPB-04` | **закрыт** | `git grep -rn "staff\.therapysto\|patient\.therapysto"` → **3** вхождения, все три — сам план и gap-report, где эти поддомены перечислены как ЗАПРЕЩЁННЫЕ. В коде, deploy-конфиге и активных доках — **0** |
| `TPB-15` | **НЕ закрыт** | `S-1` |
| `TPB-16` | **закрыт с оговоркой** | параллельных резолверов нет (см. `A1`); оговорка — `S-2`, два статических файла в `public/`, которые физически не могут импортировать конфиг |

---

## 3. `V2` — инвентаризация по ВСЕМУ репозиторию

Команда (все формы написания, все файлы под git, бинарники исключены; сам этот evidence-report исключён,
чтобы его команды и цитаты не делали census самоссылочным):

```
git grep -cIi "bersoncare\|berson care\|berson-care\|berson_care" -- . \
  ':(exclude)docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/SCOPE_REVIEW_STAGE_A_2026-08-22.md' \
  | awk -F: '{s+=$NF} END {print s}'
git grep -lIi "bersoncare\|berson care\|berson-care\|berson_care" -- . \
  ':(exclude)docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/SCOPE_REVIEW_STAGE_A_2026-08-22.md' | wc -l
```

**4817 вхождений в 1222 файлах** из 7210 tracked subject-файлов (7211 вместе с исключённым отчётом).

Узкий exact oracle из `TPB-15` измерен отдельно:

```
git grep -IhoE 'BersonCareBot|BersonCare|Berson Care|BersonAdmin' -- . \
  ':(exclude)docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/SCOPE_REVIEW_STAGE_A_2026-08-22.md' | wc -l  # → 887
git grep -IlE  'BersonCareBot|BersonCare|Berson Care|BersonAdmin' -- . \
  ':(exclude)docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/SCOPE_REVIEW_STAGE_A_2026-08-22.md' | wc -l  # → 305 файлов
git grep -IhoE 'BersonCareBot|BersonCare|Berson Care|BersonAdmin' 7b131875b -- . \
  ':(exclude)docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/SCOPE_REVIEW_STAGE_A_2026-08-22.md' | wc -l  # before → 924
```

Итого scoped exact inventory: **924 before → 887 after**. Отдельные найденные runtime-хвосты:
`git grep -nIE 'BersonCare|Berson Care|BersonAdmin' 7b131875b -- admin/index.html admin/src/App.tsx | wc -l`
→ **2 before**, та же команда без SHA → **0 after**; `git grep -n 'export const metadata' 7b131875b --
apps/webapp/src/app/legal | wc -l` → **2 before**, без SHA → **0 after**.

Эти 887 exact-вхождений разложены тем же `git grep -nIoE ... | awk -F:` с явными path predicates:
**386 technical / current-runtime facts в 131 файле; 462 history/evidence в 158 файлах; 39 stage-C
delivery copy в 16 файлах; 0 basket-1 после правки.** Stage-C predicate перечисляет 16 файлов в таблице
ниже; history predicate — `docs/_TODO/runs`, audit/review/research/evidence/log, `docs/archive`,
`docs/REPORTS`, `docs/design`, `.cursor/plans`; всё остальное вручную просмотрено как technical/current
host/repository identifier либо active-doc item §4.2–4.3. Сумма: `386 + 462 + 39 + 0 = 887`.

Разбивка по каталогам получена так:

```
git grep -cIi "bersoncare\|berson care\|berson-care\|berson_care" -- . \
 ':(exclude)docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/SCOPE_REVIEW_STAGE_A_2026-08-22.md' \
 | awk -F: '{n=$NF; sub(/:[0-9]+$/,"",$0); split($0,a,"/"); top=(a[2]!=""? a[1]"/"a[2] : a[1]); cnt[top]+=n} \
   END {for (t in cnt) printf "%6d  %s\n", cnt[t], t}' | sort -rn
```

### Корзина 1 — «правим сейчас» (user-visible имя продукта в staff-периметре)

Предыдущее утверждение «пусто» было неверным: оно снова измеряло только `apps/webapp/src`.
Whole-repo проход нашёл **2** user-visible литерала в standalone staff-admin surface:

- `admin/index.html`: `<title>Berson Care Admin</title>`;
- `admin/src/App.tsx`: `<h1>Berson Care Admin</h1>`.

Оба заменены на `Therapysto Admin`. `admin/` нельзя объявить мёртвым только по отсутствию в
`pnpm-workspace.yaml`: root `package.json` содержит `build:admin`, а оба активных host-runbook документа
фиксируют nginx `/admin/` → `127.0.0.1:8080`.

После правки webapp-периметр по-прежнему содержит только allowlist/отложенные строки:

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

Живая проверка — §4.1: на staff-маршрутах webapp `BersonCare` встречается **0** раз; standalone
`admin/` собран отдельно (§5).

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
  ':(exclude)docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/SCOPE_REVIEW_STAGE_A_2026-08-22.md' \
  | awk -F: '{s+=$NF} END {print s}'      # → 2773
```

**2773 вхождения** по широкому history-scope (команда выше; 619 файлов) — очередь аудита, архивы, отчёты кругов, прогоны,
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

`next dev -p 5210` из этого клона (порт 5200 не тронут), `.env.dev`.

| Маршрут | `<title>` | `apple-mobile-web-app-title` | manifest | `BersonCare` |
| --- | --- | --- | --- | ---: |
| `/` | `Therapysto — кабинет специалиста` | Therapysto | `/manifest-staff.webmanifest` | 0 |
| `/app/doctor/login` | `Therapysto` | Therapysto | staff | 0 |
| `/app/admin/login` | `Therapysto` | Therapysto | staff | 0 |
| `/app/manage` | `Therapysto` | Therapysto | staff | 0 |
| `/app/settings` | `Therapysto` | Therapysto | staff | 0 |
| `/app/contact-support?from=staff-factor` | `Therapysto` | Therapysto | staff | 0 |
| `/legal/terms` | `Therapygo` | Therapygo | patient | 0 |
| `/legal/privacy` | `Therapygo` | Therapygo | patient | 0 |
| `/app/patient/login` | `Therapygo` | Therapygo | `/manifest.webmanifest` | 0 |
| `/app/contact-support` | `Therapygo` | Therapygo | patient | 0 |

`/app/doctor`, `/app/patient`, `/app/patient/cabinet` → `307` на свой login (не сломано, редиректы целы).
Манифесты: staff `"name":"Therapysto"`, patient `"name":"Therapygo — забота о твоём здоровье"`.

До правки `/legal/*` смешивал title Therapysto с apple-title/manifest Therapygo. После удаления двух
route-local metadata-деклараций все metadata-поля legal-страниц снова приходят из одного root seam.

### 4.2 `T3`/`A4` — активные документы, правлено на месте

| Файл | Что заменено |
| --- | --- |
| `README.md:3` | «Монорепозиторий платформы BersonCare» → карта имён: Therapysto (`therapysto.ru`) у персонала, Therapygo (`therapygo.ru`) — общий вход пациентов, бренд клиники — у её пациентов; `BersonCare` — первая клиника-арендатор, в идентификаторах остаётся |
| `docs/PRODUCT_OVERVIEW.md:1,11` | заголовок и §«Суть»: платформа названа Therapysto, добавлена та же карта имён |
| `docs/ARCHITECTURE/SCREEN_ARCHITECTURE_GUIDE.md:1,42` | заголовок и «BersonCare — это два UI-мира» → кабинет специалиста Therapysto / приложение пациента Therapygo-или-бренд-клиники |
| `docs/ARCHITECTURE/SPECIALIST_CABINET_STRUCTURE.md:1` | «кабинета специалиста BersonCare» → «(Therapysto)» |
| `docs/ARCHITECTURE/TOOLING_AND_PACKAGES_DECISIONS.md:174,183-185` | три места, где продукт назван BersonCare |
| `apps/webapp/src/modules/auth/auth.md:3` | «(BersonCare webapp)» → Therapysto у персонала / Therapygo у пациентов + ссылка на `config/productSurfaces.ts` |
| `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/BRANDING_CAPABILITY_MATRIX.md` | platform defaults разведены на Therapysto staff/admin, Therapygo patient и бренд клиники на branded surface |
| `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/BRANDING_DOMAIN_CONTRACT.md` | активный BersonCare-as-platform контракт заменён текущей картой surface identities |
| `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md` | product-default retry назван platform default, без старого product name |
| `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/OWNER_RULINGS_2026-07-16.md` | старый fallback BersonCare заменён более поздним owner-решением 22.08: Therapysto/Therapygo |
| `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/OWNER_DECISION_PACKET.md` | resolved branding answer и staff workspace синхронизированы с более поздним owner-решением 22.08 |
| `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/TARGET_IA.md`, `ROUTE_MIGRATION_MAP.md` | target landing/legal contract больше не требует старое имя продукта |
| `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/ENTRY_AND_INVITE_JOURNEYS.md` | retry policy назван platform policy, а не BersonCare product default |
| `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/README.md` | цель инициативы больше не называет BersonCare продуктом |
| `deploy/HOST_DEPLOY_README.md`, `docs/ARCHITECTURE/SERVER CONVENTIONS.md` | ожидаемый текст уже существующей maintenance page синхронизирован с `Therapysto — обновление`; host/path факты не менялись |
| `apps/webapp/src/shared/ui/doctor/DoctorDnaFlatListRow.tsx` | активный комментарий doctor design vocabulary больше не называет продукт BersonCare |

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
| `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/UX02_PRODUCT_PATTERNS.md`, `UX02_TECHNICAL_PATTERNS.md`, `CURRENT_STATE_BASELINE.md`, `SCREEN_INVENTORY_PATIENT_PUBLIC.md`, `OWNER_REVIEW_2026-07-18.md` | research/baseline и датированные owner-цитаты описывают измеренное прежнее состояние; это history evidence, не активный target contract, поэтому не переписывались |
| `docs/ARCHITECTURE/ADMIN_ACCESS_MODEL.md:105` | цитирует литерал `'Пациент BersonCare'`, которого **в коде уже нет** (`git grep "Пациент BersonCare"` → 0 в `apps/`), и утверждает, что завести ключ может только пациент — а `app/app/account/StaffPasskeySection.tsx` уже существует. Документ протух по **существу**, а не по имени; правка задевает passkey, исключённый владельцем |
| `docs/_TODO/CLINIC_PUBLIC_PAGE_AND_URL_FLIP_2026-08-19.md:358-509` | большой активный документ уже содержит карту 22.08, но ниже оставляет несовместимые активные решения: wildcard `*.bersoncare.ru`, path вместо subdomain, старую cookie-модель и отсутствие redirect с platform alias на custom domain. Бриф велит такой неочевидный rewrite вынести владельцу списком; до решения `A4` остаётся частичным |

### 4.4 `T4` — хвосты

- `apps/webapp/src/config/config.md:12`: `usePatientSurfaceName()` → `useSurfaceName()` (хук переименован кругом 3, ссылка осталась мёртвой).
- Других ссылок на удалённое **нет**. Проверено перечислением, а не «не нашёл»:
  - `git grep -n "usePatientSurfaceName"` → в коде и активных доках 0; остались только отчёты кругов (корзина 3);
  - `git grep -nE "app/manifest\\b|from '@/app/manifest'" -- apps/webapp/src README.md docs/ARCHITECTURE deploy` (файл `app/manifest.ts` удалён на этой ветке) → 3 вхождения, все поясняют замену удалённого file-based manifest живым route handler: `app/manifest.webmanifest/route.ts:4`, `patientPwaManifest.ts:9,14`;
  - `git grep -n "staffPwaLayoutMetadata" -- apps/webapp/src` → 5 вхождений, все живые: declaration, import/return в `surfaceLayoutMetadata.ts` и три test call-site;
  - `git diff --diff-filter=D --name-only feat/doctor-ui-rebuild...HEAD` → удалён ровно один файл, `apps/webapp/src/app/manifest.ts`.

---

## 5. `V4` — гейт

| Проверка | Команда | Итог |
| --- | --- | --- |
| typecheck | `pnpm --filter webapp typecheck` | **exit 0** |
| scoped lint | `pnpm exec eslint src/app/legal/privacy/page.tsx src/app/legal/terms/page.tsx src/config src/shared/lib/surface src/shared/lib/pwa src/proxy.ts` | **exit 0**, 0 ошибок |
| затронутые unit-тесты | `pnpm exec vitest --run --project=unit src/config/surfaceRoutes.unit.test.ts src/shared/lib/pwa/staffPwaManifest.unit.test.ts` | **2 файла / 42 теста PASS** |
| proxy route-тест | `pnpm exec vitest --run --project=route src/proxy.route.test.ts` | **1 файл / 18 тестов PASS** |
| standalone admin build | `npm run build --prefix admin` | **exit 0**, Vite: 29 modules transformed |
| живой прогон | `next dev -p 5210`, 8 маршрутов + 2 manifest | §4.1, все HTTP 200 |

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

**`Q3` — статус отдельного `admin/`.** Это Vite-заглушка с текстом про `admin.bersonservices.ru`, которого
нет в новой карте имён. Однако считать каталог мёртвым нельзя: root `package.json` содержит `build:admin`,
а `deploy/HOST_DEPLOY_README.md:376` и `SERVER CONVENTIONS.md:349` фиксируют nginx route `/admin/` на
`127.0.0.1:8080`. Поэтому каталог не удалён; два видимых старых имени исправлены и build проверен. Владельцу
остаётся решить, нужен ли отдельный legacy admin surface и его домен.

**`Q4` — `A1`: defaults или обязательные deploy inputs.** Канонический checkbox требует обязательные
`PATIENT_APP_NAME`/`PATIENT_APP_ORIGIN` без default, но `env.ts` и прежний fixer-brief оставляют defaults
как «санкционированное ведущим отступление». Owner-решения, меняющего текст `A1`, exact search и `code-search`
не нашли. Поэтому ложный `[x]` снят; кодовый deploy-контракт без owner-решения не менялся.

**`Q5` — какой domain-контракт остаётся действующим.** В
`CLINIC_PUBLIC_PAGE_AND_URL_FLIP_2026-08-19.md:358-509` новая карта 22.08 соседствует со старыми решениями
про wildcard `*.bersoncare.ru`, path-first routing и отсутствие redirect на custom domain. Это большой
неочевидный rewrite; по прямому указанию брифа он перечислен, а не переписан. До выбора/сведения §9/§11/§12
`A4` остаётся частичным.

---

## 7. Находки без владельческой развилки (для плана, не работа этого хода)

- **`S-2` (оговорка к `TPB-16`).** Имя платформы прописано литералом ещё в двух местах помимо конфига:
  `apps/webapp/public/maintenance.html` (`Therapysto — обновление`, отдаёт nginx по `error_page
  502/503/504`, когда приложение лежит) и `apps/webapp/public/sw.js:64` (`title || 'Therapygo'`).
  Это **структурное** исключение, а не недоделка: оба файла — статика из `public/`, отдаются как есть
  и импортировать `config/productSurfaces.ts` не могут по построению. Круг 1 поймал их как F3 и
  заменил строку — правильно по факту, но «единый seam» строго говоря имеет две дырки, и это надо
  назвать вслух, а не считать закрытым.
- **`S-3` закрыт этим ходом.** `/legal/terms` и `/legal/privacy` были единственными страницами с
  собственным `export const metadata` и смешивали Therapysto-title с Therapygo manifest/apple-title.
  Декларации удалены; обе страницы получают цельную patient identity через root seam.

---

## 8. НЕ СДЕЛАНО

- `TPB-15` не закрыт — `S-1`, ждёт `Q1`.
- auth-часть Gate A (`TPB-17`, `TPB-17a`, `TPB-19`) — не бралась ни одним из пяти заходов.
- `A1` и `TPB-03` остаются частичными до решения про обязательность patient deploy inputs и Host split.
- `A4` остаётся частичным до owner-решения по конфликтующим §9/§11/§12 domain-plan.
- `docs/ARCHITECTURE/BERSONCARE_SCREEN_SPECIFICATION.md`, `docs/design/**`, `ADMIN_ACCESS_MODEL.md:105`
  — не правил, причины в §4.3, решение владельца.
- Full CI не гонялся; приземления нет по режиму владельца.
- Параллельный процесс успел отдельным коммитом `6eba13dc0` записать первый вариант пересмотра. Этот
  отчёт перечитан и исправлен по фактическому whole-repo проходу; текущий коммит содержит только явно
  перечисленные дополнительные файлы, без push/landing.

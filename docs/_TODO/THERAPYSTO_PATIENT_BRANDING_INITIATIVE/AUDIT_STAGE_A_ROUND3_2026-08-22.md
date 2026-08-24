# Независимый адверсарный аудит — этап A Therapysto, круг 3 (перестройка механизма идентичности)

**Дата:** 2026-08-22. **Проверяемый коммит:** `ebac98a89` (31 файл) поверх `c3136e23e` / `f8778803c` /
`f3361a4f3`. **Клон:** `/home/dev/dev-projects/bcb-wt-therapysto-stage-a-20260822`, ветка
`wt/therapysto-stage-a-20260822`.
**Прошлые вердикты:** `AUDIT_STAGE_A_2026-08-22.md` (`FAIL`, `F1`–`F4`),
`AUDIT_STAGE_A_ROUND2_2026-08-22.md` (`FAIL`, `R1`–`R3`).
**Оракул:** `IMPLEMENTATION_PLAN.md` — `TPB-08` («Branding влияет только на patient-facing surface;
staff/admin видят Therapysto»), `TPB-01`, `TPB-03`, `TPB-09`, `TPB-15`, `TPB-16`, Gate A.

Ничего не чинил. Единственный записанный файл — этот отчёт. PROD, TEST, деплой, БД, push не трогал;
порт 5200 не трогал (чужой сервер остался жив). Свои dev-серверы (5330, 5332, 5333, 5334) остановлены.

## Вердикт: `FAIL`

Перестройка сделана по-настоящему и большую часть класса действительно закрыла: обе находки круга 2
(`R1` `/app?intent=specialist`, `R2` `/app/clinic/invites/accept`) закрыты, проверено воспроизведением тех
же команд; гейт `R3` заведён и ловит шесть инъекций из шести, включая три, которых исполнитель не делал.

Но `FAIL` по двум причинам, и обе — про то же самое, ради чего затевался круг:

1. **Класс не закрыт: остался пятый staff-достижимый экран.** `/app/contact-support?from=clinic-demo` —
   кнопка «Демо для клиники» на лендинге Therapysto (4 места) — представляется Therapygo во всех полях
   и двумя видимыми брендовыми строками. Это ровно конструкция `R1` (тот же лендинг, тот же вид сигнала
   в URL), только другой параметр.
2. **Гейт не покрывает шов, на котором стоит весь механизм.** `matcher` из `proxy.ts` переписан вторым
   литералом в `surfaceRoutes.ts`; ничто не проверяет, что они совпадают. Инъекция «убрать `/` из
   matcher'а» оставляет гейт **33/33 зелёными**, а живой лендинг возвращает пациентский манифест,
   пациентские иконки и `apple-mobile-web-app-title: Therapygo` — то есть ровно тот отказ, который круг
   объявил закрытым.

Почему обход «149 маршрутов, 0 расхождений» это не поймал: ожидаемая поверхность в нём бралась из той же
таблицы, которую он проверял. Обход доказывает, что рантайм согласован с таблицей, и ничего не говорит о
том, верна ли сама таблица. Единственный способ поймать `R3-1` — идти не от дерева маршрутов, а от
staff-входов (что достижимо со staff-экрана одним кликом), чего ни один из трёх кругов не делал.

---

## Находки

### `R3-1` — `MUST FIX`. «Демо для клиники» с лендинга Therapysto ведёт на экран Therapygo

Нарушено `TPB-08`. Достижимо анонимно, брендовая строка видимая (не только метаданные).

Лендинг `/` — staff-маркетинг: `<title>Therapysto — кабинет специалиста</title>`. **Четыре** его CTA
(«Демо для клиники», «Запросить демо», «Запросить демо для клиники») ведут на
`/app/contact-support?from=clinic-demo`:

```
grep -rn 'href="/app/contact-support' apps/webapp/src/components/landing/
→ LandingFooter.tsx:54          /app/contact-support                  («Связь с поддержкой»)
→ FinalCta.tsx:27               /app/contact-support?from=clinic-demo («Демо для клиники»)
→ PracticePathsSection.tsx:73   /app/contact-support?from=clinic-demo («Запросить демо»)
→ PricingTeaserSection.tsx:32   /app/contact-support?from=clinic-demo («Демо для клиники»)
→ LandingHeader.tsx:162         /app/contact-support?from=clinic-demo («Запросить демо для клиники»)
```

Таблица `apps/webapp/src/config/surfaceRoutes.ts:95` классифицирует `/app/contact-support` как `patient`
с обоснованием «Обращение в поддержку с пациентского экрана входа» — то, что этот же URL является
единственным лид-адресом клиники со staff-лендинга, в правиле не учтено.

**Воспроизведение (живой прогон, dev-сервер этого клона на 5330, дефолтный env):**

```
curl -s "http://127.0.0.1:5330/app/contact-support?from=clinic-demo" \
  | grep -oE '<title>[^<]*</title>|<meta name="description" content="[^"]*"|<link rel="manifest" href="[^"]*"'
→ <title>Therapygo</title>
→ <meta name="description" content="Patient web application for Therapygo."
→ <link rel="manifest" href="/manifest.webmanifest"

# видимый текст страницы (теги вырезаны):
→ Therapygo Therapygo Написать в поддержку Сообщение уйдёт администратору. …
```

Иконки — пациентские (`/pwa-icon-192.png`, `/apple-touch-icon.png`), `apple-mobile-web-app-title:
Therapygo`. Клиентский переход подтверждён headless-браузером: hard load `/` даёт
`title: "Therapysto — кабинет специалиста"`, `manifest: /manifest-staff.webmanifest`; клик по CTA даёт
`title: "Therapygo"`, `manifest: /manifest.webmanifest`, `apple: Therapygo`.

**Что видит человек:** руководитель клиники читает страницу «Therapysto — кабинет специалиста», жмёт
«Демо для клиники» и попадает на экран с шапкой «Therapygo», формой «Сообщение уйдёт администратору» и
единственной ссылкой выхода «К входу» → `/app`. Значение `from=clinic-demo` страницей не читается вовсе
(`ContactSupportPageClient.tsx:18-24`, `:52` — `backNavFromSearchParams` знает только `verify`/`reset`/`login`,
остальное падает в дефолт), то есть staff-контекст теряется полностью.

**Почему это находка против плана, а не выдуманный скоуп.** `TPB-08` требует, чтобы staff видел
Therapysto. Круг 2 признал ровно эту конструкцию (`/app?intent=specialist` — CTA того же лендинга,
различимый параметром URL) нарушением `TPB-08` и её починили правилом с `query`. Здесь тот же лендинг,
тот же вид различимого сигнала (`from=clinic-demo`) и тот же механизм правил, который уже умеет
`query` — то есть чинится строкой в существующей таблице, ничего нового не заводя.

**Что НЕ находка и что — вопрос владельцу, а не работа:**

- Голый `/app/contact-support` (ссылка «Связь с поддержкой» в футере лендинга и ссылка с
  `/app/doctor/login` и `/app/admin/login`) сигнала в URL не несёт. Это тот же случай, что голый `/app`,
  закрытый владельцем 22.08 («никак, я сразу дам оба домена и мы переедем»). Находкой не считаю.
- Отдельный вопрос владельцу, работу из него не вывожу: **должна ли заявка на демо клиники вообще вести
  на пациентскую форму поддержки** («Сообщение уйдёт администратору») — это продуктовое решение, а не
  дефект идентичности.

### `R3-2` — `MUST FIX`. Гейт `R3` слеп к `matcher`'у proxy — второму месту, где записан тот же факт

Нарушено `TPB-16` («не создаёт параллельных getters/resolvers/stores») и подорвана доказательная сила
metadata-части Gate A.

Механизм стоит на том, что путь до корневого layout доносит заголовок из `proxy.ts`, а значит — на
`config.matcher` (`apps/webapp/src/proxy.ts:134`). Этот же факт записан ВТОРОЙ раз, литералом, в
`apps/webapp/src/config/surfaceRoutes.ts:201` (`isSurfaceHeaderCarryingPath`), и именно вторую копию
читает тест покрытия (`surfaceRoutes.unit.test.ts:114` — «маршруты вне matcher proxy классифицированы как
patient»). Согласованность двух копий не проверяет ничто.

**Инъекция неисправности (моя, исполнитель её не делал):** убрать `/` из `config.matcher`.

```
# правка: matcher: ['/', '/app', …]  →  matcher: ['/app', …]
pnpm exec vitest --run src/config/surfaceRoutes.unit.test.ts
→ Test Files 1 passed (1) · Tests 33 passed (33)          ← гейт НЕ покраснел

# живой dev-сервер этого клона на 5332 с той же правкой:
curl -s http://127.0.0.1:5332/ | grep -oE '<link rel="manifest" href="[^"]*"|<meta name="apple-mobile-web-app-title" content="[^"]*"'
→ <link rel="manifest" href="/manifest.webmanifest"        ← пациентский манифест на staff-лендинге
→ <meta name="apple-mobile-web-app-title" content="Therapygo"
→ иконки: /pwa-icon-192.png, /pwa-icon-512.png, /apple-touch-icon.png   (ни одной staff-ной)
```

То есть одна строка в `proxy.ts`, к `surfaceRoutes.ts` не относящаяся, молча возвращает ровно тот отказ,
ради которого круг затевался, и все 33 теста остаются зелёными. Правка возвращена, `git status` чист.

Заявление коррекции «маршруты вне matcher'а классифицированы как `patient` — тест проверяет, что это
совпадение не случайно» верно ровно настолько, насколько верна вторая копия matcher'а. Чинится тем же
принципом «один chokepoint», который применён ко всему остальному в этой работе: matcher должен строиться
из одного источника, а не переписываться литералом.

### `R3-3` — `SHOULD FIX`. `x-bc-pathname` от клиента не затирается вне matcher'а — вопреки прямой директиве владельца

`§2.1` плана, директива владельца 22.08 дословно: **«надо так, как делают, а не как мы придумали»**, и
относится она в том числе к правилу «затирать входящие `x-tenant-*`». `x-bc-pathname` — ровно такой
внутренний заголовок доверия: `proxy.ts:118` перезаписывает клиентское значение, но только внутри
`config.matcher`. На маршрутах вне его (`/legal/**`, `/book/**`, `/join/**`, `/[clinicSlug]`,
`/[clinicSlug]/booking`) клиентское значение доходит до RSC как есть.

**Воспроизведение (5330, дефолтный env):**

```
curl -s http://127.0.0.1:5330/book/demo-slug -H 'x-bc-pathname: /app/doctor' \
  | grep -oE '<title>[^<]*</title>|<link rel="manifest" href="[^"]*"'
→ <title>Therapysto</title>
→ <link rel="manifest" href="/manifest-staff.webmanifest"     (без заголовка — Therapygo/manifest.webmanifest)

то же на /legal/terms и /bersoncare → staff-идентичность целиком (title, description, manifest,
иконки, apple-title).

Контроль, внутри matcher'а заголовок затирается корректно:
curl -s http://127.0.0.1:5330/app/patient/login -H 'x-bc-pathname: /app/doctor'  → Therapygo (не поддалось)
curl -s http://127.0.0.1:5330/app/doctor/login  -H 'x-bc-pathname: /app/patient' → Therapysto (не поддалось)
```

**Оценка последствия — честно, без раздувания.** Сегодня оно косметическое и третьим лицом не
эксплуатируется: произвольный заголовок нельзя навесить на переход по ссылке/форме, только на `fetch`,
ответ которого браузер как страницу не отрисует. Поднимаю не поэтому, а по двум причинам:

- директива владельца по этому классу правил уже записана в плане (`§2.1`) — то есть это гейт против
  плана, а не мой вкус;
- этот же заголовок читает **не только** идентичность: `modules/platform-access/onboardingServerActionSurface.ts:16`
  решает по нему, разрешён ли onboarding-only server action. Эта часть **предсуществующая**: до
  `ebac98a89` proxy ставил заголовок ТОЛЬКО для `/app/patient`, то есть подделка была возможна и внутри
  matcher'а, и аудируемая работа этот участок как раз **сузила**. Обхода гейта я не воспроизводил и
  регрессии здесь не утверждаю — фиксирую как контекст: заголовок стал шире по назначению, а зона, где
  он не затирается, осталась.

### `R3-4` — `NICE FIX`. Модульная документация ссылается на удалённый хук

`apps/webapp/src/config/config.md:12` предписывает `'use client'`-компонентам брать имя через
`usePatientSurfaceName()` — хук переименован в `useSurfaceName()` этим же коммитом, старого имени в коде
не осталось (`grep -rn "usePatientSurfaceName" apps/webapp/src/` → единственное вхождение и есть эта
строка документа). Следующий агент, читающий модульную доку перед правкой, получит несуществующее имя.

---

## Проверено — проблем нет

Числа приведены вместе с командами, которыми получены. Живые прогоны — dev-серверы ЭТОГО клона на 5330
(дефолтный env), 5332 (инъекция matcher'а), 5333 (`PATIENT_APP_NAME=QA-Renamed`), 5334 (регенерация
типов); все остановлены, `ss -ltn | grep ':53[0-9][0-9]'` → пусто. Порт 5200 не трогал.

**1. Находки круга 2 закрыты — перемерено теми же командами, не по отчёту.**

| Маршрут | title | description | manifest | apple-title | иконки |
| --- | --- | --- | --- | --- | --- |
| `/` | `Therapysto — кабинет специалиста` | своё (лендинг) | `manifest-staff` | `Therapysto` | staff |
| `/app?intent=specialist` (`R1`) | `Therapysto` | `…администратора Therapysto.` | `manifest-staff` | `Therapysto` | staff |
| `/app/clinic/invites/accept` (`R2`) | `Therapysto` | то же | `manifest-staff` | `Therapysto` | staff |
| `/app/doctor/login`, `/app/admin/login` | `Therapysto` | то же | `manifest-staff` | `Therapysto` | staff |
| `/app`, `/app/patient/login` | `Therapygo` | `Patient web application…` | `manifest` | `Therapygo` | patient |

`Therapygo`×0 на всех staff-строках таблицы, `Therapysto`×0 на пациентских (`grep -c` по телу ответа).

**2. Маршруты вне matcher'а отдают пациентскую идентичность** — то, что подозревал ведущий. Проверено
прогоном, а не рассуждением: `/book/demo-slug`, `/join/abc`, `/bersoncare`, `/bersoncare/booking`,
`/legal/terms`, `/legal/privacy` → `Therapygo` + `/manifest.webmanifest` + пациентские иконки.
Механизм «одна точка применения» на них действительно не работает — результат верен дефолтом
`resolveRequestSurface(null) === 'patient'`, и это состояние заморожено тестом
(`surfaceRoutes.unit.test.ts:114`), а не оставлено на удачу. С оговоркой `R3-2` — тест проверяет вторую
копию matcher'а.

**3. Подделка заголовка внутри matcher'а невозможна** — см. контроль в `R3-3`.

**4. Пациентский манифест после переезда в route handler — контракт цел.** Тело сверено с
`git show ebac98a89^:apps/webapp/src/app/manifest.ts`: `id: /app`, `scope: /app`,
`start_url: /app/patient`, name/short_name/description/иконки/цвета — поле в поле те же. URL прежний
(`/manifest.webmanifest`), `Content-Type: application/manifest+json; charset=utf-8`, ровно одна
`<link rel="manifest">` на страницу. Staff-манифест (`id: /app-staff`, `start_url: /app/doctor`) не
изменён и не перекрывает пациентский: на пациентских маршрутах отдаётся `/manifest.webmanifest`, на
staff — `/manifest-staff.webmanifest`, ни одного случая наоборот на 9 проверенных маршрутах.

**5. Гейт `R3` — ловит класс. Шесть инъекций, шесть пойманы, ложных срабатываний нет.** Три инъекции
исполнителя воспроизвёл, три добавил свои:

| Инъекция | Результат |
| --- | --- |
| Убрать правило поддерева `/app/clinic` | 2 теста красных, `+ "/app/clinic/invites/accept"` в неклассифицированных |
| Объявить `/app/doctor` пациентским | 4 теста красных |
| Новая верхнеуровневая страница `/partners` | 1 тест красный (заморозка сегментов) |
| **моя:** новое неклассифицированное поддерево `/app/billing` | 1 тест красный: `expected [ '/app/billing' ] to deeply equal []` |
| **моя:** объявить `/legal` staff-поверхностью (маршрут вне matcher'а) | 2 теста красных |
| **моя, контроль:** новая страница внутри уже классифицированного `/app/doctor` | 33/33 зелёных — ложного срабатывания нет |

Инъекция «убрать `/` из matcher'а proxy» — единственная непойманная, вынесена в `R3-2`.
После каждой инъекции дерево возвращалось в исходное (`git status --porcelain` → пусто).

**6. `TPB-09` — deploy-config меняет только пациентскую поверхность.** Сервер 5333 с
`PATIENT_APP_NAME=QA-Renamed`:

```
/app, /app/patient/login, /app/contact-support, /book/x  → title QA-Renamed, Therapygo×0, Therapysto×0
/manifest.webmanifest → "name":"QA-Renamed — забота о твоём здоровье","short_name":"QA-Renamed"
/, /app?intent=specialist, /app/doctor/login, /app/admin/login, /app/clinic/invites/accept
       → QA-Renamed×0, Therapysto×N, manifest-staff
/manifest-staff.webmanifest → "name":"Therapysto"  (не тронут)
```

Утечки пациентского имени в staff-поверхность, найденной в круге 2, нет.

**7. Soft-navigation — проверено живым браузером (headless Chromium, CDP), а не только flight-payload.**
Метаданные теперь живут в корне, и вопрос был именно в этом. Обе стороны и выход за matcher:

```
hard  /                        → title «Therapysto — кабинет специалиста», manifest-staff, icon staff
soft  → /app/contact-support   → title «Therapygo», manifest.webmanifest, apple Therapygo, icon patient
hard  /app/patient/login       → «Therapygo», manifest.webmanifest, видимая шапка «Therapygo»
soft  → /app/doctor/login      → «Therapysto», manifest-staff, видимая шапка «Therapysto»
soft  / → /legal/terms         → manifest.webmanifest, apple Therapygo  (чужой заголовок не залип)
```

Чужой идентичности после клиентского перехода не остаётся ни в одну сторону, включая переход на маршрут
вне matcher'а. RSC-payload сверен отдельно: `curl -H 'RSC: 1'` на `/`, `/app/doctor/login`,
`/app?intent=specialist` содержит `manifest-staff.webmanifest`, на `/app/patient/login` и
`/app/contact-support` — `manifest.webmanifest`.

**8. `TPB-16` — второго места, где спеллится имя, нет; машинерии сверх задачи нет.**

```
grep -rn "'Therapysto'\|'Therapygo'" apps/webapp/src --include=*.ts --include=*.tsx | grep -v .test.
→ productSurfaceNames.ts:23, :24 — и всё (остальные вхождения — текст комментариев/why)
```

31 файл раскладывается без остатка: 3 новых модуля (таблица, метаданные поверхности, чтение заголовка) +
1 новый тест-гейт + перенос манифеста (2 файла) + корневой layout + proxy + `AppEntryRsc` + 9 удалённых
объявлений + 7 потребителей переименованного хука + `PlatformProvider` + правка staff-теста + доккоммент
+ 2 документа. Нового store/getter/dispatcher нет, второго резолвера нет.

**9. Секрет в клиентский бандл не утёк.** Ни один `'use client'`-файл не импортирует `@/config/env` или
`@/config/productSurfaces` (проверено обходом всех файлов с директивой); в клиентских чанках
`DATABASE_URL`, `SESSION_SECRET`, `SMTP_PASSWORD`, `YANDEX_CLIENT_SECRET`, `TELEGRAM_BOT_TOKEN`,
`loadEnv` — 0 вхождений; единственное вхождение `APP_BASE_URL` — `NEXT_PUBLIC_APP_BASE_URL`, публичный
по назначению. Разделение `productSurfaceNames.ts` (литералы, безопасно для клиента) и
`productSurfaces.ts` (env) держится.

**10. Регрессий по прошлым кругам нет.**
- Привязка passkey к домену цела: `modules/auth/passkeyAuth.ts:32` — `rpId: appUrl.hostname`,
  `expectedOrigin: appUrl.origin`; файл этим коммитом не тронут (в диффе только патиентский UI-текст
  `PasskeySection.tsx`).
- Запрещённые файлы не тронуты: в диффе нет `public/sw.js`, `maintenance.html`, `apps/integrator/**`,
  `shared/lib/buildCalendarLinks.ts` (проверено `git show --name-only ebac98a89`); вне `apps/webapp/src`
  изменены только 2 документа инициативы.
- Юридические страницы отвечают 200 и сохраняют своё название в `<title>` (`… · Therapysto`).
- Мёртвых ссылок на удалённое не осталось: `from '@/app/manifest'` → 0, `usePatientSurfaceName` в коде → 0
  (только доккомментарий, см. `R3-4`).

**11. Gate A — прогоны воспроизведены самостоятельно.**

```
pnpm exec tsc --noEmit                                                  → exit 0  (1m12s)
pnpm exec vitest --run src/config/surfaceRoutes.unit.test.ts \
  src/shared/lib/pwa/staffPwaManifest.unit.test.ts src/proxy.route.test.ts \
  src/shared/ui/auth/staffSecurityErrorText.unit.test.ts                → 4 файла / 53 теста PASS
find apps/webapp/src/app -name page.tsx -not -path "*/api/*" | wc -l    → 149  (число из отчёта сходится)
```

Оговорка по typecheck, чтобы следующий не потерял на этом час: при живом `next dev` этой версии
(Next 16.2.11) генератор пишет битый `.next/dev/types/routes.d.ts` (обрывает doc-комментарий и дописывает
второй копией), и `tsc` падает десятком `TS1128/TS1005` в сгенерированном файле. К коду отношения не
имеет — содержимое битого куска это боилерплейт про `/api/users/[id]`, воспроизводится после полной
регенерации и уходит вместе с `rm -rf .next/dev`. Именно так получен `exit 0` выше.

---

## Вопросы владельцу (работу из них не вывожу)

1. **Заявка на демо клиники ведёт на пациентскую форму поддержки** — см. `R3-1`. Идентичность экрана
   чинится правилом таблицы; но верен ли сам адрес назначения для этого CTA — продуктовое решение.
2. **Установка PWA с лендинга `/` теперь даёт приложение персонала** (`id: /app-staff`) вместо
   пациентского. Исполнитель этот пункт поднял сам и решение не принимал — подтверждаю, что это
   действительно смена наблюдаемого поведения, а не косметика: `/` отдаёт `manifest-staff.webmanifest`
   и staff-иконки. Уже установленные приложения не задеты (`id` обоих манифестов не менялись).
3. **Голый `/app/contact-support`** (футер лендинга, ссылки с `/app/doctor/login` и `/app/admin/login`)
   различимого сигнала в URL не несёт — это тот же случай, что голый `/app`, закрытый 22.08. Если
   решение по `/app` изменится вместе с выдачей двух доменов, этот адрес поедет за ним.
4. **`rpName: 'BersonCare'`** в системном диалоге passkey (`modules/auth/passkeyAuth.ts:31`) — остаток
   `TPB-15`. Владелец 22.08 вывел passkey/TOTP issuer из этапа A («паскей отложим потом, они
   выключены»), поэтому находкой не считаю; фиксирую, чтобы не потерялось к этапу, где вернётся.
5. **`/legal/**` несогласованы между собой:** видимый `<title>` — `… · Therapysto`, а
   `apple-mobile-web-app-title` — `Therapygo`, манифест пациентский. Пункт `A2b` (legal) в плане открыт,
   поэтому это не находка; отмечаю, чтобы `A2b` не закрыли, посмотрев только на `<title>`.

## Что осталось открытым по плану (не проверял — вне этого круга)

`A1`, `A2b`, `A3`, `A4` и auth-часть Gate A открыты по самому плану. Приземление не предлагаю: в шапке
плана режим владельца — ни один этап не сводится в `feat` до его команды.

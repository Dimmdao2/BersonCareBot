# Независимый адверсарный аудит — этап A Therapysto, круг 4 (финальный гейт)

**Дата:** 2026-08-22. **Проверяемый коммит:** `1fe5f5660` (3 файла кода + 2 документа), клон
`/home/dev/dev-projects/bcb-wt-therapysto-stage-a-20260822`, ветка `wt/therapysto-stage-a-20260822`,
HEAD `c67076444` (merge `feat/doctor-ui-rebuild` поверх; в поверхностные файлы он не заходил —
`git diff --stat 1fe5f5660 HEAD` не содержит ни `proxy.ts`, ни `config/surfaceRoutes*`).
**Прошлые вердикты:** `AUDIT_STAGE_A_2026-08-22.md` (`FAIL`), `AUDIT_STAGE_A_ROUND2_2026-08-22.md`
(`FAIL`), `AUDIT_STAGE_A_ROUND3_2026-08-22.md` (`FAIL`).
**Оракул:** `IMPLEMENTATION_PLAN.md` — `TPB-08`, `TPB-16`, Gate A.

Ничего не чинил. Единственный записанный файл — этот отчёт; после каждой инъекции файлы возвращены
побайтно (`md5sum` сверен, `git status` пуст). PROD, TEST, деплой, БД, push не трогал. Порт 5200 не
трогал — чужой сервер на нём жив. Свои dev-серверы (5341, 5342) остановлены.

## Вердикт: `PASS`

Оба пункта круга закрыты по факту, а не по отчёту, и класс закрыт независимым измерением:

1. **`Z1` — гейт перестал быть слепым к matcher'у.** Инъекция круга 3 («убрать `/` из
   `config.matcher`») воспроизведена мной: гейт краснеет двумя тестами и называет виновный маршрут.
2. **`Z2` — лид-адрес клиники отдаёт Therapysto.** Живой прогон и клик подтверждают; пациентская
   форма поддержки без параметра не задета.
3. **Класс закрыт от входов, а не от таблицы.** Двумя своими измерениями (обход исходников целиком и
   живой обход 284 ссылок с 22 staff-экранов, включая ЗАЛОГИНЕННЫЕ кабинеты доктора и админа, чего не
   делал ни один из четырёх кругов) новых staff-достижимых экранов с пациентской идентичностью не
   найдено: **281 из 284** ссылок отдают Therapysto, три оставшиеся — известные и закрытые случаи.
4. **Утверждение про литерал matcher'а проверено сборкой**, а не чтением: с константой
   `next build` → exit 1 с той самой ошибкой Next.
5. **Регрессии по кругам 1–3 нет** ни по одному из восьми пунктов.
6. **Скоуп не разогнан:** 3 файла кода, +91/−15 строк, новой машинерии нет.

Остаётся одна находка — **`R4-1`, `SHOULD FIX`, не блокирующая**: гейт закрыл ту копию шва, на которую
указал круг 3, но остальную часть того же шва (два оператора в `proxy.ts`, которые заголовки реально
ставят, и единственная точка применения в корневом layout) не покрывает никто. Живого дефекта из этого
сегодня нет — это стойкость гейта к будущей правке. **Требования «покрыть тестом каждую строку шва» в
плане владельца нет**, поэтому в `FAIL` я это не вывожу и отдельного круга под это не предлагаю (см.
«Почему `PASS`, а не пятый круг»).

---

## Находка

### `R4-1` — `SHOULD FIX`. Гейт по-прежнему пропускает инъекцию в тот же шов: сами операторы проброса

Круг 3 сформулировал проблему как «matcher записан дважды». Копию удалили, и гейт теперь строит
предикат из `config.matcher` самого `proxy.ts` — это верно и проверено. Но шов «путь запроса доезжает
до идентичности» состоит из трёх звеньев, а гейт проверяет одно:

| Звено | Файл, строка | Покрыто гейтом |
| --- | --- | --- |
| ГДЕ ставится заголовок (`config.matcher`) | `apps/webapp/src/proxy.ts:147` | **да** (после круга 4) |
| ЧТО ставится — два `requestHeaders.set(...)` | `apps/webapp/src/proxy.ts:118-119` | **нет** |
| ГДЕ применяется — `generateMetadata` корня | `apps/webapp/src/app/layout.tsx:33-35` | **нет** |

Тестов, упоминающих `x-bc-pathname`/`x-bc-search`, в репозитории нет вообще:

```
grep -rln "x-bc-search\|x-bc-pathname" apps/webapp/src --include=*.test.ts --include=*.test.tsx
→ (пусто)
```

**Инъекция (моя; реалистичный рефактор — строка убрана ВМЕСТЕ с импортом, поэтому линтер молчит):**

```
# apps/webapp/src/proxy.ts:119 — удалить requestHeaders.set(SURFACE_SEARCH_HEADER, …)
#                       :25  — убрать SURFACE_SEARCH_HEADER из импорта
pnpm exec vitest --run --project=unit src/config/surfaceRoutes.unit.test.ts
→ Test Files 1 passed (1) · Tests 39 passed (39)        ← гейт НЕ покраснел
pnpm exec eslint src/proxy.ts                           → exit 0
```

**Что при этом видит человек** (живой dev-сервер этого клона на 5341, дефолтный env, та же правка):

| URL | до инъекции | после инъекции |
| --- | --- | --- |
| `/app?intent=specialist` | `Therapysto` / `manifest-staff` | **`Therapygo` / `manifest`** ← регрессия `R1` круга 2 |
| `/app?devView=registration` | `Therapysto` | **`Therapygo`** |
| `/app/contact-support?from=clinic-demo` | `Therapysto` | **`Therapygo`** ← регрессия `R3-1` круга 3 |
| `/app/contact-support?from=staff-factor` | `Therapysto` | **`Therapygo`** ← регрессия правки этого круга |
| `/` и `/app/doctor/login` | `Therapysto` | `Therapysto` (путь-заголовок цел) |

То есть одна удалённая строка молча возвращает ТРИ уже закрытых находки сразу, и весь гейт при этом
зелёный. Правка возвращена, после возврата все четыре URL снова отдают `Therapysto`.

**Ещё три инъекции того же шва, которые гейт пропускает** (39/39 зелёные в каждой):

| # | Правка | Последствие |
| --- | --- | --- |
| `И-2` | удалить `requestHeaders.set(SURFACE_PATHNAME_HEADER, pathname)` (`proxy.ts:118`) | ВСЯ staff-зона отдаёт пациентскую идентичность |
| `И-3` | `generateMetadata` корня → `surfaceLayoutMetadata('patient')` (`layout.tsx:34`) | то же, с другого конца шва |
| `И-4` | убрать `'/api/:path*'` из `config.matcher` | заголовки и `decideCsrfOrigin` перестают работать на `/api/**`; гейт смотрит только на страничные маршруты, поэтому не видит |

**Чем это чинится, если ведущий решит чинить** (называю адрес, потому что правка стоит одного слова):
`apps/webapp/src/proxy.route.test.ts` уже существует и уже импортирует `proxy` — там достаточно одного
теста «`proxy(request)` на staff-пути кладёт оба заголовка, и `resolveRequestSurface` от них даёт
`staff`». Новой машинерии, нового файла и второго источника это не требует.

---

## Что проверил и проблем не нашёл

Числа — вместе с командой. Все живые прогоны — dev-серверы ЭТОГО клона: 5341 (дефолтный env),
5342 (`PATIENT_APP_NAME=QA-Renamed`); оба остановлены (`ss -ltn | grep ':534[0-9]'` → пусто,
живыми остались только два чужих процесса на 5200).

### 1. `Z1` — инъекция круга 3 воспроизведена, гейт краснеет

```
# исходное состояние
pnpm exec vitest --run --project=unit src/config/surfaceRoutes.unit.test.ts
→ Test Files 1 passed (1) · Tests 39 passed (39)

# matcher: ['/', '/app', …] → ['/app', …]   (ровно инъекция круга 3, при которой было 33/33 зелёных)
→ Test Files 1 failed (1) · Tests 2 failed | 37 passed (39)
  × каждый staff-маршрут накрыт matcher-ом proxy
  × маршруты вне matcher proxy классифицированы как patient
```

Ещё две инъекции в таблицу — обе пойманы, то есть гейт держит и класс «новый маршрут»:

```
# создан src/app/app/onboarding/page.tsx (новая staff-страница вне правил)
→ × ни один маршрут не остался без правила            (1 failed | 38 passed)
# создан src/app/partners/page.tsx (новый верхнеуровневый сегмент)
→ × верхнеуровневые сегменты заморожены                (1 failed | 38 passed)
# оба каталога удалены → 39 passed (39)
```

### 2. `Z2` — лид-адрес клиники и staff-фактор отдают Therapysto (живой прогон + клик)

Сервер 5341, дефолтный env:

| URL | title | manifest | иконки | видимый текст |
| --- | --- | --- | --- | --- |
| `/app/contact-support?from=clinic-demo` | `Therapysto` | `manifest-staff` | staff | `Therapysto`×9, `Therapygo`×0 |
| `/app/contact-support?from=staff-factor` | `Therapysto` | `manifest-staff` | staff | `Therapysto`×9, `Therapygo`×0 |
| `/app/contact-support` (без параметра) | `Therapygo` | `manifest` | пациентские | `Therapygo`×9, `Therapysto`×0 |

**Клиентская навигация проверена в ОБЕ стороны, а не в одну.** Замечание к методу круга 4: его
headless-проверка гоняла staff→staff (лендинг → `?from=clinic-demo`) и patient→patient (пациентский
вход → `/app/contact-support`); в обоих случаях ответ выглядел бы верным, даже если бы метаданные при
soft-навигации вообще не обновлялись. Разводящие направления (headless Chromium 1228):

```
HARD  /                        → «Therapysto — кабинет специалиста», manifest-staff, apple Therapysto
SOFT  клик «Войти» → /app      → «Therapygo», manifest.webmanifest, apple Therapygo   (staff → patient)
HARD  /app (эталон)            → то же самое — совпадает

HARD  /app/patient/login       → «Therapygo», manifest, apple Therapygo, icon /apple-touch-icon.png
SOFT  клик → /app/doctor/login → «Therapysto», manifest-staff, apple Therapysto,
                                 icon /staff-pwa-apple-touch.png                      (patient → staff)
HARD  /app/doctor/login (эталон) → то же самое — совпадает
```

Идентичность при soft-навигации меняется целиком: title, manifest, apple-title, иконка и видимый текст.

### 3. Класс закрыт: обход ОТ staff-входов, собранный ДВУМЯ своими способами

Список входов исполнителя (16 строк, три источника) я не проверял на полноту его же методом — собрал
свой и сравнил.

**Способ А — по всем исходникам, а не по семи файлам.** Все строковые литералы-пути в `src`, каждый
прогнан через настоящую `classifyRequestSurface`:

```
grep -rnoE "['\"\`]/(app|book|join|legal)[A-Za-z0-9/_?=&%.:#-]*" src/ --include=*.ts --include=*.tsx
→ 943 вхождения, 250 уникальных целей
tsx: classifyRequestSurface(path, query) по каждой
→ staff 138 · patient 96 · без правила 16
```

Из 96 пациентских целей на staff-исходник ссылаются: `/app` (5 CTA лендинга + кнопка со staff-страницы
приглашения `InviteAcceptClient.tsx:185`), `/app/contact-support` (футер лендинга), `/legal/*`,
`/join`, `/book/` и `/app/patient/*` — последние это `revalidatePath(...)` в серверных экшенах доктора,
а не навигация. Новых staff-достижимых экранов нет. 16 «без правила» — это `/app/platform/**`, легаси-URL,
которые `doctorRouteRedirects` отдаёт 308-редиректом на `/app/admin/**` ДО того, как считается
идентичность; живого экрана за ними нет.

Полнота сигналов в URL на `/app/contact-support` проверена отдельно:

```
grep -rhoE "from=[a-z-]+" src/ --include=*.ts --include=*.tsx | sort | uniq -c
→ 5 clinic-demo · 1 staff-factor · 1 login · 1 verify   (daily/reminder/start/webapp — пациентские deep-link, другой путь)
grep -rn "withContactSupportReturn(" src/   → ровно два вызова: 'staff-factor' (staff-шаг 2ФА) и 'verify' (общий)
```

То есть staff-сигналов на этом пути ровно два, и оба теперь классифицированы `staff`. Набор полный.

**Способ Б — живой обход по DOM, включая залогиненные кабинеты** (этого не делал ни один круг: все
предыдущие обходы были анонимными). 22 staff-страницы-сида, из них 14 под сессией владельца-доктора
(`dimmdao@yandex.ru`) и владельца-админа (`dimmdao@gmail.com`); с каждой собраны все внутренние
`href`, затем КАЖДАЯ ссылка открыта живьём и прочитана её идентичность с провода:

```
сиды: / · /app?intent=specialist · /app/doctor/login · /app/admin/login ·
      /app/clinic/invites/accept?token=abc · /app/contact-support?from=clinic-demo|staff-factor ·
      /app/doctor · /schedule · /patients · /communications · /content · /app/settings ·
      /app/account · /app/manage · /app/doctor/install · /app/admin/{system-health,technical,
      commercial,auth,booking}
→ 284 уникальные внутренние ссылки
→ staff-идентичность: 281 · пациентская: 3
```

Три пациентские — все известные и закрытые:

| Ссылка | Откуда | Статус |
| --- | --- | --- |
| `/app/contact-support` (голый) | лендинг, оба staff-логина | случай голого `/app`, **закрыт владельцем 22.08** |
| `/legal/privacy` | лендинг, оба staff-логина, обе staff-формы поддержки | правило таблицы: общий текст, title = `… · Therapysto` |
| `/legal/terms` | то же | то же |

### 4. Единственность источника matcher'а — проверена сборкой

Утверждение исполнителя («вынести список даже в константу того же файла нельзя») воспроизведено:

```
# правка: const PROBE_MATCHER = [...]; matcher: PROBE_MATCHER
NODE_ENV=production pnpm exec next build
→ BUILD_EXIT=1
  Error: Turbopack build failed with 1 errors:
  Next.js can't recognize the exported `config` field in route. `matcher` needs to be a static string
  or array of static strings or array of static objects.

# правка возвращена
NODE_ENV=production pnpm exec next build → BUILD_EXIT=0
node -e "…functions-config-manifest.json…" → ["/","/app","/app/:path*","/api/:path*"]
```

Направление зависимости (matcher живёт в `proxy.ts`, гейт импортирует `config`) — единственно
возможное. Второй копии в репозитории нет: `grep -rn "'/app/:path\*'" apps/webapp/src` → только
`proxy.ts`.

### 5. Регрессия по кругам 1–3 — восемь пунктов, все чистые

| # | Что | Проверка | Результат |
| --- | --- | --- | --- |
| 1 | `F1` staff-экраны входа | живой прогон 5341 | `/app/doctor/login`, `/app/admin/login` → `Therapysto`×10, manifest-staff, staff-иконки |
| 2 | `F2` `PATIENT_APP_NAME=<чужое>` не переопределяет staff | сервер 5342 с `QA-Renamed` | patient-экраны: `QA-Renamed`×9-10; `/app/doctor/login`, `/app/admin/login`, `/`, `?intent=specialist`, `?from=clinic-demo`: `QA-Renamed`×**0** — стало чище, чем в круге 2 (там был ×1 в RSC-payload) |
| 3 | Контракт манифестов | живые манифесты | `{"id":"/app","start_url":"/app/patient"}` и `{"id":"/app-staff","name":"Therapysto","start_url":"/app/doctor"}` — не изменены |
| 4 | passkey rp-id / TOTP issuer | `git log --name-only <база feat>..HEAD -- passkeyAuth.ts totp.ts` → пусто | `rpId = new URL(env.APP_BASE_URL).hostname` на месте; исключение владельца соблюдено |
| 5 | Юридические страницы | живой прогон | `/legal/terms`, `/legal/privacy` → title `… · Therapysto`, `BersonCare`×0; вне matcher'а, как и было |
| 6 | Запрещённое не тронуто | `git show --name-only 1fe5f5660` | 3 файла кода (`proxy.ts`, `surfaceRoutes.ts`, `surfaceRoutes.unit.test.ts`) + 2 документа; ни passkey/totp, ни `apps/integrator/**`, ни миграций, ни `package.json`; тесты прошлых кругов не удалены |
| 7 | Секрет в клиентском бандле | `next build` + grep по `.next/static` | `dev-session-secret-change-me-min-16` → 0 файлов; `ALLOW_DEV_AUTH_BYPASS\|SESSION_COOKIE_SECRET` → 0 файлов |
| 8 | soft-navigation | headless, оба направления | см. п. 2 — идентичность меняется целиком |

`TPB-15` заодно: `grep -rn "BersonCare" src/ public/` → 8 строк, ни одной новой. Все известные:
подпись письма пациенту (этап C), `totp.ts` issuer и `passkeyAuth.ts` rpName (исключены владельцем),
`auth.md`, технические идентификаторы.

`TPB-16`: идентичность поверхности читают семь файлов, и это ровно объявленный набор —
`app/layout.tsx` (применение), `AppEntryRsc.tsx` (шапка общего входа), `requestSurface.server.ts`,
`surfaceLayoutMetadata.ts`, `surfaceRoutes.ts`, `PlatformProvider.tsx`, `proxy.ts`. Параллельного
getter/resolver/store не появилось.

### 6. Скоуп — всё ложится на `Z1`/`Z2` плюс названное исполнителем исправление

```
git show 1fe5f5660 --stat -- apps/webapp
→ surfaceRoutes.ts +29/−17 · surfaceRoutes.unit.test.ts +64/−9 · proxy.ts +13/−0
```

`surfaceRoutes.ts` — два правила и комментарии, больше ничего. `proxy.ts` — только комментарий
(13 строк), кода не тронуто. Тест — предикат из `config.matcher` + 6 проверок. Новых файлов,
модулей, гейтов и скриптов нет.

**Исправление сверх двух пунктов (`?from=staff-factor`) — законное, откатывать не нужно.** Это ровно
класс `R3-1`: URL достижим только со staff-шага второго фактора (`withContactSupportReturn(…,
'staff-factor')` — единственный вызов, `AuthFlowV2.tsx:1727`), сигнал в URL различим, требование то же
(`TPB-08`, есть в плане владельца), чинится одной строкой в существующей таблице. Найдено ровно тем
измерением, которое бриф предписал провести; исполнитель назвал его явно и указал, как откатить. Мой
независимый пересчёт `from=`-значений подтверждает, что вместе с `clinic-demo` это ПОЛНЫЙ набор
staff-сигналов на `/app/contact-support` — то есть правка не только законная, но и завершающая класс.

### 7. Гейты — свои прогоны

```
pnpm exec tsc --noEmit                                     → exit 0   (после rm -rf .next/dev)
pnpm exec eslint src/proxy.ts src/config/surfaceRoutes.ts \
                 src/config/surfaceRoutes.unit.test.ts     → exit 0
NODE_ENV=production pnpm exec next build                   → exit 0
pnpm exec vitest --run --project=unit  surfaceRoutes.unit.test.ts staffPwaManifest.unit.test.ts
                                                           → 2 файла / 42 теста PASS
pnpm exec vitest --run --project=route src/proxy.route.test.ts
                                                           → 1 файл / 13 тестов PASS
```

Затронутые тесты выбраны своим замером, не по списку исполнителя:
`grep -rln "surfaceRoutes\|surfaceLayoutMetadata\|resolveRequestSurface\|getRequestSurface\|staffPwaLayoutMetadata\|@/proxy\|patientPwaManifest" src/ --include="*.test.ts*"` → те же три файла.

---

## Наблюдения (не находки, работу из них не вывожу)

- **`/legal/*` со staff-экрана отдаёт пациентский манифест и пациентские иконки** (title при этом
  `… · Therapysto`). Это правило таблицы, записанное осознанно, и иначе сегодня быть не может:
  `/legal` вне `config.matcher`, поэтому заголовка пути там нет вообще. Вопрос «должна ли юридическая
  страница, открытая из зоны персонала, рекламировать пациентское приложение» — продуктовый, и его
  естественное место этап `B` (резолвер по `Host`), а не таблица путей.
- **Ссылки из писем персоналу о биллинге/команде и `/app/account` без сессии дают 307 на голый
  `/app`** (проверено: `curl -o /dev/null -w "%{http_code} %{redirect_url}"` → `307 …/app`), и `next`
  при этом теряется. Исполнитель это зафиксировал, я подтверждаю: это тот же голый `/app`, закрытый
  владельцем. Отмечаю одну деталь для этапа `B`: сигнал здесь В ПРИНЦИПЕ есть (исходный staff-путь),
  он просто отбрасывается редиректом — если после переезда на два домена случай не исчезнет сам,
  чинится сохранением `next`, а не новым правилом.
- **`R3-4` из круга 3 всё ещё открыт:** `apps/webapp/src/config/config.md:12` предписывает
  `usePatientSurfaceName()`, а хук называется `useSurfaceName()` (`PlatformProvider.tsx:28`).
  Исполнитель честно назвал адрес и оставил ведущему. Подтверждаю, что расхождение живо.
- **`R3-3` (подделка `x-bc-pathname` вне matcher'а) не трогали по указанию брифа** — проверил, что
  ситуация та же: `proxy` копирует входящие заголовки и перезаписывает оба только внутри matcher'а,
  поэтому на `/legal`, `/book`, `/join`, `/[clinicSlug]` клиентский заголовок доезжает до RSC. Место
  правки — этап `B`.
- **`И-4` (убрать `/api/:path*` из matcher'а) задевает не только идентичность:** на `/api/**` через
  proxy проходят `decideCsrfOrigin`, correlation-id и продление сессии. Гейт строит предикат из
  `config.matcher`, но сверяет его только со страничными маршрутами, поэтому эту правку он увидеть не
  может по построению. Пункта плана под «покрыть и API-часть matcher'а» нет — называю как границу
  того, что гейт доказывает, а не как работу.

## Почему `PASS`, а не пятый круг

`R4-1` — единственное, что осталось, и это стойкость гейта, а не поведение продукта: сегодня ни один
человек ничего лишнего не видит, что подтверждено 284 живыми проверками. Требования «каждая строка шва
покрыта тестом» в плане владельца нет; Gate A требует metadata/config-тестов, и они есть и краснеют на
пяти инъекциях из девяти проверенных мной.

Круги 3 и 4 подряд закрывались находкой одного класса — «гейт не покрывает шов». По правилу владельца
(18.07/28.07) повтор одной проблемы означает **эскалацию, а не следующий круг того же вида**, и стоп с
вопросом владельцу, если эскалация не помогла. Поэтому предлагать пятый аудит под `R4-1` я не буду:
это одна правка в уже существующем `proxy.route.test.ts`, которую ведущий может сделать одним проходом
без нового цикла аудита, — либо оставить как вопрос владельцу, если он считает стойкость гейта
достаточной.

Приземления не предлагаю ни при каком вердикте — режим владельца из шапки план-файла: этапы в `feat`
сводит только он.

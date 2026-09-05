# S4 — реализация безопасной двери ошибки (04.09.2026)

Authority: `docs/_TODO/SYSTEMIC_RESIDUAL_AUDIT_AND_FIX_PLAN_2026-08-27.md`, волна 03.09, пункт **S4**.
Красный oracle первого независимого аудитора: `docs/_TODO/S4_ERROR_BOUNDARY_ACCEPTANCE_AUDIT_2026-09-03.md`.
Роль этого документа — **evidence кандидата**, не приёмка. Независимый PASS и галочку S4 ставит отдельный
аудитор/лид (§24.7).

---

## 1. Красный baseline воспроизведён до правки

Восстановлены три acceptance-файла аудитора без изменений текста, прогон на текущей реализации:

```
pnpm exec vitest --run \
  src/app/api/booking-engine/patientPackagesRouteShared.unit.test.ts \
  src/shared/http/apiResponse.unit.test.ts \
  src/shared/ui/errorBoundarySafeMessage.ui.test.tsx
→ Test Files  2 failed | 1 passed (3)
  Tests  4 failed | 5 passed (9)
```

Совпадает построчно с записью аудитора. Красные утверждения: тело `membershipErrorResponse` равнялось сырому
SQL; все три React-границы печатали `insert into "be_patient_package_items" … permission denied`.

## 2. Перепись поверхности заново, каждое число со своей командой

```
find src/app/api -name route.ts | wc -l                                                  → 454
grep -rl "shared/http/apiResponse" --include=route.ts src/app/api | wc -l                 → 14
grep -rlE '\berror\.message\b|\berr\.message\b' --include=route.ts src/app/api | wc -l    → 49
grep -rl "'use server'" src --include='*.ts' --include='*.tsx' -Z \
  | xargs -0 grep -lE '\b(e|err|error|ex|caught)\.message\b' | wc -l                      → 5
```

454 / 14 / 49 совпали с планом. **Server actions — 5, а не 11**: паттерн плана (`error.message`/`err.message`)
не видит `e.message`, которым пользуется `lfk-templates/actions.ts`. Число зафиксировано как свежий замер.

Из 49 файлов переписи владельца **19** реально выносят текст ошибки в тело ответа; остальные 30 сравнивают
`message` с литералом или только логируют — доказано чтением каждого catch-блока, не гипотезой:

```
comm -12 <(gate-flagged files) <(owner census)   → 19  (настоящие sinks в семье владельца)
comm -13 <(gate-flagged files) <(owner census)   → 30  (сравнение/лог, утечки нет)
```

## 3. Конструкция: одна дверь, а не вторая рядом

Прошлая незавершённая попытка (`/home/dev/dev-projects/bcb-wt-trackd-s4-worker-20260903`, коммит `c52d74f9`)
добавляла **sibling `jsonApiError`** рядом с `jsonError`. Это ровно то, что запрещает §5: появляется второй
способ ответить ошибкой, и безопасный из них — необязательный. Здесь этого нет.

- `mapApiError` — **не менялся**: остаётся чистым, без логов и побочных эффектов. Его oracle
  (`apiResponse.unit.test.ts`) сравнивает дескриптор по `toEqual`, и любое добавление поля туда сломало бы его —
  это и есть встроенный сторож чистоты.
- `jsonError` — **параметризован**, не продублирован: у него теперь две формы аргументов, `(code, publicFields,
  init)` для 108 существующих колл-сайтов и `({ error, literalRules, fallback, typedRules, logEvent }, init)`
  для пойманного отказа. Одна точка, разные параметры (§5 «варианты одного действия — параметры одной точки»).
- `resolveApiFailure` — единственная реализация решения «что видит пользователь и что видит оператор».
  `jsonError` вызывает её для HTTP-транспорта; server actions, у которых нет `NextResponse`, зовут через
  `safeActionErrorCode` ту же функцию. Реализация одна, транспорта два.

**Correlation id.** Не переиспользуется React-only `error.digest`. Используется существующий seam
`@bersoncare/db-principal` (`BC_CORRELATION_ID_HEADER`, `ensureCorrelationId`), который `src/proxy.ts` уже
выдаёт каждому динамическому запросу. Если ALS-ячейка запроса уже несёт id (bootstrap/публичные маршруты) —
берётся он; если нет — дверь создаёт один и отдаёт **тот же** id и в тело, и в лог. Это дословно то, что
разрешает план: «если его реально нет, создавай один в общей двери ответа и передавай тот же id в лог».

**Логгер расширен намеренным типизированным контрактом, а не случайным сырым полем.** `serializeError` и
закрытые ключи `err`/`error` не тронуты — они по-прежнему роняют `message`/`stack`/`cause`, и это защищает все
остальные вызовы логгера в приложении. Добавлен отдельный ключ `operatorErrorDetail` со своим сериализатором
`serializeOperatorErrorDetail` (message + stack + SQLSTATE/class + цепочка `cause`, ограниченная глубиной 3).
Таблица сериализаторов вынесена в экспортируемую `LOG_SERIALIZERS`, которую ставит корневой логгер — тест
проверяет реальную проводку, а не её копию.

## 4. Что переключено

**Общая дверь / общие помощники**

- `src/shared/http/apiResponse.ts` — `ApiFailure`, `resolveApiFailure`, вторая форма `jsonError`,
  `safeActionErrorCode`.
- `src/infra/logging/logger.ts` — `serializeOperatorErrorDetail`, `LOG_SERIALIZERS`.
- `src/app/api/booking-engine/patientPackagesRouteShared.ts` — `membershipErrorResponse` (именно этот sink
  измерил аудитор; достижим из 4 route-файлов) переведён на закрытый allowlist из 14 доменных кодов + fallback.
- `src/app/api/booking-engine/packageDetachShared.ts` — удалён дублирующий `DETACH_ERROR_STATUS`: все шесть его
  кодов уже есть в общем allowlist с теми же статусами, а его ветка `?? 400` отдавала неизвестный текст с 400.

**19 route.ts семьи владельца** (все сайты переключены; ни один не оставлен «недостижимым»):
`admin/booking-engine/availability`, `admin/commercial`, `admin/organizations/[organizationId]`,
`admin/platform-analytics`, `admin/settings`, `booking/form-fields`, `booking/memberships/purchase`,
`booking/public/form-fields`, `booking/public/slots`, `clinic/billing`,
`doctor/booking-engine/appointments/[id]/payment`, `.../appointments/feed`,
`.../appointments/manual-patient-visit`, `.../appointments/manual`, `.../calendar`, `.../working-days`,
`.../working-hours`, `.../working-schedule-templates`,
`patient/treatment-program-instances/.../metrics`.

Два неавторизованных маршрута из плана — `booking/public/slots` и `booking/public/form-fields` — входят сюда.

Там, где catch **пробрасывал** неизвестную ошибку (`availability`, `platform-analytics`, `admin/settings`),
проброс сохранён: он и есть операторский сигнал через `onRequestError`, менять его S4 не просит. Изменено
только то, что известный код теперь называется через общий `mapApiError`, а не эхом переменной с текстом.

**Dev-detail удалён.** `NODE_ENV === 'development' ? { detail: error.message } : {}` в
`working-hours/route.ts` (обе точки) больше нет; проверка `grep -rn "NODE_ENV === 'development'" src/app/api`
пуста. Требование действует в DEV/TEST/PROD одинаково.

**Известные доменные коды остались различимы** — это отдельная работа, а не побочный эффект: для
`admin/commercial` allowlist собран из 34 литералов, которые фактически бросает `modules/org-entitlements`
(команда выписана в коде рядом с таблицей); для memberships, booking-scheduling, платежей и метрик — из
соответствующих модулей.

**Типизированный отказ вместо голого `Error`.** `assertOperatorHealthProbeConfig` бросал 11 авторских
сообщений обычным `Error`, и маршрут не мог отличить их от отказа PostgreSQL. Добавлен
`OperatorHealthProbeConfigInvalidError`; маршрут сужается на него. Это существующий шаблон репозитория
(`InPersonBookingResolveError`), а не новый механизм.

**React-границы (3).** `global-error.tsx`, `shared/ui/doctor/SegmentRouteError.tsx`,
`shared/ui/patient/SegmentRouteError.tsx` больше не читают `error.message`; показывают безопасный текст и
`error.digest` как код. `console.error(error)` в SegmentRouteError сохранён — это консоль браузера, не разметка.

**Server actions (4 из 5).** `patientHomeDoctorSettingsActions.ts` (3), `settings/patient-home/actions.ts` (11),
`brandingActions.ts` (1), `doctor/lfk-templates/actions.ts` (3) — через `safeActionErrorCode`. Пятый,
`doctor/references/actions.ts`, уже безопасен по построению (`SAVE_CATALOG_KNOWN_CODES.has(err.message)` —
закрытый allowlist) и не менялся.

## 5. Механический гейт

`apps/webapp/scripts/check-safe-error-transport.mjs`, разбор через TypeScript AST.

Гейт **сильнее** формулировки плана в одном месте намеренно: он ведёт taint не только по литеральному
`error.message`, но и по алиасам (`const msg = err.message; … json({ detail: msg })`). Это была доминирующая
форма утечки в этом репозитории — гейт, который видит только литерал внутри вызова, пропустил бы бо́льшую часть
того, что S4 пришлось чинить. Прошлая попытка именно эту форму держала в списке «accepted», и её же
JSX-only-правило не поймало бы живую утечку `const message = error.message || '…'` в `global-error.tsx`.

Два исключения, оба узкие: сужение `x instanceof <проектный класс ошибки>` (его message авторский) и сама
общая дверь `jsonError({ error, …, fallback })`, которая получает сырую ошибку по назначению.

Включён в штатный путь: `apps/webapp/package.json` → `lint` → корневой `lint` → `.github/workflows/ci.yml:19`
(`pnpm lint`). Гоняется вместе со своим `--self-test`.

**Замороженный легаси-долг, не исключение.** 69 файлов (87 точек) вне семей владельца отдают авторский текст
отказа — русские валидационные фразы `modules/treatment-program*`, `modules/courses`, `modules/comments`, —
который врач и пациент видят на экране сегодня. Схлопнуть их в один общий код значит удалить настоящую
продуктовую обратную связь, поэтому они внесены списком с зафиксированным числом точек на файл и названным
условием снятия (§10a, третья ступень). Список умеет только уменьшаться: новая точка в замороженном файле
роняет гейт, и уменьшение числа тоже требует правки списка тем же изменением.

## 6. Fault injection — по одному на независимый класс, все откачены

| Инъекция | Что покраснело |
|---|---|
| Вернул `const msg = err.message; NextResponse.json({ detail: msg })` в `calendar/route.ts` | `check-safe-error-transport` → `calendar/route.ts:85 api-json-error-text`, exit 1 |
| Добавил лишнюю точку утечки в замороженный `doctor/comments/route.ts` | гейт → `3 sites, frozen at 2 — new debt in a frozen file`, exit 1 |
| Заставил дверь логировать **другой** id, чем отдала в теле | `safeErrorTransport.unit.test.ts` → `expected 'a-different-id' to be '77185418-…'` |
| Расширил закрытый сериализатор `err` до detail-несущего | `safeErrorTransport.unit.test.ts` → «still drops the failure text under the closed err/error keys» упал |

После каждой инъекции файл восстановлен; `grep -rn "a-different-id\|__inject" src/ scripts/` пуст, гейт снова
`OK`, набор снова зелёный.

## 7. Проверки

```
pnpm exec vitest --run <4 файла S4>                → Test Files 4 passed, Tests 16 passed
pnpm exec vitest --run <12 соседних route/ui>      → Test Files 12 passed, Tests 70 passed
pnpm --dir apps/webapp typecheck                    → exit 0, ошибок нет
pnpm --dir apps/webapp lint                         → exit 0 (eslint + все гейты, включая новый и его self-test)
node scripts/check-safe-error-transport.mjs         → OK (69 files of frozen legacy debt unchanged)
node scripts/check-safe-error-transport.mjs --self-test → OK (13 bypass forms rejected, 10 canonical accepted)
git diff --check                                    → чисто
```

Три чужих теста обновлены под намеренное новое поведение (§10 «тесты подгоняются под код»):
`admin/commercial` и `clinic/billing` route-тесты доучили свой мок `@bersoncare/db-principal` двум экспортам,
которые теперь лежат на графе модулей любого маршрута с `jsonError`; тест
`appointments/[id]/payment` утверждал ровно старый дефект — что произвольный текст отказа провайдера уходит в
тело как код — и переписан на контракт S4 (фиксированный код + correlation id, по-прежнему без `paymentLink`).

## 8. НЕ СДЕЛАНО

- **Full CI не запускался** — по решению владельца он один раз на объединённом S1+S4 SHA (шаг 4 порядка волны).
- **Живая проверка, DEV/TEST/PROD, deploy, push, миграции, taskdb — не выполнялись**, ветка не пушилась.
- **S2/S3/S5/S6 не реализованы** — вне скоупа этого прохода.
- **Независимого PASS нет.** Галочку S4 в плане владельца этот документ не ставит.

## 9. Вопрос владельцу (не задача — §24.6)

Замер показал класс той же утечки **вне** названных в S4 семей: 69 файлов / 87 точек в
`doctor/treatment-program-*`, `patient/treatment-program-*`, `doctor/courses|comments|recommendations|test-sets`
и соседях. Они не попали в перепись плана только потому, что связывают ошибку как `e`, а не `error`/`err`.

Почему они не починены заодно, а заморожены: там `error.message` — это **авторский русский текст валидации**
(«Название этапа обязательно», «В комплексе нет упражнений»), который врач читает как продуктовое сообщение;
`modules/treatment-program*` бросает такие 278 раз. Закрытый allowlist на 278 фраз бессмыслен, а схлопывание в
один код уничтожит обратную связь врачу. Правильная конструкция — та же, что применена здесь к
`OperatorHealthProbeConfigInvalidError`: модуль бросает свой типизированный класс авторского отказа, маршрут
сужается на него, неизвестная ошибка уходит в общую дверь. Это отдельный workstream по объёму (278 точек
throw в нескольких модулях), и заводить его в середине S4 значило бы молча вытеснить план.

**Развилка владельца:** заводить ли этот workstream отдельным пунктом волны, и если да — до или после
приземления S1+S4. До решения долг заморожен механически и расти не может.

---

# S4 — correction-проход после независимого аудита (04.09.2026)

Роль раздела — **evidence исправления**, не приёмка. Вердикт `FAIL` артефакта
`S4_ERROR_BOUNDARY_INDEPENDENT_AUDIT_2026-09-04.md` остаётся историческим фактом и не переписан.
Оракул — kill-set и тесты того же артефакта; второй аудит не заводился.

База: `3d9cfd152` (продуктовое состояние `c3ebdae26`). После механической правки мока ведущим полный
фазовый набор приложения дал **пять** красных файлов, а не один.

## C1. Причинность каждого падения, доказанная экспериментом

| Файл | Причина | Кандидат виноват? |
|---|---|---|
| `api/payments/patientAcquiring.route.test.ts` | мок `@bersoncare/db-principal` без `getCurrentObservabilityContext` | **да** |
| `api/payments/saasWebhook.route.test.ts` | то же | **да** |
| `api/clinic/invites/route.route.test.ts` | то же | **да** |
| `api/tariffMechanics.route.test.ts` (2 утверждения) | доверенный текст отказа по тарифу схлопнут в `forbidden` / `toggle_failed` | **да** |
| `modules/auth/passwordAuth.route.test.ts` | тест зависит от переменной окружения `TEST_ACCOUNT_PHONES` | **нет** |

**Импорт-аборты (три файла).** Кандидат добавил в `shared/http/apiResponse.ts` две строки импорта,
которых на родителе не было:

```bash
git show babdc87e8^:apps/webapp/src/shared/http/apiResponse.ts | sed -n '1,3p'
#   import { NextResponse } from 'next/server';        ← и всё
sed -n '1,3p' apps/webapp/src/shared/http/apiResponse.ts
#   + import { ensureCorrelationId } from '@bersoncare/db-principal';
#   + import { logger } from '@/infra/logging/logger';
```

Логгер зовёт `getCurrentObservabilityContext` как `mixin` на уровне модуля, поэтому пакет попадает в
граф любого файла, чей маршрут отвечает через `jsonError`, и неполный мок роняет файл на импорте.

**Перепись доведена до конца, а не до первых трёх.** Проверены **все** файлы, мокающие пакет, —
не только напечатанные до остановки Vitest:

```bash
grep -rln "vi.mock('@bersoncare/db-principal'" src | wc -l        → 47
grep -rn "vi\.\(do\)\?mock(\s*[\"'`]@bersoncare/db-principal" src \
  | grep -v "vi.mock('@bersoncare/db-principal'"                  → пусто (другой формы записи нет)
pnpm --dir apps/webapp exec vitest run <все 47>                   → 3 failed | 44 passed (до правки)
                                                                  → 47 passed (после)
```

Правка — тот же паттерн, что кандидат уже применил в `admin/commercial` и `clinic/billing`:
`ensureCorrelationId` + `getCurrentObservabilityContext` в мок, с той же строкой-объяснением.
`ensureCorrelationId` добавлен всем трём, потому что все три маршрута достижимо доходят до fallback-ветки.

**Регрессия текста отказа по тарифу — настоящая продуктовая, не тестовая.** Гварды бросали
`new Error(entitlementMutationRefusalMessage(...))`, то есть авторское русское предложение, которое
панель показывает врачу дословно (`PatientHomePracticeTargetPanel.tsx:27` → `setError(res.error)`).
Для двери такой `Error` неотличим от отказа PostgreSQL, и `safeActionErrorCode` — правильно — схлопывал
его в фиксированный код. Виден был `forbidden` вместо причины «раздел не входит в ваш тариф».

**`passwordAuth` кандидатом не вызван — доказано двумя способами.**

```bash
git diff --stat babdc87e8^ HEAD -- apps/webapp/src/modules/auth/passwordAuth.route.test.ts \
  apps/webapp/src/app/api/auth/email-password/login/route.ts apps/webapp/src/config/testAccounts.ts \
  apps/webapp/src/config/env.ts apps/webapp/src/modules/auth/passwordEligibility.ts \
  apps/webapp/vitest.setup.ts apps/webapp/vitest.config.ts
#   пусто — ни один файл этого пути кандидатом не тронут

TEST_ACCOUNT_PHONES="+12025550101" pnpm --dir apps/webapp exec vitest run \
  --project route src/modules/auth/passwordAuth.route.test.ts
#   Test Files 1 passed (1) / Tests 17 passed (17)
```

Продуктовое поведение auth не менялось — см. «НЕ СДЕЛАНО» ниже.

## C2. Конструкция исправления: существующий типизированный класс, а не вторая дверь

Дверь уже несёт ровно один доверенный канал для авторского исхода — `TypedApiResponseError`
(«a trusted typed error whose public HTTP representation is explicit at construction time»), и
`mapApiError` разбирает его **первым**, до любых allowlist. Поэтому:

- **новой функции в `apiResponse.ts` нет**, `safeActionErrorCode` **не параметризован**. Параметры
  `literalRules`/`typedRules` ему не помогли бы: отказ собирается из свободного аргумента `action`
  («показать блок разминок», «изменить настройки разминок»), перечислимого allowlist у него нет
  по построению. Доверенный класс проходит через `safeActionErrorCode` без единой правки двери;
- в `app-layer/guards/requireEntitlement.ts` — где уже живут `entitlementMutationRefusalMessage` и
  `entitlementMutationRefusalResponse` — добавлен **третий транспорт того же решения**:
  `entitlementMutationRefusalError(action, reason)`. Само предложение по-прежнему сочиняется ровно в
  одной точке; новая функция говорит только, как оно едет. Это та же форма, что у самой S4:
  одна `resolveApiFailure` и два транспорта вокруг неё;
- четыре throw-сайта в двух action-файлах переведены на него; два `throw new Error('forbidden')`
  там же — на `new TypedApiResponseError({ code: 'forbidden', status: 403 })`. Второй из них
  (`settings/patient-home/actions.ts:434`, отсутствие `cms_pages`) кандидат схлопывал в
  `create_section_failed` — тот же класс регрессии, просто без красного теста;
- ни подстрочных эвристик, ни широкого разрешения `Error.message`, ни второй response/error-двери.
  `String(error)`, касты и деструктуризация не трогались — это по-прежнему вопросы владельцу.

Конструкция сильнее теста (§10a, ступень 1): понизить отказ обратно до `new Error(...)` **не
компилируется** — `tsc` даёт `TS2741: Property 'descriptor' is missing in type 'Error' but required
in type 'TypedApiResponseError'`.

## C3. Инъекции для новой типизированной поверхности

Три класса из брифа, по одной инъекции на класс; каждая откачена сразу, дерево проверено после каждой.

| # | Что сломано | Покрасневшее утверждение |
|---|---|---|
| CI-1 | `resolveApiFailure` при промахе отдаёт `code: error.message` | `never puts raw PostgreSQL/Drizzle detail into the response body…`, `never lets raw PostgreSQL/Drizzle detail become the mapped code…`, `returns a correlation id… under that same id`, `gives server actions the same decision…`, новый `trusts the typed authored outcome…` (4 failed / 10 passed) |
| CI-2 | `mapApiError` перестал доверять `TypedApiResponseError` | `tariffMechanics.route.test.ts`: `refuses Today configuration visibly…` и `refuses every daily-warmup block/item mutation…` (2 failed / 42 passed) |
| CI-3 | «сообщение похоже на авторское» — эвристика `message.includes(' ')` в `mapApiError` | те же оракулы двери + новый тест: `expected 'Невозможно…' to be 'toggle_failed'` (5 failed / 9 passed) |
| CI-2′ | понизить `entitlementMutationRefusalError` до `new Error(...)` | **тестом не ловится, и это верно:** ловится компилятором, `TS2741`. Записано честно: сайт защищён конструкцией, а не тестом; доверие двери к классу защищено CI-2 |

Первая попытка CI-2 была негодной: инъекция в реальный `requireEntitlement.ts` оставила
`tariffMechanics` зелёным, потому что этот файл модуль гварда целиком дублирует. Инъекция
переделана на настоящую проверяемую точку — доверие двери — и утверждения покраснели.

## C4. Один новый тест — на поверхность, которой раньше не было

`src/shared/http/safeErrorTransport.unit.test.ts` — `trusts the typed authored outcome and still
refuses the same text from a plain Error`. Названный отказ: кто-то расширяет авторский текст на
**любой** `Error` (literal allowlist на предложение, эвристика «похоже на авторское») — и отклонённый
SQL-стейтмент снова на экране врача, при зелёном наборе. Дорогой и молчаливый (§10a, ступень 2),
самый дешёвый слой — unit на самой двери. Оракул — требование плана владельца («доменные коды обязаны
остаться различимыми») плюс контракт S4, не реализация. Дубля нет: существующие оракулы проверяют
неизвестный текст и потерю детали, но ни один не проверял доверенный класс.

## C5. Прогоны (все через `/home/dev/brain/host-orch/run-tests.sh`)

| Проверка | Результат |
|---|---|
| 5 красных файлов до правки | `5 failed (5)`, `3 failed / 58 passed` — воспроизведено |
| Перепись 47 моков `db-principal` | до: `3 failed / 44 passed`; после: **47 passed (47) / 263 tests** |
| Целевые S4 (4 файла) | **17 passed (17)** (было 16, +1 новый) |
| 4 бывших красных route-файла | **75 passed (75)** |
| Гейт `check-safe-error-transport.mjs` | **OK** — 69 файлов долга, без сдвига |
| Его `--self-test` | **OK** — 13 форм обхода отклонено, 10 канонических принято |
| `pnpm --dir apps/webapp typecheck` | **rc 0** |
| `pnpm --dir apps/webapp lint` (eslint + все 9 гейтов и их self-test) | **rc 0** |
| `pnpm test:webapp:fast` | **114 passed / 7 skipped (121)**, 664 теста |
| `pnpm test:webapp:behavior` | unit **227/227**, route **89/90** (единственный красный — `passwordAuth`, см. C1), ui **69/69** |
| `pnpm test:webapp:behavior` с `TEST_ACCOUNT_PHONES` в окружении | **386 файлов / 1904 теста, всё зелёное** |

## C6. НЕ СДЕЛАНО

- **`modules/auth/passwordAuth.route.test.ts` остаётся красным без переменной окружения.** Это
  не-S4 блокер и он не исправлен намеренно. Дефект внесён `592ed97e8` (27.08, за восемь дней до
  кандидата): аллоулист тестовых аккаунтов переехал из мокаемой настройки в `env`, а стаб из теста
  был удалён без замены. Тест зависит от обстоятельств запуска (§10a, антипаттерн 6) — он зелёный
  только там, где в окружении лежит `TEST_ACCOUNT_PHONES` (например из `apps/webapp/.env`, которого
  в репозитории нет). `TEST_ACCOUNT_PHONES` не задаётся и в `.github/workflows/ci.yml`. Продуктовое
  поведение auth по брифу не трогалось; вопрос, чинить ли изоляцию теста или окружение прогона, —
  за ведущим, это отдельная работа вне S4.
- **Full CI не запускался** — по решению владельца он один раз на объединённом S1+S4 SHA.
- **Живая проверка, DEV/TEST/PROD, deploy, push, миграции, taskdb, БД — не выполнялись.**
- **Замороженный долг 69 файлов / 87 точек не расширялся и не трогался**; `String(error)`, касты,
  деструктуризация и correlation id для server actions остаются вопросами владельцу.
- **Строку очереди в accepted этот проход не переводит** — приёмку регистрирует ведущий.

---

# S4 — закрытие authority-разрыва по correlation id для server actions (04.09.2026)

Роль раздела — **evidence второго correction-прохода**, не приёмка. Исторический `FAIL` артефакта
`S4_ERROR_BOUNDARY_INDEPENDENT_AUDIT_2026-09-04.md` и раздел C выше не переписаны.

База: `eb8538f79`, ветка `wt/trackd-completion-20260904`.

## D1. Что было нарушено — требование плана владельца, а не находка аудитора

Оракул: `docs/_TODO/SYSTEMIC_RESIDUAL_AUDIT_AND_FIX_PLAN_2026-08-27.md:210-224` + решение владельца
`:277-281` — «S4 возвращает пользователю **короткий безопасный correlation id, общий с серверным
логом**; внутренний текст ошибки остаётся только оператору». Исключения для API у решения нет,
а `11 server actions` названы в семьях S4 прямо.

На кандидате `resolveApiFailure` уже отдавала пару `{descriptor, correlationId}` и писала лог под
этим id, но `safeActionErrorCode` возвращала **только** `descriptor.code`. Id создавался, логировался
и выбрасывался. Достижимое следствие: неизвестный отказ БД в любом из этих action'ов приходил врачу
как голый `toggle_failed` / `forbidden`, и на экране не было ничего, что можно назвать поддержке, —
при том что строка лога с полным текстом существовала. Раздел C6 выше числил это «вопросом
владельцу»; по строкам 277–281 это MUST FIX, и он закрыт здесь.

## D2. Перепись семьи, свежий замер вместо цифры плана

```bash
grep -rl "'use server'" src --include='*.ts' --include='*.tsx' | wc -l                  → 30
grep -rn "safeActionErrorCode" --include='*.ts' -l src | grep -v shared/http | sort      → 4 файла
```

Семья S4-мигрированных server actions — **4 файла / 18 catch-сайтов**, а не 11 файлов переписи
владельца: план считал по паттерну `error.message`/`err.message` до миграции, а сам S4-кандидат
уже перевёл эти сайты на общую дверь (5-й файл переписи, `doctor/references/actions.ts`, безопасен
по построению закрытым allowlist и в семью двери не входит — см. раздел 4 выше). Закрыты все четыре:

| Файл | Сайтов |
|---|---:|
| `src/app/app/settings/patient-home/actions.ts` | 11 |
| `src/app/app/doctor/patient-home/patientHomeDoctorSettingsActions.ts` | 3 |
| `src/app/app/doctor/lfk-templates/actions.ts` | 3 |
| `src/app/app/settings/brandingActions.ts` | 1 |

## D3. Конструкция: та же точка, переименованная, а не вторая рядом

- **Второго маппера, второго механизма ошибки, подстрочной эвристики и второго сериализатора нет.**
  `resolveApiFailure` не менялась вовсе; `mapApiError` не менялся; `jsonError` не менялся.
- `safeActionErrorCode` **переименована в `safeActionFailure`** — по §5 («если после расширения имя
  точки перестало описывать её работу, точка переименовывается в том же изменении»): она больше не
  возвращает код, она возвращает результат решения. Возврат — новый тип `ActionFailureFields`
  (`{ error: string; correlationId?: string }`) с **теми же именами полей**, что у
  `ApiErrorResponseBody`: у server action нет `NextResponse`, и это его «тело ответа».
- Каждый action-result тип стал `{ ok: false } & ActionFailureFields`, а сайты — `{ ok: false,
  ...safeActionFailure(...) }`. Помощники `fail()` в двух файлах приняли `string | ActionFailureFields`
  вместо расщепления на две функции.
- Известный доменный код по-прежнему различим и **id не несёт**: под него ничего не подшито в лог,
  и код поддержки рядом с фразой, которую врач может отработать сам, указывал бы в пустоту.

## D4. UI: одна точка показа, доменный текст не заменён

Новый `src/shared/ui/doctor/ActionFailureText.tsx` — единственное место, где решается, как выглядит
отказ action'а: собственный текст/код действия плюс, **только для неназванного отказа**, строка
`Код для поддержки: <id>` (`font-mono`, `select-all` — чтобы её можно было выделить и скопировать).
Формулировка не выдумана: ровно та же фраза уже стоит в `DataLoadFailureNotice` (§21 — не заводить
второй текст для того же). Экспортированный `actionFailureLine()` — тот же текст одной строкой для
поверхностей без второй строки (тост в `TemplateEditor`).

11 потребителей переведены на эту точку; `error`-состояние в них стало `ActionFailureFields | null`,
клиентские валидации — `setError({ error: '…' })`. Доменные тексты нигде не заменены общей фразой:
`OrgBrandingSection` по-прежнему переводит свои коды через `SAVE_ERROR_MESSAGES`, а ссылка едет рядом.

```
settings/patient-home: PatientHomeAddItemDialog, PatientHomeBlockItemsDialog,
  PatientHomeBlockSettingsCard, PatientHomeCreateSectionInlineDialog, PatientHomeReorderBlocksDialog,
  PatientHomeRepairTargetsDialog, PatientHomeDailyWarmupRotationPanel, PatientHomePracticeTargetPanel,
  PatientHomeRepeatCooldownPanel
settings: OrgBrandingSection
doctor/lfk-templates: TemplateEditor (тост)
```

## D5. Тесты — на общей точке и на одном сквозном потребителе

- `src/shared/http/safeErrorTransport.unit.test.ts` (существующий) — утверждение про action-транспорт
  усилено: `JSON.stringify(failure)` не содержит внутреннего текста, а `failure.correlationId`
  **равен** `correlationId` в перехваченной строке лога. Доверенный типизированный отказ проверяется
  на `toEqual({ error: authored })` — то есть на **отсутствие** id.
- `src/app/app/settings/patient-home/patientHomeActionFailureReference.ui.test.tsx` (новый, 2 теста) —
  сквозной: настоящий `PatientHomePracticeTargetPanel` → настоящий
  `savePatientHomePracticeTargetAction` → настоящая дверь, с инъекцией
  `Object.assign(new Error('insert into "be_patient_package_items" …'), { code: '42501' })` через мок
  порта. Утверждает: в разметке нет ни SQL, ни таблицы, ни SQLSTATE; видимая строка равна
  `Код для поддержки: <id из перехваченного logger.error>`. Второй тест: тарифный отказ читается
  дословно и ссылки не получает.

## D6. Fault injection — по одному на независимый класс, все откачены

| # | Что сломано | Покрасневшее утверждение |
|---|---|---|
| FI-A | `safeActionFailure` снова отдаёт только код | unit: `gives server actions the same decision…` (`expected undefined to be '36ab174d…'`), `trusts the typed authored outcome…`; ui: `expected 'forbidden' to contain 'Код для поддержки: 4d810a5e…'` — 3 failed / 7 passed |
| FI-B | дверь верна, но action кладёт в результат только `.error` | **только** ui: `expected 'forbidden' to contain 'Код для поддержки: 284e991a…'` — 1 failed / 9 passed (доказывает, что сквозной тест держит контракт результата, которого unit не видит) |
| FI-C | UI перестал показывать ссылку | ui: `expected 'forbidden' to contain 'Код для поддержки: 491f1721…'` — 1 failed / 9 passed |
| FI-D | UI заменил доменный текст общей фразой | ui: `expected 'Не удалось выполнить действие.' to be 'Невозможно изменить настройки…'`; чужой `tariffMechanicsRefusals.ui.test.tsx` → `shows returned errors in every Today settings panel` — 3 failed / 11 passed |

После каждой инъекции файл восстановлен; `grep -rn "void SUPPORT_REF_LABEL\|void correlationId" src/ scripts/` пуст.

## D7. Прогоны (все через `/home/dev/brain/host-orch/run-tests.sh`)

| Проверка | Результат |
|---|---|
| Целевые S4 (4 файла) + новый сквозной | **5 files / 19 passed** (было 17) |
| Все затронутые action/UI/route-тесты (11 файлов) | **89 passed (89)** |
| `pnpm --dir apps/webapp typecheck` | rc 0 |
| `pnpm --dir apps/webapp lint` (eslint + все гейты и их self-test) | rc 0 |
| `node scripts/check-safe-error-transport.mjs` | OK (69 файлов долга, без сдвига) |
| `… --self-test` | OK (13 форм обхода отклонено, 10 канонических принято) |
| `TEST_ACCOUNT_PHONES=… pnpm test:webapp:behavior` | unit **227/1025**, route **90/619**, ui **70/262** — всё зелёное |
| `prettier --check` по затронутым файлам | OK |
| `git diff --check` | чисто |

## D8. НЕ СДЕЛАНО

- **Независимого PASS нет.** Галочку S4 в плане владельца этот проход не ставит, очередь ночного
  аудита не редактируется.
- **Full CI не запускался** — по решению владельца он один раз на объединённом S1+S4 SHA и
  делегируется отдельно.
- **Живая проверка, DEV/TEST/PROD, deploy, push, миграции, БД, taskdb — не выполнялись.**
- **Замороженный долг 69 файлов / 87 точек не трогался**; `String(error)`, касты и деструктуризация
  остаются вопросами владельцу (раздел 9 выше).
- **`doctor/references/actions.ts` не менялся** — он безопасен закрытым allowlist и в семью общей
  двери не входит.

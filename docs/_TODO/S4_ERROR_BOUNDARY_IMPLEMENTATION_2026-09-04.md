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

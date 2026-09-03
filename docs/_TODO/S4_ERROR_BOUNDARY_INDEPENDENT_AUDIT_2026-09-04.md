# Track D S4 — независимый приёмочный аудит (04.09.2026)

**Вердикт: `FAIL — ONE MUST FIX, THEN RE-RUN THE APP SUITE`.**

Кандидат: `babdc87e8` («S4 — one safe error door on API and React, plus the gate against recidivism»),
ветка `wt/trackd-s4-design-audit-20260904`. Регистрационный коммит очереди: `406bbd97c`.
Аудитор: независимый Claude Opus 5, слепой протокол §24.5 / §10b.

Конструкция S4 принята полностью: **13 из 14 названных классов поломок пойманы**, все инъекции
откачены, дерево чистое. Блокирует один дефект, внесённый самим кандидатом и не замеченный воркером,
потому что воркер не гонял фазовый набор своего приложения: **тест `src/app/app/settings/page.unit.test.ts`
падает**, и это job `webapp behavior` в GitHub Actions. Продуктовый код аудитор не менял.

Authority: `AGENTS.md` §5, §7, §9, §10, §10a, §10b, §12, §14a, §24;
`docs/_TODO/SYSTEMIC_RESIDUAL_AUDIT_AND_FIX_PLAN_2026-08-27.md`, волна 03.09, R4 + S4 + решения владельца.

---

## 1. MUST FIX — кандидат роняет собственный тестовый job приложения

**Что происходит.** `src/app/app/settings/page.unit.test.ts` мокает `@bersoncare/db-principal`
одним экспортом (`runWithDbClinicBillingPrincipal`, строки 22–24). Кандидат добавил
`import { safeActionErrorCode } from '@/shared/http/apiResponse'` в
`src/app/app/settings/brandingActions.ts` и `src/app/app/settings/patient-home/actions.ts`.
`apiResponse.ts` тянет `ensureCorrelationId` из `@bersoncare/db-principal` и `@/infra/logging/logger`,
а логгер импортирует из того же пакета `getCurrentObservabilityContext`. Пакет теперь попадает в граф
модулей страницы настроек, мок его не отдаёт — файл падает на импорте целиком.

```
Error: [vitest] No "getCurrentObservabilityContext" export is defined on the
"@bersoncare/db-principal" mock. Did you forget to return it from "vi.mock"?
 FAIL |unit| src/app/app/settings/page.unit.test.ts
```

**Доказательство причинности (не рассуждение — эксперимент).** Откат ровно двух server-action файлов
кандидата к родителю делает тест зелёным, возврат кандидата — красным:

```bash
git checkout babdc87e8^ -- apps/webapp/src/app/app/settings/brandingActions.ts \
                           apps/webapp/src/app/app/settings/patient-home/actions.ts
pnpm --dir apps/webapp exec vitest run src/app/app/settings/page.unit.test.ts
#   Test Files  1 passed (1) / Tests  1 passed (1)
git checkout HEAD -- <те же два пути>
#   Test Files  1 failed (1)
```

**Достижимость и impact.** Это не локальная неудобица: `.github/workflows/ci.yml:144` запускает
`pnpm test:webapp:behavior`, и этот файл входит в project `unit` этого набора. Кандидат в текущем виде
даёт красный required check, то есть по §8/§9 push-flow не завершён, а по §24.7 ветка не `land-ready`.
Воркер заявил «neighbouring route/ui 70/70» — соседние наборы этот файл не содержат, поэтому регрессия
и не проявилась; отложенный по плану владельца full CI её тоже не отменяет, потому что фазовый набор
одного приложения (§10, phase-level) — это и есть подходящий гейт для этапа, трогающего
`shared/http/apiResponse.ts` и `infra/logging/logger.ts`.

**Нарушенная authority.** `AGENTS.md` §10 «CI: тесты подгоняются под код, а не код под тесты» — новое
поведение верное, под него обязан быть обновлён мок (воркер обновил три таких мока и пропустил
четвёртый); §24.7 `land-ready`.

**Что делать исполнителю (§24.1 — это механическая микроправка, отдельный worker не нужен).** Добавить
в мок `src/app/app/settings/page.unit.test.ts:22` недостающие экспорты, как это уже сделано кандидатом
в `src/app/api/admin/commercial/route.route.test.ts` и `src/app/api/clinic/billing/route.route.test.ts`.
Аудитор правку не делает и своей приёмкой её не закрывает.

**Полнота проверки этого класса.** Перебраны все 47 файлов, мокающих `@bersoncare/db-principal`:
`getCurrentObservabilityContext` есть только в трёх (`admin/commercial`, `clinic/billing`,
`s3MediaStorage.lifecycle`). Остальные не падают, потому что изменённые модули не входят в их граф.
Отдельного нового теста аудитор не пишет: дефект уже представлен красным тестом самого репозитория,
дубль запрещён §10b.

---

## 2. Слепой kill-set (составлен ДО открытия тестов кандидата)

Зафиксирован по authority до чтения `S4_ERROR_BOUNDARY_IMPLEMENTATION_2026-09-04.md` и любых
тестовых файлов кандидата. Итог: **13/14 закрыты, 1 частично** (K10 — см. §5, рекомендация, не finding).

| ID | Названная поломка | Метод | Результат |
|---|---|---|---|
| K1 | Неизвестный PostgreSQL/SQL-текст уходит в JSON | инъекция FI-1 | **CAUGHT** |
| K2 | Известный доменный код схлопнут в fallback | инъекция FI-2 | **CAUGHT** |
| K3 | id в ответе ≠ id в операторском логе | инъекция FI-3 | **CAUGHT** |
| K4 | Полная деталь потеряна для оператора | инъекция FI-4 | **CAUGHT** |
| K5 | Закрытые ключи `err`/`error` начали течь глобально | инъекция FI-5 | **CAUGHT** |
| K6 | Побочная дверь в обход `jsonError` | взгляд (§4) | **CAUGHT** (дверь одна) |
| K7 | Server action отдаёт сырое сообщение | инъекция FI-6 | **CAUGHT** |
| K8 | Три React-границы рендерят текст исключения | инъекции FI-7/8/9 | **CAUGHT** (все три) |
| K9 | `working-hours` отдаёт dev-detail | `rg` + инъекция FI-10 | **CAUGHT** |
| K10 | Гейт пропускает форму обхода | 14 проб (§5) | **частично** — все названные формы пойманы, три ненаписанные — нет |
| K11 | Гейт ложно срабатывает на безопасных формах | self-test + прогон дерева | **CAUGHT** |
| K12 | Замороженный долг растёт молча | инъекция FI-DRIFT | **CAUGHT** |
| K13 | API переиспользует React `error.digest` | взгляд | **CAUGHT** (не переиспользует) |
| K14 | `operatorErrorDetail` достижим мимо двери | взгляд | **CAUGHT** (один писатель) |

### Карта «инъекция → покрасневшее утверждение»

Одна инъекция на независимый класс (§10b). Каждая откачена `git checkout --` сразу после прогона,
чистота дерева проверена после каждой.

| # | Что сломано | Покрасневшее утверждение |
|---|---|---|
| FI-1 | `mapApiError` при промахе возвращает `{ code: error.message }` | `never lets raw PostgreSQL/Drizzle detail become the mapped code…` + `never puts raw PostgreSQL/Drizzle detail into the response body…` (2 failed / 4 passed) |
| FI-2 | `mapApiError` всегда возвращает fallback | `keeps a known allowlisted domain code distinct from the fallback`, `…с declared status`, `leaves a known domain code untouched…` (3 failed / 10 passed) |
| FI-3 | лог пишется под `randomUUID()` вместо выданного id | `returns a correlation id to the caller and logs the full detail under that same id` (1 failed / 6 passed) |
| FI-4 | `operatorErrorDetail: serializeError` (закрытый сериализатор) | `keeps the full failure under the operator key` + `records the cause chain…` (2 failed / 5 passed) |
| FI-5 | `err`/`error` переведены на детальный сериализатор | `still drops the failure text under the closed err/error keys` (1 failed / 6 passed) |
| FI-6 | `safeActionErrorCode` возвращает `error.message` | `gives server actions the same decision: safe code out, full detail to the operator` (1 failed / 6 passed) |
| FI-7 | doctor `SegmentRouteError` снова рендерит `error.message` | `shows a human-safe message instead of the raw SQL/table text` (1 failed / 2 passed) |
| FI-8 | `global-error.tsx` снова рендерит `error.message` | то же утверждение (1 failed / 2 passed) |
| FI-9 | patient `SegmentRouteError` снова рендерит `error.message` | то же утверждение (1 failed / 2 passed) |
| FI-10 | в migrated `working-hours` возвращён alias-слив | гейт: `working-hours/route.ts:53 api-json-error-text`, exit 1 |
| FI-DRIFT | лишняя точка в замороженном `doctor/comments/route.ts` | гейт: `3 sites, frozen at 2 — new debt in a frozen file`, exit 1 |

**Инъекция, которая оказалась негодной, и это записано честно.** Первая попытка FI-3 подменяла
аргумент на `ensureCorrelationId(crypto.randomUUID())` — тест остался зелёным. Это не пропуск гейта:
`ensureCorrelationId` по построению возвращает уже лежащий в ALS-ячейке id и аргумент игнорирует, то
есть расхождения не возникало. Инъекция переделана на настоящий второй id (`randomUUID()`), и
утверждение покраснело.

---

## 3. Перепись, перемеренная заново (команды рядом с числами)

Запускалось из корня репозитория; `HEAD` = `406bbd97c`, родитель кандидата = `babdc87e8^`.

| Величина | Команда | База (`babdc87e8^`) | Сейчас |
|---|---|---|---|
| Всего `route.ts` | `rg --files -g 'src/app/api/**/route.ts' \| wc -l` (в `apps/webapp`) | — | **454** |
| `route.ts` с `error.message`/`err.message` | `git grep -l -E '\b(error\|err)\.message\b' <ref> -- 'apps/webapp/src/app/api/*/**/route.ts' \| wc -l` | **49** | **37** |
| Импортёров `shared/http/apiResponse` | `git grep -l "shared/http/apiResponse" <ref> -- apps/webapp/src \| wc -l` | **15** | **38** |
| Server-action файлов с `.message` | `git grep -l -E '\b(error\|err\|e)\.message\b' <ref> -- 'apps/webapp/src/app/**/actions.ts' 'apps/webapp/src/app/**/*Actions.ts'` | **5** | **2** |
| Замороженный легаси-долг | `node scripts/check-safe-error-transport.mjs` | — | **69 файлов / 87 точек** |

Число `49` из плана владельца воспроизведено на родителе кандидата точно — перепись R4 верна.
Заявленные воркером «14 импортёров» — это цифра плана; на родителе их **15**, расхождение на единицу
в пользу кандидата и на вывод не влияет.

**Разбор остатка `37` — главная разовая проверка этого этапа.** Воркер утверждает: переключено 19 из 49,
остальные 30 «только сравнивают или логируют». Проверено не по отчёту, а перечислением всех 47
вхождений и чтением каждого. Ни одно не отправляет неизвестный внутренний текст пользователю:

- **сравнение с литералом** (`msg === 'branch_service_not_found'`, `SAVE_CATALOG_KNOWN_CODES.has(...)`)
  с последующим ответом фиксированным кодом — `booking/slots`, `booking/catalog/services`,
  `clinic/billing/autopay/consent`, `admin/booking-engine/form-fields`, `patient/analytics/events` и др.;
- **сужение до проектного класса ошибки** — `booking/memberships/available` (`InPersonBookingResolveError`,
  сообщение = `code` из конструктора), `admin/settings` (`OperatorHealthProbeConfigInvalidError`),
  `clinic/billing` (`SaasBillingTariffDowngradeBlockedError`), `doctor/lfk-templates/actions`;
- **операторские приёмники, не ответ** — `auth/phone/messenger-bind/start:140` (`logger.error`),
  `integrator/operator-health/digest-wake:61` и `integrator/system-health/guard-wake:57`
  (`recordOperatorCronJobTickBestEffort`), `account/security/totp/start:31`,
  `account/security/password/change:76`. Ответ во всех — фиксированный код.

Отдельно проверено, что все переключенные файлы действительно ведут неизвестную ошибку в общую
проекцию: 13 `route.ts` зовут `jsonError({… fallback …})` напрямую, ещё семь — через `mapApiError`
и `membershipErrorResponse`, а `admin/settings` намеренно **пробрасывает** неизвестную ошибку в
`onRequestError` вместо того, чтобы её описывать. Ни одного мигрированного файла без безопасной
проекции нет.

---

## 4. Разовая структура — инспекция диффа и текущего дерева

- **S-B, одна дверь (§5 «Один общий проход»).** `jsonError` **параметризован** второй формой аргумента
  (`ApiFailure`), sibling-функции `jsonApiError` из прошлой попытки в дереве нет
  (`grep -rn "jsonApiError" src` пусто). Реализация решения ровно одна — `resolveApiFailure`; `jsonError`
  её HTTP-транспорт, `safeActionErrorCode` — не-HTTP. `membershipErrorResponse` перестал быть второй
  дверью: это теперь тонкий вызов `jsonError` с закрытым allowlist из 14 кодов.
- **S-F, `mapApiError` семантически неизменён.** `git diff` по файлу не трогает тело функции ни строкой;
  её оракул сравнивает дескриптор через `toEqual`, поэтому любое добавленное поле покраснело бы.
- **S-G, correlation id — существующий шов.** `ensureCorrelationId` живёт в `packages/db-principal`
  (последнее касание пакета — `90a4e2e55`, до кандидата) и переиспользует ту же ALS-ячейку принципала,
  что и `enterWithCorrelationId` на входе запроса. Новый параллельный механизм не заведён.
- **K13, React digest не переиспользован для API.** В `apiResponse.ts` `digest` не упоминается;
  в React-границах он остаётся как операторский идентификатор — это и есть замысел плана
  («для API нельзя переиспользовать React-only `error.digest`»), а не остаточная утечка: digest — хеш
  React, а не внутренний текст.
- **K14, `operatorErrorDetail` — явный типизированный opt-in.** Сериализатор
  `serializeOperatorErrorDetail` сохраняет `message`, `stack`, `code` (SQLSTATE), `class` и цепочку
  `cause` с ограничением глубины 3. Закрытый `serializeError` не тронут. Продуктовый писатель ключа
  **ровно один** — `resolveApiFailure`; непреднамеренного колл-сайта, способного увести деталь
  пользователю, нет. Проверено вживую: в выводе прогона видно
  `{"correlationId":"7164bf10-…","operatorErrorDetail":{"code":"42501","class":"42","message":"insert into \"be_patient_package_items\" …","stack":"…"}}`.
- **S-C, dev-detail удалён.** `grep -rn "NODE_ENV === 'development'" src/app/api` — пусто; в
  `working-hours` оба `catch` переведены на общую дверь с сохранением статуса 400.
- **S-E, гейт в настоящем пути.** `apps/webapp/package.json:11` → `pnpm --dir apps/webapp lint` запускает
  и гейт, и его self-test; корневой `lint` (`package.json:36`) зовёт webapp lint; `ci.yml:19` —
  job `lint` с `pnpm lint`. Это реальный CI-путь, не осиротевший скрипт.
- **Типизация авторского отказа.** `assertOperatorHealthProbeConfig` переведён на
  `OperatorHealthProbeConfigInvalidError`, и маршрут сузился с `error instanceof Error` на этот класс —
  до кандидата произвольная PostgreSQL-ошибка при `key === 'operator_health_probe_config'` уходила
  админу дословно. Это закрытие реальной дыры, а не косметика.

---

## 5. Гейт: что он ловит и где его граница (рекомендация, не finding)

Self-test гейта: **13 форм обхода отклонены, 10 канонических приняты**. Прогон по дереву:
`OK (69 files of frozen legacy debt unchanged)`.

Аудитор проверил гейт **собственными пробами**, а не его self-test: во временный файл
`src/app/api/__auditprobe/route.ts` подставлялась форма, запускался гейт, файл удалялся.
Все формы из брифа с обычным идентификатором **ловятся**:

| Форма | Результат |
|---|---|
| `json({ error: error.message })` | CAUGHT |
| `error.message \|\| 'failed'` (логическая) | CAUGHT |
| `cond ? error.message : 'failed'` (условная) | CAUGHT |
| `` `failed: ${error.message}` `` (шаблон) | CAUGHT |
| `{ meta: { inner: { detail: error.message } } }` (вложенный объект) | CAUGHT |
| `const body = {…}; return json(body)` (return-форма) | CAUGHT |
| `errors: [error.message]` (массив) | CAUGHT |
| `Response.json(...)` вместо `NextResponse` | CAUGHT |
| алиас в один и два прыжка | CAUGHT (self-test) |
| JSX `{error.message}` в границе | CAUGHT (self-test) |

**Три формы гейт не видит** — и ни одна не написана в плане владельца, поэтому это
**рекомендация владельцу, а не audit finding** (§24.6: гейт против плана, не генератор скоупа;
требование владельца дословно — «запрещающее литеральный `error.message`/`err.message` внутри
`NextResponse.json(...)`», и оно выполнено с запасом):

1. `String(error)` / `${error}` — приведение вместо `.message`. **Живой утечки нет:** все 30 вхождений
   `String(err)`/`String(error)` в непроверочном `src` стоят в логах, записях и конструкторах ошибок,
   ни одно не в аргументе ответа. Но идиома в репозитории живая, поэтому именно эта форма — самый
   вероятный путь рецидива.
2. `(error as Error).message` — приведение типа ломает `ts.isIdentifier`. В репозитории **0 вхождений**.
3. `const { message } = error` — деструктуризация не отслеживается `collectErrorTextNames`.
   В репозитории **0 вхождений**, поэтому «if relevant» из брифа разрешается как «не актуально».

Замечу отдельно, что форма, которую гейт ловит в лоб (`error.message` на голом идентификаторе), под
`strict`/`useUnknownInCatchVariables` вообще не компилируется без сужения — а сужение через
`instanceof Error` гейт ловит намеренно (self-test: `builtin Error guard does not exempt`). То есть
покрытие реальных форм этого репозитория полное.

**Заморозка долга работает механически:** счётчик на файл, `>` — «новый долг», `<` — «понизь число в
том же изменении». Инъекция FI-DRIFT подтверждена. Условие снятия названо в самом гейте
(модуль заводит авторский класс ошибки, маршрут на него сужается). Гейт покрывает `app/api/**` и
`.tsx`-границы — ровно две семьи, названные владельцем; server actions под гейт не попадают, что
соответствует тексту плана.

---

## 6. Прогоны (всё через `/home/dev/brain/host-orch/run-tests.sh`)

Воркспейс был без зависимостей: выполнены `pnpm install --frozen-lockfile` и
`pnpm -r --filter './packages/*' run build` (без них падал импорт `@bersoncare/db-principal` и
`@bersoncare/shared-contracts` — это состояние среды, не дефект кандидата).

| Проверка | Команда | Результат |
|---|---|---|
| Гейт S4 + self-test | `node scripts/check-safe-error-transport.mjs` (+ `--self-test`) | **OK** — 69 файлов долга, 13 отклонено / 10 принято |
| Целевые приёмочные | `vitest run` 4 файла S4 | **16 passed (16)** |
| Мигрированные семьи | `vitest run` 10 route/unit файлов | **66 passed (66)** |
| Typecheck webapp | `pnpm --dir apps/webapp typecheck` | **rc 0** |
| Lint webapp (все гейты) | `pnpm --dir apps/webapp lint` | **rc 0** |
| Фазовый набор `fast` | `pnpm test:webapp:fast` | **114 passed / 7 skipped (121)**, тестов 664 |
| Фазовый набор `behavior` | `pnpm test:webapp:behavior` | **1 failed / 226 passed (227)** — дефект §1 |

Полный CI не запускался: владелец зарезервировал его для объединённого SHA S1+S4 (план, «Порядок
выполнения», шаг 4). DB, DEV/TEST/PROD, deploy, миграции, push, taskdb, общие dev-порты не трогались.
Файлы S1 не менялись и S1 не переаудировался.

---

## 7. Вопросы владельцу (не работа, §24.6)

1. **Server action не отдаёт пользователю correlation id.** Решение владельца этой волны звучит как
   «S4 возвращает пользователю короткий безопасный correlation id, общий с серверным логом».
   В HTTP-двери это выполнено — `correlationId` лежит в теле. `safeActionErrorCode` возвращает только
   код: оператор получает полную деталь под id, но пользователь не получает, что процитировать.
   Механизм id для server actions план отдельно не описывает, поэтому аудитор это работой не считает.
   Нужен ли id в результате server action — решение владельца.
2. **69 файлов / 87 точек замороженного долга.** Подтверждено, что долг заморожен и расти не может
   (FI-DRIFT). Это авторские русские тексты валидации из `treatment-program*`, `courses`, `comments`,
   которые сегодня видит врач и пациент. Они по-прежнему отдают неизвестную внутреннюю ошибку тем же
   способом. Типизация «доменное против внутреннего» для этих модулей — отдельное решение, S4 его
   не расширяет.
3. **Форма `String(error)` как вероятный путь рецидива** — см. §5. Расширять гейт или нет, решает
   владелец; текущий гейт требованию плана соответствует.

---

## 8. Итог

- Kill-set: **13/14 закрыты полностью, 1 (K10) — все названные формы пойманы**, три ненаписанные формы
  вынесены рекомендацией.
- Инъекций посажено **11**, покраснело **11**, не поймано **0**; все откачены, дерево чистое.
- Разовая структура (одна дверь, стабильный `mapApiError`, существующий correlation-seam, удалённый
  dev-detail, перепись, проводка гейта в CI, заморозка долга) — **принята**.
- **Блокер один и он механический:** незаконченное обновление мока в
  `src/app/app/settings/page.unit.test.ts` роняет job `webapp behavior`.

**НЕ СДЕЛАНО:** продуктовый код не менялся (аудит только); новых приёмочных тестов не добавлено —
дефект уже представлен красным тестом репозитория, дубль запрещён §10b; строка очереди в
`NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md` **не** переведена в accepted, потому что вердикт `FAIL`;
full CI, живая проверка, DEV/TEST/PROD, deploy, миграции, push и taskdb не выполнялись.

После правки мока исполнителем (§24.1 — микроправка ведущего, не отдельный worker) достаточно
перезапустить `pnpm test:webapp:behavior`; повторный слепой проход по §24.5 не нужен — поверхность
не меняется, kill-set и инъекции этого отчёта переиспользуются.

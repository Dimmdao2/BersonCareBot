# Track D S4 — re-audit новой поверхности action-result/UI + живая приёмка (04.09.2026)

**Вердикт: `PASS`. MUST FIX нет. Продуктовый код аудитором не менялся.**

Кандидат: `HEAD` ветки `wt/trackd-completion-20260904` = `b0b58ae4b` (queue merge);
продуктовый commit `78e903672` («S4 — server actions return the correlation id they logged»).
Аудитор: независимый Claude Opus 5, роль `auditor-live`, слепой протокол §24.5 / §10b.

Authority: `AGENTS.md` §1/1a/1b/5/7/9/10/10a/10b/12/14a/16/21/24; `README.md`;
`docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md`; `docs/ARCHITECTURE/SERVER CONVENTIONS.md`;
`docs/_TODO/SYSTEMIC_RESIDUAL_AUDIT_AND_FIX_PLAN_2026-08-27.md` (волна 03.09, S4 `:210-224` +
решение владельца `:277-281`); `docs/_TODO/S4_ERROR_BOUNDARY_INDEPENDENT_AUDIT_2026-09-04.md`;
`docs/_TODO/S4_ERROR_BOUNDARY_IMPLEMENTATION_2026-09-04.md`.

Scope — **только** новая поверхность «action-result → UI → лог», введённая `78e903672`, плюс
pre-landing live proof (§24.3: воркер не принимает собственную живую проверку). Повторного слепого
аудита всей двери API/React здесь нет: kill-set K1–K14 и карта инъекций FI-1…FI-DRIFT прошлого
артефакта переиспользованы как есть (§24.5 — поверхность двери не менялась).

**Замечание по authority-списку брифа (не finding).** Названный в брифе
`docs/_TODO/S4_ERROR_BOUNDARY_ACCEPTANCE_AUDIT_2026-09-03.md` в репозитории отсутствует и никогда не
существовал:

```bash
git log --all --pretty=format: --name-only --diff-filter=A | sort -u | grep -i ERROR_BOUNDARY
#   docs/_TODO/S4_ERROR_BOUNDARY_IMPLEMENTATION_2026-09-04.md
#   docs/_TODO/S4_ERROR_BOUNDARY_INDEPENDENT_AUDIT_2026-09-04.md
```

Приёмочный аудит S4 — это второй файл (commit `3f3f3174d`, вердикт `FAIL`); он прочитан целиком.

---

## 1. Слепой kill-set новой поверхности

Зафиксирован в этом файле **до** `git show 78e903672`, до чтения раздела D
`S4_ERROR_BOUNDARY_IMPLEMENTATION_2026-09-04.md` и до открытия любого тестового файла кандидата.

| ID | Названный класс поломки | §24.4 | Метод | Вердикт |
|---|---|---|---|---|
| N1 | Общая non-HTTP дверь получает/логирует id, но action-result его теряет | поведение | тест + FI-1 | **CLOSED** |
| N2 | Один или несколько из всех S4-migrated action callsites продолжают возвращать только строку | разовое | перепись + FI-2 | **CLOSED** |
| N3 | UI не показывает id или показывает **не тот** id | поведение + live | FI-3, FI-5 + live B | **CLOSED** |
| N4 | UI / сериализованный action-result показывает SQL / таблицу / параметры / `42501` | поведение + live | FI-6 + live A и B | **CLOSED** |
| N5 | Доменный/typed отказ схлопнут в generic либо получает фиктивный id без log event | поведение | тест + FI-4 | **CLOSED** |
| N6 | Вторая mapper / error door / подстрочная эвристика / дублированный formatter вместо параметризации (§5) | разовое | взгляд по diff + перепись | **CLOSED** |
| N7 | Типы допускают прежнюю форму `{ok:false,error}` на migrated unknown-error path так, что regression не ловится | конструкция | probe `tsc` + census | **ЧАСТИЧНО** — см. §7.1 |

N7 — **единственный** незакрытый до конца пункт, и он **не MUST FIX**: сегодня достижимого нарушения
нет (перепись 18/18), а «конструкция могла бы быть сильнее» — это рекомендация, не finding
(`AGENTS.md` «Аудит/ревью ищет только реальные нарушения», §24.6). Подробности и точное измерение — §7.1.

---

## 2. Перепись, перемеренная заново (каждое число рядом со своей командой)

Из корня репозитория. `HEAD` = `b0b58ae4b`, родитель кандидата = `78e903672^`,
pre-S4 база = `babdc87e8^`.

| Величина | Команда | Значение |
|---|---|---|
| Остатки старого имени в **коде** | `git grep -n "safeActionErrorCode" -- 'apps/webapp/src' 'apps/webapp/scripts' 'scripts' \| wc -l` | **0** |
| Остатки старого имени во всём дереве | `git grep -c "safeActionErrorCode" -- .` | только 3 **исторических** документа (`NIGHT_WAVE_AUDIT_QUEUE…` 2, `…IMPLEMENTATION…` 9, `…INDEPENDENT_AUDIT…` 6) |
| Сайты `safeActionFailure(` (src, non-test, без самой двери) | `git grep -n "safeActionFailure(" -- 'apps/webapp/src' \| grep -v '\.test\.' \| grep -v apiResponse.ts \| wc -l` | **18** |
| Сайты `safeActionErrorCode(` на родителе кандидата | `git grep -n "safeActionErrorCode(" 78e903672^ -- 'apps/webapp/src' \| grep -v '\.test\.' \| grep -v apiResponse.ts \| wc -l` | **18** |
| Файлы семьи | per-file `grep -c` (ниже) | **4** |
| Всех `'use server'` файлов в webapp | `git grep -l "^'use server'" -- 'apps/webapp/src' \| wc -l` | **30** |
| Потребители `ActionFailureText` (non-test) | `git grep -l "shared/ui/doctor/ActionFailureText" -- 'apps/webapp/src' \| grep -v '\.test\.' \| wc -l` | **11** |
| Все non-test файлы, зовущие любую из 18 мигрированных action-функций | `grep -rlE "<18 имён>" --include=*.tsx --include=*.ts src \| grep -v '\.test\.'` | **16** = 11 UI + 4 action-модуля + `protectedActionRegistry.ts` (реестр, не рендерит отказ) |
| Замороженный легаси-долг | `node apps/webapp/scripts/check-safe-error-transport.mjs` | **OK — 69 файлов, без сдвига** |
| Новые `any` / `as unknown as` / `@ts-ignore` / `eslint-disable` в диффе | `git show 78e903672 -- 'apps/webapp/src' \| grep '^+' \| grep -E '\bany\b\|as unknown as\|@ts-(ignore\|expect-error)\|eslint-disable'` | **0** |
| Новые raw-error sinks в диффе | `git show 78e903672 -- 'apps/webapp/src' \| grep '^+' \| grep -E '\berror\.message\b\|\berr\.message\b\|String\(err\|\.stack\b'` | **0** |
| Правки ESLint-allowlist | `git show --name-only 78e903672 \| grep -i eslint` | **файл не тронут** |

Перепись 18 сайтов по файлам (`grep -c 'safeActionFailure(' <файл>`) — совпадает с базой один в один:

| Файл | Сайтов сейчас | Сайтов на `78e903672^` |
|---|---:|---:|
| `apps/webapp/src/app/app/settings/patient-home/actions.ts` | 11 | 11 |
| `apps/webapp/src/app/app/doctor/patient-home/patientHomeDoctorSettingsActions.ts` | 3 | 3 |
| `apps/webapp/src/app/app/doctor/lfk-templates/actions.ts` | 3 | 3 |
| `apps/webapp/src/app/app/settings/brandingActions.ts` | 1 | 1 |

**N2 — прочитан каждый из 18 сайтов, не отчёт.** Все 18 отдают результат либо прямым
`{ ok: false, ...safeActionFailure(...) }`, либо через `fail(...)`, который спредит
`ActionFailureFields` целиком. Формы «взять только `.error`» нет ни в одном. Цифру владельца
«11 server actions» воспроизвёл: она считалась по паттерну `.message` **до** миграции — на `babdc87e8^`
это `git grep -n -E '\b(error|err|e)\.message\b' babdc87e8^ -- '…/actions.ts' '…/*Actions.ts' | wc -l`
→ **25 сайтов в 5 файлах**; 18 из них — семья двери, остальные 7 — `doctor/references/actions.ts`
(закрытый allowlist `SAVE_CATALOG_KNOWN_CODES` + сравнение с литералом `category_required`,
прочитано построчно) и четыре `kind:'invalid'` в `lfk-templates`, сужённые на авторские классы
`isTemplateArchiveNotFoundError` / `isTemplateArchiveAlreadyArchivedError` /
`isTemplateUnarchiveNotArchivedError`, у которых неизвестная ветка возвращает фиксированный текст
и пишет `logger.warn`. Неизвестный внутренний текст пользователю не уходит ни из одного из них.

**N3 — прочитан каждый из 11 потребителей.** Все хранят `useState<ActionFailureFields | null>` и
кладут туда **весь** результат (`setError(res)`), а не `res.error`. `OrgBrandingSection` — единственный,
кто переписывает поле: `setError({ ...result, error: SAVE_ERROR_MESSAGES[result.error] ?? '…' })`, то
есть свой доменный текст сохраняется, а `correlationId` едет рядом. Клиентские валидации
(`setError({ error: 'Введите число от 1 до 10.' })`) идут без id — верно: под них ничего не подшито.
`TemplateEditor` — тост, одна строка через `actionFailureLine(res)`.

---

## 3. Структура: одна дверь, а не вторая рядом (N6)

- **Дифф в `apps/webapp/src/shared/http/apiResponse.ts` — ровно 2 хунка и ровно 2 удалённые строки**,
  обе — старая сигнатура и тело `safeActionErrorCode`. `resolveApiFailure`, `mapApiError`, `jsonError`
  не изменены ни строкой (`git show 78e903672 -- …/apiResponse.ts | grep -E '^-' | grep -v '^---'`).
- **Одна реализация решения.** `resolveApiFailure` — единственная; её зовут ровно две точки-транспорта:
  `jsonError` (HTTP) и `safeActionFailure` (non-HTTP). Проверено
  `git grep -n "resolveApiFailure(" -- 'apps/webapp/src' | grep -v '\.test\.'` → 3 строки: объявление
  и два вызова, обе внутри `apiResponse.ts`.
- **Один продуктовый писатель `operatorErrorDetail`** — `resolveApiFailure:157`
  (`git grep -n operatorErrorDetail -- 'apps/webapp/src' | grep -v '\.test\.'`: 2 комментария +
  сериализатор в `logger.ts:106` + этот единственный вызов).
- **Переименование, а не новая функция.** `safeActionErrorCode` → `safeActionFailure` по §5
  («если после расширения имя точки перестало описывать её работу, точка переименовывается в том же
  изменении»): она больше не возвращает код, она возвращает решение. Возврат — `ActionFailureFields`
  `{ error: string; correlationId?: string }`, те же имена полей, что у `ApiErrorResponseBody`.
- **Помощники `fail()` параметризованы, а не расщеплены.** В обоих файлах —
  `fail(failure: string | ActionFailureFields)`, а не `fail()` + `failFromDoor()`. Это ровно то, чего
  требует §5 («варианты одного действия — параметры одной точки»).
- **UI — одна точка показа.** `shared/ui/doctor/ActionFailureText.tsx` содержит один источник решения
  `actionFailureSupportRef()` и два его потребителя для двух физически разных носителей: JSX-строка
  (`ActionFailureText`) и однострочный текст для тоста (`actionFailureLine`). Второй формулировки
  нет — `SUPPORT_REF_LABEL` один. Фраза «Код для поддержки» не выдумана: она уже стоит в
  `DataLoadFailureNotice.tsx:44` (§21 — не заводить второй текст для того же).
  `git grep -n "Код для поддержки" --include=*.tsx src | grep -v '\.test\.'` → ровно эти два места,
  и `DataLoadFailureNotice` кандидатом не тронут (он про React `digest`, другой источник).
- **Подстрочных эвристик, второго сериализатора и второго маппера нет.** `mapApiError` по-прежнему
  без глобального реестра, без substring, без инспекции SQL. `serializeError` (закрытый) не тронут.
- **`AuthBootstrap.tsx`** упоминает `correlationId`, но это пациентский auth-bootstrap с собственным
  заголовком `x-bc-auth-correlation-id`; кандидатом файл не тронут, второй дверью отказа action не является.

---

## 4. Прогоны (всё через `/home/dev/brain/host-orch/run-tests.sh`)

| Проверка | Команда | Результат |
|---|---|---|
| Целевые S4 (4 файла) | `vitest run safeErrorTransport.unit + apiResponse.unit + errorBoundarySafeMessage.ui + patientHomeActionFailureReference.ui` | **4 files / 17 passed** |
| S4 + вся затронутая action/UI/route-связка | `vitest run` 12 файлов (те же 4 + `tariffMechanics.route`, `tariffMechanicsRefusals.ui`, `OrgBrandingSection.ui`, `settings/page.unit`, `protectedActionRegistryCoverage.unit`, `patientPackagesRouteShared.unit`, `…/payment/route.route`, `PatientHomeBlockRuntimeStatusBadge.ui`) | **12 files / 94 passed** |
| Гейт S4 | `node apps/webapp/scripts/check-safe-error-transport.mjs` | **OK (69 файлов долга, без сдвига)** |
| Self-test гейта | `… --self-test` | **OK (13 форм обхода отклонено, 10 канонических принято)** |
| Typecheck + lint webapp | `pnpm --dir apps/webapp typecheck && pnpm --dir apps/webapp lint` | **rc 0** (205 s; в lint входят все гейты и их self-test) |

Full CI и повтор полного behavior-набора **не запускались** — по брифу и по решению владельца
(один прогон на объединённом SHA S1+S4, отдельным Sonnet-run). §10 «Strong reuse»: после live-прохода
рабочее дерево побайтово вернулось к `HEAD` (доказательство — §6.3), поэтому повторный прогон того же
набора на неизменённом коде не запускался осознанно, а не пропущен.

---

## 5. Fault injection — по одной на независимый класс, все откачены немедленно

Набор для инъекций (6 файлов, baseline **30 passed**):
`safeErrorTransport.unit`, `apiResponse.unit`, `errorBoundarySafeMessage.ui`,
`patientHomeActionFailureReference.ui`, `tariffMechanicsRefusals.ui`, `OrgBrandingSection.ui`.
Новых тестов не написано: существующие оракулы краснеют на каждый названный класс (§10b — дубль запрещён).

| # | Класс | Что сломано | Покрасневшее утверждение | Счёт |
|---|---|---|---|---|
| FI-1 | N1 | `safeActionFailure` снова отдаёт только код (`void correlationId`) | `gives server actions the same decision…` (`expected undefined to be 'ec53a862…'`), `trusts the typed authored outcome…`, ui `expected 'forbidden' to contain 'Код для поддержки: b2963bc4…'` | **3 failed / 27 passed** |
| FI-2 | N2 | дверь верна, но **один реальный** мигрированный action кладёт в результат только `.error` (`savePatientHomePracticeTargetAction`) | **только** ui: `expected 'forbidden' to contain 'Код для поддержки: 8fe76de7…'` | **1 failed / 29 passed** |
| FI-3 | N3 (спрятан) | `actionFailureSupportRef` возвращает `null` — единая точка показа перестала рендерить ссылку | ui: `expected 'forbidden' to contain 'Код для поддержки: 0f4894c5…'` | **1 failed / 29 passed** |
| FI-4 | N5 | `mapApiError` схлопывает `TypedApiResponseError` в fallback — доменный отказ становится generic **и получает id** | ui: `expected 'forbiddenКод для поддержки: 7d641f29…' to be 'Невозможно изменить настройки…'`; unit: `keeps a trusted typed error distinct from the fallback`, `trusts the typed authored outcome…` | **3 failed / 27 passed** |
| FI-5 | N3 (**не тот** id) — проба аудитора, в списке fixer'а её нет | дверь отдаёт свежий `randomUUID()` вместо того id, под которым написан лог | unit: `expected '6b8bd8d1…' to be 'b4a77239…'`; ui: `expected 'forbiddenКод для поддержки: 99efdb09…' to contain 'Код для поддержки: 1dbf833f…'` | **2 failed / 28 passed** |
| FI-6 | N4 — проба аудитора, в списке fixer'а её нет | action-result несёт сырой внутренний текст: `error: \`${descriptor.code}: ${String(error)}\`` | ui: `expected 'forbidden: Error: insert into "be_pat…' not to match /insert into\|be_patient_package_items…/i`; unit ×2 | **3 failed / 27 passed** |

**Посажено 6, покраснело 6, не поймано 0.** Каждая откачена `git checkout --` сразу после прогона;
чистота дерева проверялась после каждой.

**Что этими инъекциями честно НЕ доказано (записано, а не умолчано).** FI-2 показывает, что сквозной
тест держит контракт результата на **одном** из 18 сайтов — том, что покрыт
`patientHomeActionFailureReference.ui.test.tsx`. Аналогичная потеря id на любом из остальных 17 сайтов
поведенческим тестом не ловится; она закрыта переписью §2 (взгляд по каждому сайту) и разбором типов
§7.1 — то есть методом, который §24.4 и предписывает для массового разового переключения.

---

## 6. Живая приёмка перед приземлением (§24.3)

Изолированно. `pnpm webapp:dev` / `dev:turbo` / `scripts/run-webapp-dev.sh` / `runs/dev-interactive-audit`
**не использовались** — они первым делом зовут `scripts/kill-local-dev-ports.sh` и убили бы владельческий
слушатель `:5200`. PROD, TEST, deploy, миграции, grant/revoke, внешняя доставка — не трогались.

Запуск (из `apps/webapp`, отдельная process group):

```bash
ENV_FILE=/home/dev/dev-projects/BersonCareBot/apps/webapp/.env.dev \
PORT=5314 APP_BASE_URL=http://127.0.0.1:5314 PATIENT_APP_ORIGIN=http://127.0.0.1:5314 \
setsid pnpm exec next dev --webpack --disable-source-maps -H 127.0.0.1 -p 5314
```

- **Порт свободен до старта:** `ss -ltnp | grep :5314` → пусто (напечатано `5314 FREE` перед запуском).
- **Значения env не печатались** — `.env.dev` канонического главного чекаута подан путём через `ENV_FILE`
  (его читает `apps/webapp/src/config/loadEnv.ts`), файл не открывался и не копировался.
- **Изоляция от владельца доказана по PGID, а не по имени процесса:**
  аудит `:5314` pid=2156213 pgid=**2156180**; владелец `:5200` pid=2038697 pgid=**2038641**;
  `ls -l /proc/2038697/cwd` → `/home/dev/dev-projects/BersonCareBot/apps/webapp` — другой чекаут.
- Temp dir: `mktemp -d /tmp/bcb-s4-live.XXXXXX` → `/tmp/bcb-s4-live.2jquia`;
  лог сервера — `/tmp/bcb-s4-live.2jquia/next-dev.log`; PID/PGID — `server.pid` / `server.pgid` там же.
  Cookie jar (`state.json`), скриншоты и raw-env остались в temp dir и **не коммитятся**.
- Bounded readiness: цикл до 120 с, порт открылся за 1 с.

Идентификаторы ниже сокращены (первые 8 символов) — это эфемерные DEV-correlation id одного прогона.

### 6.1. Проход A — API / runtime / log

Временная header-gated инъекция внутри существующего `try` в
`apps/webapp/src/app/api/booking/public/slots/route.ts`, до штатной ветки:
`x-bc-s4-live-audit: 78e903672` → `Object.assign(new Error('S4_LIVE_AUDIT insert into
"be_patient_package_items" ("id") VALUES ($1)'), { code: '42501' })`.

| Проверка | Факт |
|---|---|
| Control `GET /api/booking/public/slots?type=online&category=general` **без** заголовка | `HTTP/1.1 400`, тело `{"ok":false,"error":"ambiguous_booking_tenant"}` — штатный фиксированный доменный ответ, **без** `correlationId` (известный код — под него ничего не подшито) |
| Тот же запрос **с** заголовком | `HTTP/1.1 503` |
| Тело | ровно три ключа `['correlationId','error','ok']`: `{"ok":false,"error":"slots_unavailable","correlationId":"362d4966…"}` |
| `correlationId` | непустой, UUID-формы (проверено регэкспом), `362d4966…` |
| Заголовок `x-bc-correlation-id` | `362d4966…` — **равен** id в теле |
| Утечки в теле + заголовках | поиск `S4_LIVE_AUDIT / insert into / be_patient_package_items / SELECT / VALUES / 42501 / permission denied` → **NONE** |
| Операторский лог в bounded-окне (`tail -n +12` от `next-dev.log`, 31 строка) | ровно **1** запись с этим id |

Запись лога (ANSI снят):

```
[2026-09-04 03:23:33.928 +0300] ERROR (2156213): public_booking_slots_failed
    service: "bersoncare-webapp"
    correlationId: "362d4966…"
    operatorErrorDetail: {
      "type": "Error", "code": "42501", "class": "42",
      "message": "S4_LIVE_AUDIT insert into \"be_patient_package_items\" (\"id\") VALUES ($1)",
      "stack": "Error: S4_LIVE_AUDIT insert into … at GET (…/api/booking/public/slots/route.ts:65:33) …"
    }
```

Все клаузы прохода A выполнены: `public_booking_slots_failed`, `42501`, класс `42`, полный
marker/message, stack — у оператора; у пользователя только safe-поля и тот же id.

### 6.2. Проход B — настоящий server action → настоящий UI → тот же log id

Временная безусловная инъекция в `savePatientHomePracticeTargetAction`
(`apps/webapp/src/app/app/doctor/patient-home/patientHomeDoctorSettingsActions.ts`), поставленная
**после** `requirePatientHomeOwnerOrThrow()` (сессия + `membershipRole === 'owner'` + entitlement
`patient_home_today`) и валидации диапазона, но **до** `buildAppDeps()` и вызова порта
`deps.systemSettings.updateSetting`. Текст —
`S4_ACTION_LIVE_AUDIT insert into "be_patient_package_items" ("id") VALUES ($1) - permission denied
for table be_patient_package_items`, `code: '42501'`.

Живой браузер: Playwright 1.61.0 (глобальный) + системный Chromium 152 (`/usr/bin/chromium-browser`),
свой context и cookie jar. Вход — **штатный** email/password owner-врача из `AGENTS.md` §1a
(`dimmdao@yandex.ru`), через `/api/auth/dev-public` → `/app` → «Войти по паролю». После входа —
`/app/doctor` shell, «Пользователь: Дмитрий Берсон».

Фактический UI-путь панели — **`/app/doctor/patient-home`**, а не `/app/settings/patient-home`:
`PatientHomePracticeTargetPanel` рендерится из `src/app/app/doctor/patient-home/page.tsx:143` под
условием `canManagePatientHome`. Живая проверка сделана по фактическому пути, компонентным тестом
не подменялась.

Гидратация доказана до клика: ввод в контролируемый `Input` меняет его значение
(`INPUT_VALUE_AFTER_TYPING: 5`), то есть React владеет полем.

| Проверка | Факт |
|---|---|
| Запрос реально завершился неуспехом | перехвачен настоящий server-action POST на `/app/doctor/patient-home`, status 200, RSC-поток содержит `1:{"ok":false,"error":"forbidden","correlationId":"c6cf494d…"}` |
| Сериализованный action-result | только safe-поля; ни marker, ни SQL, ни таблицы, ни `42501` |
| На экране | `role="alert"` = `«forbidden»` + отдельной строкой `«Код для поддержки: c6cf494d…»` |
| Marker / SQL / table / `42501` / параметры на экране | поиск по `alert`, по всему `body` после действия и по `body` после reload → **NONE** (единственное совпадение `$1` в дампе страницы — это RSC-flight-синтаксис Next `\"$1a\"`, 130 вхождений, ни одного из инъекции; проверено печатью контекста) |
| Тот же uuid в серверном логе | **да**, ровно 1 запись в bounded-окне (`tail -n +701`, 77 строк) |
| Reload | `role="alert"` count = **0** (transient alert ушёл), `«Сохранено»` **не** появилось (ложного успеха нет) |
| DB-write не произошёл | после reload поле показывает прежнее сохранённое `3`, введённое `5` не сохранилось; throw стоит до `buildAppDeps()`/порта |

Запись лога (ANSI снят):

```
[2026-09-04 03:33:32.657 +0300] ERROR (2162353): patient_home_doctor_setting_failed
    service: "bersoncare-webapp"
    correlationId: "c6cf494d…"
    orgId: "a0000000-…"
    operatorErrorDetail: {
      "type": "Error", "code": "42501", "class": "42",
      "message": "S4_ACTION_LIVE_AUDIT insert into \"be_patient_package_items\" (\"id\") VALUES ($1) - permission denied for table be_patient_package_items",
      "stack": "Error: S4_ACTION_LIVE_AUDIT … at savePatientHomePracticeTargetAction (…/patientHomeDoctorSettingsActions.ts:91:29) …"
    }
```

`orgId` в записи дополнительно доказывает, что инъекция сработала **после** штатных
auth/workspace/entitlement-гейтов, а не до них.

Живой server-action transport через текущий dev-runtime вызывается — BLOCKER'а нет.

### 6.3. Cleanup proof

- Убита **только** проверенная process group: `kill -TERM -2156180`, затем `kill -9 -2156180`.
  Итог: `audit group members left: 0`, `5314 CLOSED`.
- Владельческий слушатель цел: `:5200` — 1 listener, pid **2038697** (тот же, что до запуска).
- Браузеры: `ps -eo pid,ppid,cmd | grep -i chrom` → пусто.
- Временные продуктовые правки восстановлены и **побайтово** совпадают с `HEAD`:

| Файл | `git hash-object` в дереве | `git rev-parse HEAD:<файл>` |
|---|---|---|
| `apps/webapp/src/app/api/booking/public/slots/route.ts` | `47020d62d…` | `47020d62d…` |
| `apps/webapp/src/app/app/doctor/patient-home/patientHomeDoctorSettingsActions.ts` | `8a6946a3f…` | `8a6946a3f…` |

- `grep -rn "S4_LIVE_AUDIT\|S4_ACTION_LIVE_AUDIT\|x-bc-s4-live-audit\|void SUPPORT_REF_LABEL\|void
  correlationId" --include='*.ts' --include='*.tsx' --include='*.mjs' apps packages scripts` → **NONE**.
- `git status --porcelain` → только `?? docs/_TODO/S4_ACTION_CORRELATION_REAUDIT_2026-09-04.md`.
- `apps/webapp/.next` создан прогоном dev-сервера, но он в `.gitignore`
  (`git check-ignore -q apps/webapp/.next` → yes) и в коммит не попадает; вслепую он не удалялся (§1b.6).
- Cookie jar, скриншоты и raw env остались только в `/tmp/bcb-s4-live.2jquia` и не коммитятся.

---

## 7. Что осталось открытым — вопросы владельцу, не работа (§24.6)

### 7.1. N7: типы **не** запрещают возврат прежней формы (частичный, не MUST FIX)

Измерено, а не предположено. Прежняя форма возвращена в один реальный мигрированный сайт:

```ts
// savePatientHomePracticeTargetAction, catch:
return { ok: false, error: safeActionFailure(error, 'forbidden', 'patient_home_doctor_setting_failed').error };
```

`pnpm --dir apps/webapp typecheck` → **rc 0**. То есть `correlationId?: string` необязателен, и
`{ ok: false } & ActionFailureFields` пропускает результат без id. По лестнице §10a это ступень 2
(тест), а не ступень 1 (конструкция): неверное состояние выразимо.

Почему это **не** finding: достижимого нарушения сегодня нет — перепись §2 показывает 18/18 сайтов
со спредом, и FI-2 доказывает, что на покрытом пути регрессия краснеет. Разрыв — в том, что
остальные 17 путей защищены только переписью и ревью, а не типом. Усилить конструкцию (например,
сделать `ActionFailureFields` непрозрачным/branded, чтобы его нельзя было разобрать по полю)
— альтернативная архитектура, а её §24.6 и `AGENTS.md` прямо выводят из MUST FIX. **Решает владелец.**

### 7.2. `redirect()` внутри `try` мигрированных actions даёт `forbidden` + код поддержки (pre-existing)

`requireDoctorWorkspaceContext()` при нехватке capability `clinical.workspace` вызывает `redirect()`,
а Next реализует его control-flow-исключением. `catch` этих actions ловит всё, и такой сигнал
проходит через дверь как неизвестный отказ: минтится id, пишется `logger.error`, пользователь видит
`forbidden` + код поддержки вместо перенаправления. `grep -rn "isRedirectError\|NEXT_REDIRECT\|
unstable_rethrow" --include='*.ts*' apps/webapp/src | grep -v '\.test\.'` → пусто.

**Это не новая поверхность и не дыра доступа:** на `babdc87e8^` тот же `catch` возвращал
`error.message`, то есть было хуже; отказ в доступе сохраняется в обоих случаях, страница и так
редиректит тем же гейтом. Практический эффект — лишняя ERROR-строка и код поддержки под
control-flow-сигнал. Вне scope S4; выношу как вопрос.

### 7.3. Перенесённое без изменений из прошлого аудита

`String(error)` как вероятный путь рецидива мимо гейта, касты и деструктуризация (§5 прошлого
артефакта), correlation id для **69 файлов / 87 точек** замороженного долга (§7 там же) — не тронуты
и остаются вопросами владельцу. Долг подтверждённо не растёт: гейт `OK (69 files … unchanged)`.

---

## 8. Итог

- Kill-set новой поверхности: **6 из 7 классов закрыты полностью**, N7 — частично (конструкция не
  запрещает, поведение закрыто на 1 из 18 путей + перепись 18/18). **MUST FIX нет.**
- Инъекций посажено **6**, покраснело **6**, не поймано **0**; все откачены, дерево чистое.
- Прогоны: **17 passed** (целевые S4), **94 passed** (S4 + вся затронутая связка, 12 файлов),
  гейт **OK (69)** + self-test **OK (13/10)**, typecheck+lint **rc 0**.
- Живая приёмка перед приземлением пройдена в обоих проходах: HTTP-дверь и настоящий server action
  отдают пользователю только safe-поля и тот самый id, под которым оператор получает `42501`,
  класс `42`, полный текст и stack.

**НЕ СДЕЛАНО (обязательная секция):**

- Продуктовый код аудитором **не менялся**; новых acceptance-тестов не добавлено — вердикт `PASS`,
  а существующие оракулы краснеют на каждый названный класс (дубль запрещён §10b).
- **Full CI не запускался** и повтор полного `test:webapp:behavior` не делался — по брифу и решению
  владельца это один прогон на объединённом SHA S1+S4 отдельным Sonnet-run.
- Галочка S4 в плане владельца **не поставлена**, `NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md`, taskdb,
  исторический `FAIL` артефакта `S4_ERROR_BOUNDARY_INDEPENDENT_AUDIT_2026-09-04.md` и раздел D
  `…IMPLEMENTATION…` **не редактировались**.
- DEV reconcile, TEST, deploy, push, миграции, grant/revoke, внешняя доставка — не выполнялись.
  Живая проверка шла на изолированном `:5314` с DEV-конфигурацией только для чтения и входа; ни одной
  записи в БД не сделано (throw стоит до порта, подтверждено reload'ом).
- S1/S2/S3/S5/S6 и 69 файлов замороженного долга — не трогались.
- Повторного слепого аудита старой поверхности двери API/React не проводилось (§24.5): kill-set
  K1–K14 и инъекции FI-1…FI-DRIFT прошлого артефакта переиспользованы.

# Единый файл текстов ошибок/уведомлений — свести дубли, закрыть дыры

**Источник — решение владельца 13.09.2026, дословно:** «нам нужен файл какой-то... нам нужно перенести
все уведомления в одно место... если у нас есть в двух разных местах двумя разными названиями ошибка,
которая должна показывать неверный логин или имейл... нахуя это делать два раза». Плюс уточнение тем же
ходом: сначала понять, сколько РАЗНЫХ функций показа уведомления/ошибки вообще есть в коде (toast, hint,
inline-ошибка под полем) — если их несколько, делающих одно и то же, это САМ ПО СЕБЕ баг, который тоже
чинить. Только потом — сводить коды ошибок к одному объекту с текстами.

Прототип находки, из-за которой всё началось: `portal_access_denied` (роль зашла не в свою дверь) не имел
текста вообще — падал на generic «сбой на нашей стороне». Уже пофикшено точечно в
`apps/webapp/src/shared/ui/auth/staffSecurityErrorText.ts` (добавлен `case 'portal_access_denied'`,
текст намеренно неотличим от `invalid_credentials` — не палим роль/портал атакующему).

Этот файл — единственный источник «todo»/«done» по этой работе. Работать в отдельном ворктри, параллельно
основной очереди. **Тесты на этой работе не писать** — перенос механический, поведение/тексты не меняются
по смыслу (кроме закрытия реально пустых кейсов). Разрешено (и, скорее всего, стоит) добавить простой
статический gate-скрипт (не unit-тест) — ниже, пункт Г.

## Важное разграничение, найденное по дороге — НЕ путать два разных слоя

В репозитории уже есть отдельный, зрелый, gate-защищённый слой безопасности:
`app-layer/errors/safeUserError.ts` + `shared/errors/userFacingError.ts` (`UserFacingError`,
`classifyApiError`, `respondWithSafeApiError`, `safeActionErrorText`) — гарантирует, что сырой текст
пойманного исключения (SQL, driver error, provider response) НИКОГДА не долетает до пользователя;
только текст, явно помеченный `new UserFacingError('...')`, проходит наружу. Это защищено двумя
структурными gate-скриптами (`scripts/check-safe-user-error-door.mjs`,
`scripts/check-safe-error-transport.mjs`) — их НЕ трогать и в новый единый файл не сводить, это другая
задача (безопасность транспорта, а не UX-текст).

Эта работа — про ДРУГОЙ слой: готовый человеческий текст для ИЗВЕСТНОГО, ожидаемого кода ошибки/
уведомления (`staffSecurityErrorText.ts` и подобные — если найдутся) плюс инлайновые строки внутри
`new UserFacingError('...')` (19 вызовов на момент находки — `grep -rln "new UserFacingError(" src`)
и внутри клиентских `toast.error('...')`/аналогов. Именно эти тексты дедуплицировать и свести в один
файл. `UserFacingError`/`classifyApiError`/gate-скрипты остаются как есть — им можно (и стоит) читать
текст ИЗ нового единого файла вместо инлайновой строки, но сам механизм классификации/безопасного
транспорта не рефакторить.

## Что делать

**А. Разведка — сколько функций показа уведомления/ошибки вообще есть.**
Через `node /home/dev/brain/tools/code-search.mjs "<запрос>" --repo bcb [-k N]` (грепом — только
точные уже известные строки типа конкретных error-кодов) найти ВСЕ места, которые показывают
пользователю ошибку или уведомление: `toast.error`/`toast.success`/`toast(...)` и аналоги, кастомные
компоненты вида Hint/Banner/InlineError/FieldError, любой `setError`/`setMessage` под полем формы,
любые всплывающие/inline тексты. Составить список: (1) через какую функцию/компонент показано, (2) сколько
раз каждая функция встречается, (3) в скольких разных файлах. Если функций, делающих одно и то же
(например, показ ошибки формы), реально несколько по историческим причинам — это отдельная находка:
описать её явно (сколько функций, где) в отчёте, но НЕ обязательно схлопывать сами функции показа в
одну в этой работе, если это тянет за собой рефактор рендеринга — цель этой работы это ТЕКСТЫ, а не сама
механика показа. Если видно, что objединение функций показа дешёвое и безопасное — можно сделать, но не
в ущерб пункту Б.

**Б. Собрать все коды ошибок/уведомлений и все места, где для них уже есть текст.**
Найти существующие файлы-словари (уже известен `staffSecurityErrorText.ts`; могут быть другие
по образцу — искать `*ErrorText*`, `*errorMessage*`, `*ErrorMessage*`, инлайновые `switch(error)`/
`Record<string, string>` заголовки под каждый код). Для каждого места показа сверить: код опознан
словарём → текст есть; код НЕ опознан (падает на generic fallback типа «сбой на нашей стороне»,
«что-то пошло не так», пустая строка) → это находка, список таких — обязательная часть отчёта.

**В. Один файл на весь репозиторий, дедуп по смыслу, а не по домену.**
Свести ВСЕ коды и тексты уведомлений/ошибок (не только staff-security — все домены: doctor, patient,
admin, booking, любые другие) в ОДИН файл/объект (например `shared/notifications/notificationText.ts`
или подобное — выбрать по факту структуры репо). Дедупликация — по смыслу, не по формальному совпадению
строки: если два места хотят сказать «неверный email или пароль» — один код, один текст, а не
`doctor_invalid_credentials` и `patient_invalid_credentials` с одинаковым текстом. Where два похожих
текста РАЗЛИЧАЮТСЯ намеренно по соображениям безопасности (см. `portal_access_denied` —
специально неотличим от `invalid_credentials`) — оставить как один код с одним текстом, не два разных.
Каждый call-site должен ссылаться на код в новом едином файле, а не хранить текст inline (кроме
действительно одноразовых нетиповых сообщений, если такие есть, — но большинство должно уйти в словарь).

**Г. (Разрешено, владелец считает лёгким) Статический CI-gate, не тест.**
Скрипт (например `apps/webapp/scripts/check-notification-text-coverage.mjs` или через
`code-search`/AST), который сканирует репозиторий и падает, если найден код ошибки/уведомления, не
описанный в едином файле текстов из пункта В. Встроить как gate в full CI, отдельно от unit-тестов
(это не vitest-файл). Если это оказывается дороже, чем «легко», — не делать, а прямо написать в отчёте
почему.

## Чек-лист приёмки

- [x] А: список функций показа уведомления/ошибки + счётчик вхождений каждой — в отчёте. Одна
      библиотека для toast (`react-hot-toast`, 107 файлов), без конкурирующих toast-обвязок; плюс
      `new UserFacingError(...)` (351 вызов / 19 файлов) и локальный `useState<string|null>` под
      полем формы (185 мест, механика рендера не тронута — вне цели этой работы). Команды:
      `grep -rl "from 'react-hot-toast'" src | wc -l`, `grep -rn "new UserFacingError(" src | wc -l`.
- [x] Б: полный список кодов ошибок/уведомлений repo-wide + для каждого — есть текст или нет.
      **Галочка возвращена шестым проходом:** пробел, из-за которого она была снята (4 серверных
      кода мимо всех `case`), закрыт в четвёртом проходе, а последняя оставшаяся форма невидимости
      (литерал, вынесенный в константу модуля) закрыта механически — гейт теперь её видит.
      **Не подтверждено — снята галочка 2026-09-13, см. правку ниже и G1 в разделе «Четвёртый
      проход»: разведка пропустила 4 реальных серверных кода, не доходящих ни до одного `case`.**
      AST-разведкой (TypeScript compiler API) по `src/**/*.{ts,tsx}` найдено 610 call-site'ов со
      статическим строковым литералом (351 `UserFacingError` + 343 `toast.error` + 116
      `toast.success`, минус 200 динамических passthrough) — 287 различных текстов. Плюс отдельно
      обработан `staffSecurityErrorText.ts` (~36 кодов) и две именованные константы модулей
      (`SERVICE_HAS_NO_DOER_MESSAGE`, `PATIENT_PROGRAM_NOT_FOUND_MESSAGE`), не попадавшие в
      автосбор, потому что литерал жил в объявлении константы, а не в самом call-site.
      ~~«Текста нет» кейсов с падением на generic fallback В ЭТОМ проходе не обнаружено~~ —
      **ЭТА СТРОКА БЫЛА НЕВЕРНОЙ, снята 2026-09-13 (независимый safety-аудит, verdict FAIL,
      см. секцию «Четвёртый проход» ниже).** По факту в `staffSecurityErrorText.ts` НЕ было
      обработано 4 реальных серверных кода (`expired_code`, `too_many_attempts`, `invalid_code`,
      `email_conflict`) — все четыре падали на generic `actionFallback` по имени действия, а не на
      текст, специфичный коду. Хуже того: `expired_code` гарантированно ведёт к ПОСТОЯННОЙ
      блокировке входа, потому что маршрут очищает login continuation ДО ответа, а generic-текст
      («введите код ещё раз») предлагает действие, которое физически не может сработать. Разведка
      пункта Б была неполной: она нашла коды, для которых текст в словаре ЕСТЬ, но не проверила,
      что каждый код, который сервер РЕАЛЬНО может прислать, доходит до соответствующего `case` в
      `staffSecurityErrorText`, а не проваливается мимо всех `case` на fallback. См. G1 в разделе
      «Четвёртый проход» — исправлено там.
- [x] В: единый файл `apps/webapp/src/shared/notifications/notificationText.ts` создан (288
      строковых записей + `notificationTextFactory` с 7 параметризованными фабриками). Все 610
      найденных статических call-site'ов переведены на ссылку на словарь (подтверждено повторным
      прогоном той же AST-разведки: `static records: 0` после переноса). `staffSecurityErrorText.ts`
      переписан на чтение текста из словаря (сигнатура и возвращаемые строки не изменились —
      `staffSecurityErrorText.unit.test.ts` не тронут и не менялся). Дедуп по смыслу: одинаковый
      текст с разных доменов схлопнут в один ключ (пример — `programmaNeNaydena`, 33 захваченных
      вызова из четырёх файлов treatment-program). Найдена и устранена тройная строковая дублировка
      конкретно того класса, который называл владелец: `email-password/login/route.ts`
      (`INVALID_CREDENTIALS_MESSAGE`), `staffSecurityErrorText.ts` (`case 'portal_access_denied'`) и
      инлайн в `AuthFlowV2.tsx` независимо друг от друга хранили одну и ту же строку «Email или
      пароль неверны…» — все три теперь читают `notificationText.authInvalidCredentialsOrPortalDenied`.
      Исключения (объяснены, не перенесены): 200 динамических передаточных мест
      (`toast.error(e instanceof Error ? e.message : 'fallback')` и подобные — это уже территория
      отдельного safe-error-слоя, не эта работа) и `duration.error`
      (`instanceEditorBatchApply.ts:334`, уже вычисленная строка из чужого валидатора).
- [x] Г: gate-скрипт `apps/webapp/scripts/check-notification-text-coverage.mjs` добавлен (AST-скан,
      не vitest-файл, с `--self-test`) и подключён в `apps/webapp/package.json` → `lint` (последним
      шагом цепочки). Прогон: `notification text coverage self-test: OK (4 leak fixtures red, 5 safe
      shapes green)` + `notification text coverage: OK`.
- [x] Ни один тестовый файл (`*.test.ts`/`*.unit.test.ts`/`*.spec.ts`) не создан и не изменён этой
      работой. Проверено: `git diff --name-only apps/webapp | grep -E '\.(test|spec)\.tsx?$'` — пусто;
      untracked-список тоже не содержит тестов.
- [x] `pnpm typecheck`/`pnpm lint` (в `apps/webapp`) зелёные после переноса. `pnpm lint` — exit 0,
      полная цепочка включая новый gate. `pnpm typecheck` — ровно ОДНА ошибка
      (`AuthFlowV2.tsx(48,3): ... 'AUTH_LOGIN_SHELL_CLASS'`), доказанная как ПРЕДСУЩЕСТВУЮЩАЯ и вне
      скоупа: `git stash` до начала этой работы даёт БАЙТ-В-БАЙТ идентичный список из 302 строк
      ошибок (та же строка, та же причина — не связана с notification-text, строка `48` в диффе
      этой работы не тронута). Остальные ~40 ошибок baseline (`Cannot find module '@bersoncare/...'`)
      устранены сборкой workspace-пакетов (`pnpm --dir packages/<pkg> run build` для db-principal,
      error-tracking, operator-db-schema, shared-contracts, platform-merge — не входили в собранный
      `node_modules` после `pnpm install --frozen-lockfile`, это среда, не код этой работы).
- [x] Независимый адверсарный аудит прошёл ПЕРЕД приёмкой (не «зелёный CI» = «готово»). Всего
      ПЯТЬ независимых аудитов разными агентами (Sonnet — качество русского, Opus — безопасность и
      правдивость), из них три вернули FAIL и породили проходы 3-5; финальный аудит Opus по готовому
      словарю — **PASS**, 0 блокеров. Его MAJOR и 4 рекомендации закрыты шестым проходом ниже.

## Верификационный проход (2026-09-13, независимый аудит нашёл 2 дефекта) — исправлено

Ветка `wt/notification-text-consolidation`, HEAD этого прохода — коммит с заголовком
«fix(notifications): semantic dictionary keys, ?? fallbacks, and a gate that actually gates»
(точный хеш — см. `git log`/финальный отчёт исполнителя; база после ребейза — `0c6469639`).
Независимый аудит первого прохода (коммит `47bff37fd`) нашёл два дефекта против собственного отчёта
исполнителя выше; оба исправлены и перепроверены в этом проходе.

- [x] **Дефект 1 — 128 из 336 ключей оказались транслитом, а не смысловыми именами.** По факту
      транслитом был ВЕСЬ не-auth блок словаря — 287 ключей (эвристика аудита, подстрочный grep по
      конкретным слогам, недосчитала: она поймала только 128 из 287; оставшиеся 159 транслитных
      ключей не содержали ни одной из проверяемых подстрок, но транслитом были так же). Переименованы
      ВСЕ 287 по правилу `<domain><Meaning>` (auth/booking/patient/doctor/clinic/media/payment/
      schedule/exercise/messaging/settings/admin/course/comment/test/treatmentProgram/common — домен
      по месту вызова, `common*` для кросс-доменных). Проверка: 0 использований старых имён
      (`grep -rn "notificationText\.<oldKey>\b" src` по каждому из 287 — пусто), 0 дублей объявлений
      в словаре, `pnpm typecheck` подтверждает (ключи существуют, использованы).
- [x] **Дефект 1b — 5 ключей с числовым суффиксом (`gotovo2`, `setNedostupna2`,
      `neUdalosSohranit2`, `parolNeMenee8`, `vesChisloOt0`).** Три пунктуационные пары НЕ слиты
      (видимый текст различается — `neUdalosSohranit`/`neUdalosSohranit2` это `'Не удалось
      сохранить'` без точки vs `'Не удалось сохранить.'` с точкой; аналогично `setNedostupna` /
      `setNedostupna2`), но получили честные имена по месту вызова: `commonSaveFailed` /
      `settingsPatientHomeSaveFailed`, `commonNetworkUnavailable` /
      `patientRemindersMuteToggleNetworkUnavailable`. `parolNeMenee8` → `authSignupPasswordTooShort`
      (регистрация, отличен от `authWeakNewPassword` — смена пароля, другой текст).
      `vesChisloOt0` → `treatmentProgramLoadWeightOutOfRange` (цифры в тексте — часть смысла «от 0 до
      500», не суффикс дедупа).
- [x] **Дефект 2 — 49 литералов внутри `?? '...'`-фолбэков не были перенесены** (мигрирована только
      прямая форма первого аргумента). Мигрированы все 49 сайтов с сохранением формы
      `serverText ?? notificationText.key` (серверный текст по-прежнему выигрывает). Повторный
      прогон трёх grep из независимого аудита (`apps/webapp/src`, исключая тесты) — все три теперь 0:
      `grep -rn "toast\.error(.*?? *'" .` → 0, `grep -rn "toast\.success(.*?? *'" .` → 0,
      `grep -rn "new UserFacingError('" . | grep -v notificationText.ts` → 0.
- [x] **Дефект 2b — gate не гейтил: строился ТОЛЬКО по первому аргументу вызова.** Строгий AST-обход
      (`??`, тернарник, скобочная вложенность — рекурсивный сбор строковых литералов-листьев по
      обеим ветвям) в `apps/webapp/scripts/check-notification-text-coverage.mjs`. Доказано ДО
      исправления: усиленный gate находит 100 нарушений на дереве коммита `47bff37fd` (49 из Дефекта
      2 + 51 дополнительный — литерал внутри тернарника, которого прежний gate по конструкции не мог
      увидеть, например `toast.success(added ? 'Запись добавлена' : 'Запись обновлена')`); команда:
      `node scripts/check-notification-text-coverage.mjs --self-test` на исходном дереве (до фикса)
      → exit 1, "100 call site(s)"; после миграции всех 100 сайтов → exit 0, "OK". Self-test
      расширен fixtures на `??`, тернарник (обе ветки статичные И одна ветка динамическая/литерал),
      вложенность через скобки — 10 leak + 7 safe вместо 4+5.
- [x] Словарь: 336 → 397 экспортированных записей (390 `notificationText` + 7
      `notificationTextFactory`, факторка не тронута). 287 переименовано на месте, 61 добавлено (22
      для Дефекта 2, 39 для Дефекта 2b), 0 удалено, 0 изменённого видимого текста ни у одного
      существовавшего ключа.
- [x] Ни один тестовый файл не создан/не изменён в этом проходе:
      `git diff --name-only 0c6469639..HEAD -- apps/webapp | grep -E '\.(test|spec)\.tsx?$'` — пусто.
      Слой `safeUserError.ts`/`userFacingError.ts`/`check-safe-user-error-door.mjs`/
      `check-safe-error-transport.mjs` не тронут (не входит в diff).
- [x] Ребейз на `0c6469639` (`feat/doctor-ui-rebuild`: иконки + PWA-манифест админа +
      `loginChrome.ts`) выполнен без конфликтов. `pnpm lint` — exit 0 (включая усиленный gate).
      `pnpm typecheck` — exit 0, ЧИСТО (0 ошибок; предыдущий проход докладывал 1 преду-существующую
      ошибку `AUTH_LOGIN_SHELL_CLASS`, устранённую уже базовым коммитом `7c7b7a4f2`, входящим в
      `0c6469639`).
- [x] **Найдено, но НЕ исправлено (вне заявленного скоупа обоих дефектов) — задокументировано как
      находка в отчёте исполнителя, а не тихо пропущено:** несколько сайтов вида `const msg =
      x.message ?? 'литерал'; ...; toast.error(msg)` или `return { message: x.message ?? 'литерал'
      }` (например `AuthFlowV2.tsx` около строки 1315 и 2142) — литерал долетает до пользователя
      только через ВТОРОЕ утверждение или поле возвращаемого объекта, а не через форму аргумента
      вызова. Оба дефекта (2 и 2b) описаны как обход ВЫРАЖЕНИЯ аргумента одного вызова (`??`,
      тернарник, вложенность), а не межстрочный data-flow — ловить второе потребовало бы другого
      класса анализа и является отдельной, не заявленной в этой работе задачей.
- [x] Независимый адверсарный аудит верификационного прохода выше нашёл ещё две дыры (Дефект 3,
      Дефект 4) — исправлены в этом, третьем проходе (см. секцию ниже). Аудит следующего прохода —
      снова отдельным агентом перед приёмкой владельцем.

## Третий проход (2026-09-13, следующий круг независимого аудита нашёл 2 дефекта) — исправлено

Ветка `wt/notification-text-consolidation`, база `0c6469639`, предыдущий HEAD `1cac021cc`.

- [x] **Дефект 3 — 51 литерал прятался в аргументе-фолбэке хелпера `readSafeApiErrorText(body,
      fallback)`, а не в самом аргументе `toast.error`/`UserFacingError`.** Репро ДО фикса:
      `grep -rn --include='*.ts' --include='*.tsx' "readSafeApiErrorText(.*, *'" apps/webapp/src |
      grep -v '\.test\.' | wc -l` → 51 (21 файл). Проверены и мигрированы ВСЕ 51: часть схлопнулась
      на уже существующие ключи (`commonSaveFailed`, `commonGenericError`, `doctorFinanceSaveError`,
      `patientReminderUpdateFailed`, `doctorOrderUpdateFailed`, `treatmentProgramStageOrderUpdateFailed`,
      `treatmentProgramGroupAddFailed`, `treatmentProgramStageAddFailed`,
      `treatmentProgramElementAddFailed`), 24 новых семантических ключа заведены. Найдены и включены
      в тот же перенос ещё ДВА хелпера того же класса (аргумент-фолбэк с реальным человеческим
      текстом, а не машинным кодом): `safeActionErrorText(scope, error, fallbackText)` (8 сайтов,
      `app-layer/errors/safeUserError.ts` НЕ тронут — только call site'ы) и
      `mechanicWriteClearanceRefusalResponse(error, message)` (2 сайта,
      `app-layer/guards/requireEntitlement.ts` НЕ тронут) — итого 61 сайт, 33 новых ключа. `staffSecurityErrorText(error, 'email_password_login')`
      и аналоги (`errorLabel('chat_send_failed', …)`) намеренно НЕ тронуты — второй аргумент код
      действия для внутреннего `switch`, не текст. Повторный прогон репро-грепа ПОСЛЕ миграции — 0
      (обе команды из брифа: построчная и `-l`).
- [x] **Дефект 3b — гейт расширен на форму «литерал в аргументе-фолбэке хелпера».** В
      `apps/webapp/scripts/check-notification-text-coverage.mjs` добавлена карта
      `FALLBACK_TEXT_HELPER_ARG_INDEX` (`readSafeApiErrorText`→1, `safeActionErrorText`→2,
      `mechanicWriteClearanceRefusalResponse`→1); `textArgumentOf` возвращает их аргумент-фолбэк
      как «текст, который увидит пользователь» — обход AST уже проверяет КАЖДЫЙ узел дерева
      (`visit()`), поэтому вызов хелпера ловится независимо от глубины и формы обёртки
      (`toast.error(readSafeApiErrorText(...))`, `setError(readSafeApiErrorText(...))`,
      `throw new Error(readSafeApiErrorText(...))`, `return { error: readSafeApiErrorText(...) }`
      — все формы из реального кода отработаны). Доказано ДО миграции: гейт на дереве коммита
      `1cac021cc` (до этого прохода) находит **61** нарушение (`node
      scripts/check-notification-text-coverage.mjs` → exit 1, "61 call site(s)") — проверено
      восстановлением этого дерева через `git stash` с временной заменой только файла гейта;
      ПОСЛЕ миграции — `exit 0, "OK"`. Self-test расширен: 6 новых leak fixtures (прямой вызов,
      вложенный в `toast.error`, в `throw new Error`, в возвращаемом объекте, `safeActionErrorText`,
      `mechanicWriteClearanceRefusalResponse`) + 3 новых safe fixtures (ссылка на словарь как
      фолбэк-аргумент x2, код действия у постороннего хелпера остаётся без изменений) — было
      10 leak/7 safe, стало 16 leak/10 safe.
- [x] **Дефект 4 — сырой `Error.message` в toast на `OperatorHealthProbeSettingsSection.tsx:229`**
      (`Не удалось сбросить настройки: ${e instanceof Error ? e.message : 'повторите'}`) —
      заменён на `toast.error(safeUserMessage(e, notificationText.adminOperatorHealthProbeResetFailed))`.
      Использован СУЩЕСТВУЮЩИЙ `safeUserMessage`/`UserFacingError` из
      `shared/errors/userFacingError.ts` — сам файл, `safeUserError.ts` и их два гейта НЕ
      тронуты, только вызов с этого сайта. Проверены ДВА других сайта в ТОМ ЖЕ файле с тем же
      паттерном (строки 207-208 «Настройки проб не сохранены: …» и 273-274 «IMAP-настройки не
      сохранены: …») — исправлены тем же способом с двумя новыми ключами
      (`adminProbeSettingsSaveFailed`, `adminImapSettingsSaveFailed`). Repo-wide проверка (AST-скан
      всех `toast.error`/`toast.success`, у которых в поддереве аргумента встречается
      `<переменная из catch>.message`) нашла ЕЩЁ 12 сайтов того же класса в 7 файлах:
      `OrganizationCommercialPanel.tsx:106`, `CommercialConstructorClient.tsx:1210,1242`,
      `SaasBillingProviderSettings.tsx:176` (плюс новый ключ `adminBillingProviderSettingsSaveFailed`),
      `NotificationTemplatesPageClient.tsx:189,218,258`, `BookingManualLifecycleSection.tsx:170,224`,
      `ClinicDeliveryChannelsSection.tsx` (SMTP save), `OrgBrandingSection.tsx` (bot save) — все
      переведены на `safeUserMessage(...)` с существующим или новым словарным фолбэком. Итого
      15 сайтов найдено, 14 исправлено; ОДИН (`AppointmentPaymentSection.tsx:165`,
      `errorLabel(cause.message, …)`) проверен и оставлен: `cause.message` там используется ТОЛЬКО
      как ключ сравнения (`if (error === 'payments_disabled') return …`) внутри `errorLabel`,
      сырой текст никогда не попадает в возвращаемую строку — не является утечкой по факту, только
      структурная похожесть на паттерн. `setError`/`setMsg`-семейство (инлайн-ошибка под полем,
      ~130+ мест по repo-wide скану) сознательно НЕ тронуто — это явно вынесенный из скоупа класс
      ещё в пункте А первого прохода (185 мест «механика рендера не тронута»); Дефект 4 просил
      конкретно toast/«user-visible string» на названном сайте плюс сайты «того же класса», а не
      ревизию всего inline-error слоя — при обнаружении расширения скоупа за пределы toast это
      отдельная, не запрошенная в этом брифе работа.
- [x] Ни один тестовый файл не создан/не изменён в этом проходе (проверено `git status` перед
      коммитом — только `.ts`/`.tsx`/`.mjs`/`.md`, ни одного `.test.`/`.spec.`).
      `safeUserError.ts`/`userFacingError.ts`/`check-safe-user-error-door.mjs`/
      `check-safe-error-transport.mjs` не входят в diff.
- [x] `pnpm typecheck` (apps/webapp) — exit 0, чисто. `pnpm lint` (apps/webapp, включает усиленный
      гейт последним шагом) — exit 0.
- [x] Независимый адверсарный аудит третьего прохода ВЫПОЛНЕН — два параллельных независимых
      аудита (Opus, safety/truthfulness, **verdict FAIL**; Sonnet, copy-quality) нашли 5 gating-дыр
      (G1-G5) и 5 категорий текстовых дефектов (C1-C5) — исправлены в четвёртом проходе ниже.
      «Аудит выполнен» ≠ «третий проход был готов» — он был не готов, находки ниже это доказывают.

## Четвёртый проход (2026-09-13, два независимых аудита — Opus safety verdict FAIL + Sonnet copy-quality) — исправлено

Ветка `wt/notification-text-consolidation`, база `0c6469639`, предыдущий HEAD `6f0f7865d`. Работа велась
в отдельном ворктри `bcb-wt-notif-text`.

**Правило сверки при переписывании ЛЮБОГО ключа**: перед правкой текста — `grep -rn
"notificationText\.<key>" apps/webapp/src`, чтобы узнать все call-site'ы. Если ключ используется в
нескольких доменах — новый текст остаётся домен-нейтральным; если домены реально расходятся по смыслу —
ключ РАЗДЕЛЁН на два. За этот проход разделён ОДИН ключ:
**`patientReminderUpdateFailed`** был общим для `ReminderRulesClient.tsx` (напоминания) и
`DefaultPromoProgramClient.tsx` (обновление промо-программ — не связанный домен) — оставлен
`patientReminderUpdateFailed` на первом сайте, заведён `treatmentProgramPromoRefreshFailed` на втором.
Обратный случай — **слияние**, а не разделение: `doctorFinanceSaveError` (было `'Ошибка сохранения'`)
оказался, как и предупреждал бриф, использован в 7 несвязанных доменах (тест-наборы, клинические тесты,
прогресс пациента, treatment-program, рекомендации, комментарии, финансы) — вместо добавления неверного
доменного существительного слит в уже существующий `commonSaveFailed` (домен-нейтральный по конструкции),
ключ `doctorFinanceSaveError` удалён.

### G1 — 4 серверных кода без своего `case` в `staffSecurityErrorText.ts`, один гарантировал вечную блокировку

`apps/webapp/src/shared/ui/auth/staffSecurityErrorText.ts`: добавлены `case 'expired_code'` (→
`authLoginChallengeExpired` — тот же текст, что и у `login_challenge_expired`: правильное следующее
действие — войти заново и запросить новый код, а НЕ generic «введите код ещё раз», потому что маршрут
уже очистил login continuation до ответа и повтор кода гарантированно провалится), `case
'too_many_attempts'` (→ `authTooManyAttemptsRetryLater`, код приходит с HTTP 429), `case 'invalid_code'`
(→ `authInvalidFactor`), `case 'email_conflict'` (→ новый ключ `authLoginFactorEmailConflict`). Пункт
чек-листа Б выше СНЯТ ретроспективно — разведка того прохода не проверяла, что каждый реально
отправляемый сервером код доходит до `case`, а не проваливается на generic `actionFallback`.

### G2 — утечка живых имён колонок БД пациентам/докторам

`commentUnknownType`/`commentUnknownTargetType` (было «Неизвестный target_type комментария» и
аналогично `comment_type`) схлопнуты в один нейтральный `commentInvalidType` в
`apps/webapp/src/modules/comments/service.ts` (`assertTargetType`/`assertCommentType`). Проверено: ни
один из старых ключей не встречается в `src` (`grep -rn "commentUnknownType\|commentUnknownTargetType"
src` → пусто).

### G3 — 5+ сайтов показывали сырой машинный код (`data.error`) вместо текста

Добавлен `readSafeActionErrorText(result, fallback)` в `apps/webapp/src/shared/http/apiErrorCode.ts` —
структурный близнец `readSafeApiErrorText`, но для клиентской-локальной конвенции результата действия
(`{ ok: false; error?: string }` у `'use server'`-экшенов, где `error` уже является доверенным текстом,
а не машинным кодом — в отличие от контракта API-маршрутов, где `error` в ответе ВСЕГДА машинный код
по`shared/http/apiErrorCode.ts`). Переведены на него 7 сайтов (`ContentLifecycleDropdown.tsx`,
`ContentNav.tsx`, `ContentPagesSectionList.tsx` ×2, `ContentSectionsListClient.tsx` ×3,
`InstanceEditorSaveBar.tsx`, `InstanceEditorToolbar.tsx`, `InstanceEditorUnsavedChangesDialog.tsx`) —
на трёх из них (`InstanceEditorSaveBar/Toolbar/UnsavedChangesDialog`) прослежен полный data flow
(`saveDraft()` → `InstanceEditorDraftContext.tsx` → `flushInstanceEditorDraft.ts` →
`formatInstanceEditorSaveError`) и подтверждено, что `r.error` там уже безопасный человеческий текст —
переведены всё равно, ради единообразия и defense-in-depth. Плюс `OperatorHealthAlertsSection.tsx` (2
сайта — `.error ??` убран полностью, текст напрямую из словаря). Гейт расширен: `toastArgumentOf()` +
`collectRawErrorCodeLeaves()` в `check-notification-text-coverage.mjs` находят голое `.error` (в т.ч.
через `??`/тернарник/скобки) в аргументе `toast.error`/`toast.success`, НЕ обёрнутое ни в
`readSafeApiErrorText`, ни в `readSafeActionErrorText`.

### G4 — inline `message:` в `NextResponse.json`, расходящиеся с/дублирующие словарь для ОДНОГО кода

Названные 6 сайтов (`email-password/login/route.ts`: `proxy_configuration`, `rate_limited`,
`invalid_body`, `email_not_verified`, `security_setup_pending`, плюс `email_factor_unavailable`;
`email-otp/register/route.ts`: `duplicate_email`) переведены на ссылки на словарь — подтверждено
`git diff` (см. точные до/после пары выше в этом файле истории работы). Расхождения решены В ОДНУ
СТОРОНУ: `rate_limited` унифицирован с `authRateLimited` (тот же лимитер, 600 сек, что и
`factor/route.ts`). При построении AST-развёртки для гейта тем же проходом найдены и мигрированы ЕЩЁ 4
литерала в том же файле `email-otp/register/route.ts` (`proxy_configuration` — заодно устранена утечка
инфраструктурной детали «reverse proxy с заголовком X-Real-IP»; `invalid_fio` ×2; `invalid_email`;
`email_send_failed`). Гейт расширен: `responseJsonMessageLiteralOf()` находит `message: '...'`/
`` message: `текст` `` (без интерполяции) внутри объектного литерала — аргумента
`NextResponse.json`/`Response.json`. Честно задокументированный компромисс: repo-wide AST-развёртка
нашла ~90 таких литералов в ~34 файлах (в основном ранее существовавшие auth/otp маршруты, не тронутые
этим проектом) — полная миграция всей этой поверхности является отдельной, не заявленной в этом брифе
работой. Список `RESPONSE_MESSAGE_LITERAL_GRANDFATHER_FILES` (33 файла — ФАЙЛОВЫЙ grandfather, а не
построчный, чтобы не дрейфовать при несвязанных правках) освобождает эти файлы от гейта; литерал в
ЛЮБОМ файле НЕ из списка — падение гейта, то есть класс дефекта не может тихо появиться заново нигде,
кроме уже известных 33 файлов. Доказательство ДО фикса (см. также запись про воспроизведение ниже):
восстановленное pre-fix дерево + новый гейт → **28 находок** (смесь G3 raw-`.error` и G4
message-литералов на `email-otp/register/route.ts`, `email-password/login/route.ts` и реальных G3
сайтах), exit 1; ПОСЛЕ миграции — `node scripts/check-notification-text-coverage.mjs` → `OK`, exit 0.

### G5 — `commonUnknownError = 'error'` (голое английское слово) — весь опыт ошибки ручной отмены/переноса записи

`apps/webapp/src/app/app/settings/BookingManualLifecycleSection.tsx`: `ApiRequestError` (из `apiJson.ts`)
не распознаётся `safeUserMessage` (та видит только `UserFacingError`), поэтому фолбэк срабатывал
ВСЕГДА и `digest`, который `apiJson` сохраняет на брошенной ошибке, тихо терялся. Добавлена локальная
функция `bookingManualLifecycleErrorText(error)`: для `ApiRequestError` показывает `error.message`,
только если он отличается от `error.code` (то есть сервер реально прислал текст), иначе — новый
словарный ключ `bookingManualLifecycleActionFailed` (переименованный `commonUnknownError` — ключ больше
не generic catch-all, у него теперь ровно два сайта), и в ЛЮБОМ случае добавляет санкционированный
суффикс `Код для поддержки: <digest>` (та же форма, что у `safeActionErrorText`/`ActionFailureText.tsx`).

### C1 — ~14 ключей с внутренними идентификаторами/инженерным жаргоном

Реворднуты (с проверкой по правилу сверки — все однодоменные, разделения не потребовалось, кроме
описанного выше `patientReminderUpdateFailed`): `testSpecifyOutcome` (был английский enum
`passed/failed/partial` и `score` verbatim), `treatmentProgramUseComplexExpandFromLfk` (собран с
`treatmentProgramUseComplexExpand` — C4), `doctorNotificationTemplateSaveClearanceDenied` (переписан
на предложенный владельцем текст), `adminNotificationTemplatePlatformSaveClearanceDenied` (платформенный
вариант — это ВСЕГДА мисроутинг/баг, поэтому маршрут `admin/notification-templates/route.ts` теперь
зовёт `logServerRuntimeError` и добавляет санкционированный `Код для поддержки: <digest>`),
`authProviderUnavailable` («Провайдер недоступен» → текст без внутреннего термина + действие),
`settingsCredentialSaveFailed` («credential» на латинице), `notificationTextFactory.invalidUuid` и
`.invalidStatusTransition` (утекали сырые внутренние имена полей `organizationId`/`specialistId`/… и
FSM-коды статусов `cancelled_by_specialist`/`no_show`/… — тот же класс утечки, что у G2; текст обобщён,
параметры оставлены в сигнатуре, но не интерполируются), `testInvalidScoringStructure` («scoring» на
латинице), `courseIntroLessonMustBeLoggedInOnly` (проверено: «Только для залогиненных» — РЕАЛЬНАЯ метка
переключателя в `ContentPagesSectionList.tsx`/`ContentSectionsListClient.tsx`, не жаргон — переписан
только пассивный залог на активный), `adminCheckAccessLadder` и связанный баг: `accessPolicyFromDraft`
(`CommercialConstructorClient.tsx`) бросал голый `Error` с уже полезным текстом («Заполните все поля
лестницы доступа») — `safeUserMessage` его не видел и всегда показывал generic-фолбэк; переведён на
`UserFacingError` + два новых словарных ключа (`adminAccessLadderFieldsRequired`,
`adminAccessLadderNotificationOffsetRequired`), сам `adminCheckAccessLadder` остался только на
действительно неожиданный случай.

### C2 — грамматика

`authPasswordNotAvailableForRole` («не доступен» → «недоступен», добавлена точка),
`patientDiaryDuplicateEntry` (убрано неграмотное «в моменте» + «только что» вместе),
`commonSaveFailedRetryLaterAlt` удалён (см. C4).

### C3 — дедлок-сообщения без следующего действия

**Честно про число 116**: точный поимённый список 116 ключей из исходного брифа не сохранился
(автоматическое сжатие контекста между ходами этой сессии) — восстановлен ЗАНОВО через
систематический regex-скан словаря на «глухие тупики» (`'Не удалось X'` без действия, `'X не
найден(а)'`, `'Ошибка X'`) с последующей ручной сверкой по правилу выше, а не взят из брифа один в
один. Обработано **108 ключей** этим механическим способом (`git diff` даёт 147 переписанных строк
всего по всему проходу — включая G1-G5, C1, C2, C4, C5; 108 из них — именно эта категория): конвертация
`'Ошибка X'` → `'Не удалось X'` (9 сайтов:
`doctorSubscriptionRecalcNetworkError`, `commonSaveError`(→ слит в `commonSaveFailed`, см. C4),
`treatmentProgramAssignError`, `doctorMeasureKindCreateError`, `doctorMeasureKindsConnectionError`,
`testSetCompositionParseError`, `testSetCompositionSaveError`, `commentUpdateError`,
`commentDeleteError`), добавление «Повторите попытку»/конкретного действия к 75 голым `'Не удалось X'`
без него, плюс 24 ключа `'X не найден(а)'`/`'не принадлежит...'` (внутренние инварианты treatment-program
и соседних модулей — обычно стухший ID в SPA) получили «Обновите страницу и повторите попытку».
`commonNetworkUnavailable`/`patientRemindersMuteToggleNetworkUnavailable`/`commonNetworkError` теперь
все говорят «Проверьте подключение и повторите попытку.» (как и просил бриф). Все правки проверены по
правилу сверки — множественные call-site'ы среди этих ключей (`commonCreateFailed` ×2,
`treatmentProgramElementAddFailed`/`StageAddFailed`/`GroupAddFailed` ×3 и т.п.) остаются в границах
ОДНОГО домена, добавленный текст полностью generic (никакого нового домен-специфичного существительного)
— разделений не потребовалось. Одно исправление «эффекта эха»: `testAttemptStartFailed` не получил
механическое «Повторите попытку» (вышло бы «начать попытку. Повторите попытку.») — переписан как «Не
удалось начать прохождение теста. Повторите попытку.».

### C4 — дубли-кластеры схлопнуты

`commonDone`/`patientRemindersMuteToggleDone` → `commonDone`; `commonSaveFailedRetryLater`/`…Alt` →
`commonSaveFailedRetryLater`; `treatmentProgramUseTestResultRecording`/`…Submission` →
`…Recording`; `treatmentProgramUseComplexExpand`/`…FromLfk` → `…Expand`;
`treatmentProgramStageUnknownDraftId` → вызов `notificationTextFactory.unknownDraftId('Этап')`
(байт-в-байт тот же текст, отдельный статический ключ был лишним); задокументированные в заголовке
файла «намеренно не собранные» пары — `commonSaveFailed`/`settingsPatientHomeSaveFailed` и
`commonNetworkUnavailable`/`patientRemindersMuteToggleNetworkUnavailable` — теперь собраны в один ключ
каждая (раз оба текста всё равно переписывались по C3, держать два ключа с одинаковым новым текстом
смысла не было); заголовок словаря обновлён (см. `notificationText.ts:29-41`). ДВА дополнительных
дубля-находки, обнаруженных в процессе самой этой правки (не были в брифе явно, но того же класса):
`commonSaveError` после конвертации «Ошибка при сохранении» → «Не удалось сохранить. Повторите
попытку.» стал байт-в-байт идентичен `commonSaveFailed` — слит (8 call-site'ов redirected);
`commonNetworkUnavailableRetry` («Сеть недоступна. Попробуйте ещё раз.») стал по смыслу дублем
`commonNetworkUnavailable` при нормализации C5 — слит (2 сайта).

### C5 — «Попробуйте» → «Повторите попытку», хвостовая точка

Все 5 оставшихся `'Попробуйте'` в значениях словаря переведены на «Повторите попытку» (кроме
`authTooManyAttemptsRetryLater`, где формулировка изменена на «Подождите и повторите позже», чтобы не
повторять корень «попыт-» дважды в одной фразе). `commonDone` оставлен БЕЗ точки (большинство,
согласно брифу).

### Проверка нового гейта (G3+G4) — воспроизводимо

`node scripts/check-notification-text-coverage.mjs --self-test --self-test-only` →
`notification text coverage self-test: OK (22 leak fixtures red, 16 safe shapes green, grandfather-list
exemption verified both ways)`. Полный прогон на текущем дереве — `notification text coverage: OK`.
До миграции (дерево `git stash` + временная подмена только файла гейта на новую версию) — 28 находок,
exit 1 (см. выше в разделе G4).

- [x] Ни один тестовый файл (`*.test.ts`/`*.unit.test.ts`/`*.spec.ts`) не создан и не изменён в этом
      проходе: `git diff --stat 6f0f7865d -- apps/webapp | grep -E '\.(test|spec)\.tsx?$'` — пусто.
      `shared/errors/userFacingError.ts`, `app-layer/errors/safeUserError.ts`,
      `scripts/check-safe-user-error-door.mjs`, `scripts/check-safe-error-transport.mjs` НЕ входят в
      diff — их API только вызваны (`logServerRuntimeError`, `UserFacingError`), не изменены.
- [x] `pnpm typecheck` (apps/webapp) — exit 0, чисто. `pnpm lint` (apps/webapp, полная цепочка,
      включая `check-notification-text-coverage.mjs` двумя последними шагами — self-test и полный
      прогон) — exit 0.
- [ ] Независимый адверсарный аудит ЭТОГО (четвёртого) прохода — НЕ выполнен этим же агентом (правило:
      аудитор ≠ автор). Требуется отдельный проход перед финальной приёмкой владельцем.
- НЕ ИСПРАВЛЕНО В ЭТОМ ПРОХОДЕ (сознательно, вне скоупа брифа — см. «явно вне скоупа» в исходном
      брифе): `/api/auth/email-password/lookup` (account enumeration), `forgot`-маршрут (не-нейтральная
      форма ответа), `authEmailAlreadyRegistered` текст + HTTP 409 при регистрации. Найдено, но НЕ
      исправлено (в рамках объявленного скоупа G4): ~90 `message:`-литералов в ~34 файлах вне 6
      названных сайтов (полный список — `RESPONSE_MESSAGE_LITERAL_GRANDFATHER_FILES` в
      `check-notification-text-coverage.mjs`); `panelErrorLabel` в `DoctorCalendarEventPanel.tsx`
      (`return error;` в дефолтной ветке — найден при разведке G3, признан вне её скоупа: это
      inline-errorLabel-хелпер, не toast); `AppointmentPaymentSection.tsx`'s
      `errorLabel(cause.message, …)` (тот же паттерн, что и в третьем проходе — `cause.message`
      используется только как ключ сравнения, не утечка по факту); `setError`/inline-form-error слой
      (~130+ мест) — вне скоупа с первого прохода (пункт А).

## Пятый проход — закрытие блокеров повторного аудита (13.09, оркестратор)

Два независимых аудита по готовому словарю: Sonnet (качество русского) и Opus (безопасность и
правдивость). Первый вердикт Opus — FAIL, 5 гейтящих находок; после четвёртого прохода повторный
аудит Opus — снова FAIL, 3 блокера. Закрыты здесь:

- [x] `commonGenericError: 'Ошибка'` и `messagingNotSent: 'Не отправлено'` — тот же класс, что и
      `commonUnknownError: 'error'`, который чинили проходом раньше; `commonGenericError` показывался
      пациенту при включении push. Найдено независимо и аудитором, и собственной проверкой словаря.
- [x] `readSafeActionErrorText(result: unknown, …)` → требует `ok: boolean`. Раньше в хелпер можно
      было передать разобранное тело API-ответа, и пациент увидел бы машинный код ПРИ ЗЕЛЁНОМ гейте —
      гейт доверяет этому хелперу по имени. В доке честно записано, что это структурная типизация,
      а не гарантия.
- [x] Заголовок гейта обещал, что класс расходящихся копий «не может вернуться незаметно нигде».
      Неправда: правило смотрело только `NextResponse.json`/`Response.json`, а роуты, отвечающие
      через `jsonError(code, body, init)`, были невидимы. Правило расширено
      (`RESPONSE_BUILDER_BODY_ARG_INDEX`), заголовок переписан с двумя честными ограничениями.

**Что жило в этой слепой зоне** (закрыто здесь же): `'Запрос должен проходить через reverse proxy с
заголовком X-Real-IP.'` — на ПУБЛИЧНОЙ странице записи (`booking/public/create`, `…/confirm`), на
экране входа через OAuth и в `email-otp/start`. Плюс 12 других литералов. Доказательство работы
правила: на дереве до правок гейт даёт 16 находок, после — `OK`. `email-otp/start/route.ts` вычищен
полностью и снят с grandfather-списка (33 → 32 файла).

`pnpm lint` — exit 0 (включая self-test гейта), `pnpm typecheck` — exit 0. Тестовых файлов не
создано и не изменено ни в одном из пяти проходов.

### Остаточный долг — НЕ чинилось, вынесено владельцу как вопрос

1. `/api/auth/email-password/lookup` — неаутентифицированный, без рейт-лимита, отдаёт состояние
   любого аккаунта по email (`free` / `verified_with_password` / `needs_email_setup` — последнее
   помечает пациентов, заведённых клиникой). В коде приложения не вызывается ниоткуда. Рекомендация
   аудитора и моя: удалить, а более широкий вопрос auth-enumeration завести отдельной работой.
2. `panelErrorLabel` (`DoctorCalendarEventPanel.tsx:217-229`) — ветка `return error;` печатает врачу
   сырой машинный код в 5 местах. Гейт этого не видит (код завёрнут в хелпер, которого нет в
   `FALLBACK_TEXT_HELPER_ARG_INDEX`).
3. `rate_limited` по-прежнему читается тремя разными формулировками (три роута в grandfather-списке).
4. Grandfather-список освобождает файл ЦЕЛИКОМ, в том числе для новых литералов; сокращать его
   некому по механике — только ревью.
5. `email_conflict` на пути `login/factor` недостижим: case и ключ `authLoginFactorEmailConflict` —
   мёртвый код (находка повторного аудита, оставлено намеренно как безвредная страховка).

## Шестой проход — находки финального аудита (13.09, оркестратор)

Финальный независимый аудит (Opus) по готовому словарю вернул **PASS**, 0 блокеров, один MAJOR и
четыре рекомендации. Закрыто здесь всё, кроме вынесенного владельцу (см. остаточный долг выше).

- [x] **MAJOR — заголовок гейта утверждал безопасное свойство, которого у него не было.** Правило
      видело только литерал, написанный прямо в call-site; литерал, поднятый в константу модуля,
      получал молчаливое освобождение. Это не гипотеза: живыми были `AUTH_NETWORK_ERROR_MESSAGE`
      (`AuthFlowV2.tsx`, 20+ мест показа пациенту), `SMS_DISABLED_WEB_MESSAGE` там же,
      `ORGANIZATION_SLUG_REQUIRED_MESSAGE` (`specialist-signup/confirm/route.ts`) и
      `INVALID_BODY_MESSAGE` (`admin/booking-engine/form-fields/route.ts`) — четыре текста мимо
      словаря при зелёном гейте. Гейт теперь резолвит ОДИН уровень локальных (в том же файле)
      констант в обоих правилах; все четыре текста переведены на ключи словаря
      (`commonNoServerConnection`, `authSmsDisabledOnWeb`, `authOrganizationSlugRequired`,
      `authFormFieldInvalidBody`), сами константы оставлены как локальные алиасы.
      Доказательство работы правила: на дереве ДО правки гейт даёт 4 находки, после — `OK`.
      В заголовок добавлено третье честное ограничение: импортированная из другого модуля
      константа и текст, собранный в рантайме, гейту по-прежнему не видны.
- [x] **Ложное утверждение в комментарии словаря** (`notificationText.ts`): «every key below got
      ". Повторите попытку." appended» — три ключа его не выполняли
      (`adminProbeSettingsSaveFailed`, `adminImapSettingsSaveFailed`,
      `adminBillingProviderSettingsSaveFailed`). Ключи исправлены, комментарий переписан.
- [x] **Ложное утверждение в комментарии гейта**: `message`, значение которого не литерал,
      описывался как «dynamic/already-safe». Половина неправды: константа — не динамика. Переписано.
- [x] **Рекомендация 4 — `authProviderUnavailable` обещал «повторите позже»** на постоянной ошибке
      конфигурации провайдера. Переписан на действие, которое реально работает: «Этот способ входа
      сейчас недоступен. Войдите другим способом.»
- [x] **Дожат класс «текст без следующего действия»** (критерий владельца: пользователь должен
      понимать, что делать): `authAttemptsTooFrequent`, `authCodeInvalidOrExpired`,
      `doctorCommentNotSaved`, `doctorEntryCreatedCommentNotSaved`, `adminOperationFailed`,
      `testLabelTooLong` и три admin-ключа выше. Повторный скан словаря на эту форму — пусто.
- [x] **Фикстуры self-test'а** на правила, у которых их не было: `jsonError` (тело во ВТОРОМ
      аргументе — то самое место, где жили утечки `X-Real-IP`) и резолвинг константы в обе стороны
      (красная на утечке, зелёная на константе с машинным кодом и на константе внутри функции).
      Было 22 leak / 16 safe, стало 26 leak / 19 safe.
- [x] **Дедуп по смыслу дожат до нуля точных дублей.** Сканом словаря найдены три пары ключей с
      посимвольно одинаковым текстом: `commonNetworkError`≡`commonNetworkUnavailable`,
      `commentDeleteError`≡`commonDeleteFailed`, `adminSettingSaveFailed`≡`settingsSaveFailedRetry`.
      Схлопнуты (последняя пара — в нейтральный `commonSettingSaveFailed`, потому что ключ
      использовали и админка, и настройки организации). Повторный скан: 0 текстов с >1 ключом.

`pnpm lint` — exit 0 (вся цепочка гейтов, включая self-test), `pnpm typecheck` — exit 0.
Тестовых файлов не создано и не изменено ни в одном из шести проходов.

## Седьмой проход — правки по разбору владельца (13.09)

Владелец разобрал отчёт и дал четыре прямых указания. Ниже — что сделано по каждому.

### 1. Слов «клиника» и «доктор» в текстах для человека быть не должно

Дословно: «"клиника" — это слово не должно быть нигде. Ни "доктор", ни "клиника" — максимум либо
"организация", но это не про то что "оплаты в организации отключены", это например про то что
"не заданы контакты организации" … а про всякие настройки и слаги — это без слова организация и
тем более клиника. Например просто "Приём платежей выключен" или "не входит в тариф" или
"Включить в настройках"».

- [x] Замер: 62 строки в 34 файлах (без тестов и комментариев). Слово «доктор» в текстах для
      человека не встречалось ни разу — только в именах файлов и компонентов.
- [x] Про настройки и тариф — существительное убрано совсем, как и просил владелец:
      `bookingFeatureNotInTariff` «Эта возможность не входит в текущий тариф.»,
      `bookingPaymentsDisabled` «Приём оплат отключён. Включите его в настройках.»,
      `bookingPaymentProviderUnavailable` «Платёжный сервис не настроен. Проверьте настройки приёма
      оплат.», шаблон уведомлений — «эта возможность не входит в текущий тариф».
- [x] Где речь о самой организации — «организация»: карточка и список в админке платформы,
      «Управление организацией», «Настройки организации», «Команда организации», «Аккаунты
      организации», приглашение «Вас пригласили в организацию …», «Название организации не должно
      быть длиннее …», «Выберите публичный адрес организации …» и остальные 40+ мест.
- [x] Переменная шаблона `{{клиника}}` переименована в `{{организация}}`, но **старое имя
      продолжает подставляться**: шаблоны, написанные до переименования, молча перестать работать
      не должны (`withLegacyAccessNotificationVariableNames`).
- [x] НЕ трогал лендинг (`components/landing/*`, 5 мест: «Для частной практики и клиник»,
      «Клинике», «Демо для клиники»). Это продающий текст, обращённый к покупателю, а не интерфейс
      продукта; менять его — решение про маркетинг, а не про тексты ошибок. Жду слова владельца.

### 2. «Аккаунт с этой почтой уже существует» на пациентском пути — вырезать

- [x] Маршрут `/api/auth/email-otp/register` больше не отвечает `409 duplicate_email`. Если на
      адрес уже есть аккаунт, отправляется обычный код входа, и человек попадает в свой аккаунт:
      пациент всё равно входит кодом без пароля, отдельная «регистрация» ему не нужна.
      Форма ответа совпадает с обычным стартом — по ней нельзя узнать, занят адрес или нет.
- [x] Мёртвый экран в `AuthFlowV2` с текстом «Аккаунт с этой почтой уже есть. Подтвердите email и
      задайте пароль для входа.» удалён. Он был недостижим: `setEmailSetupPromptEmail` вызывался
      только со значением `null`. Вместе с ним удалены обработчик `submitEmailSetupAccessResend` и
      `startEmailSetupCode`, которые больше никто не звал.
- [x] Ключ словаря `authEmailAlreadyRegistered` удалён — после правок его не использует никто.

### 3. Форма регистрации всегда отвечает «мы отправили код»

Указание владельца: «форма всегда отвечает "мы отправили код" — делай».

- [x] `/api/auth/specialist-signup/start`: ответ `409 duplicate_email` заменён на обычный успешный
      ответ. Раньше по нему кто угодно проверял чужие адреса на наличие аккаунта, подставляя их в
      форму регистрации.
- [x] Настоящему владельцу адреса уходит письмо о попытке — по дизайну владельца: «На ваш имейл
      кто-то пытается повторно зарегистрировать аккаунт. Если это не вы, можете не обращать
      внимание. Если вы забыли пароль, воспользуйтесь ссылкой для восстановления пароля».
      Письмо не несёт ничего, кроме факта попытки: ни введённых чужой рукой ФИО, ни названия
      организации — иначе форма стала бы способом слать произвольный текст на чужую почту.
- [x] Потолок на это письмо: 3 письма на адрес в сутки. Обязателен, потому что ответ теперь всегда
      успешный, то есть отправку может дёргать кто угодно сколько угодно раз.
- [x] `/api/auth/email-password/register` (дверь клиентских учёток) — те же четыре ответа
      `409 duplicate_email` / `email_conflict` заменены на нейтральный «код отправлен». Письма о
      попытке здесь нет намеренно: владелец сказал, что клиенту такое не нужно вообще.
      Поля `error: 'existing_account_needs_email_setup'` и `setupCodeSent` убраны из успешного
      ответа — они сообщали вызывающему ровно то же самое.

### 4. Одна ошибка — одна формулировка (дедуп по смыслу, а не посимвольно)

- [x] Общая карта `errorCodeText.ts` (введена в шестом проходе) дособрана: на неё переведены
      приглашение пациента (`invalid_code`, `expired_code`, `rate_limited`, `too_many_attempts`),
      создание карточки клиента в двух разных местах (`invalid_email`, `email_conflict`),
      загрузка медиа (`invalid_body`).
- [x] `email_conflict` в общей карте вёл на текст ВХОДА («Не удалось подтвердить вход») — неверно
      для большинства мест, где он значит «адрес занят». Заведён отдельный ключ
      `authEmailBelongsToAnotherAccount`; текст входа остался только в `staffSecurityErrorText`.
- [x] `branch_service_not_found` давал разный текст на двух соседних шагах записи пациента —
      сведён к одному.
- [x] Посимвольные дубли в маршрутах подтверждения: «Код истёк. Запросите новый.» (4 файла),
      «Превышено число попыток.» (4 файла), «Ошибка подтверждения» (6 файлов) — сведены в ключи
      `authCodeExpiredRequestNew`, `authTooManyAttempts`, `authConfirmationFailed`.
- [x] Машинные слова, которые видел человек: «Некорректное тело запроса.» и
      `Не удалось загрузить (${code})` в выборе медиа (второе показывало сам код отказа),
      «OAuth credentials не заполнены в настройках» в настройках Google Calendar.

### 5. Гейт пропускал код, обёрнутый в текст — дыра закрыта

Владелец: «Ну что за гейт этого не видит? … Нахуй нам гейт, который это, блядь, пропускает».

- [x] Правило G6 ловило только `СЛОВАРЬ[код] ?? код`. Форма `СЛОВАРЬ[код] ?? \`Счёт не выставлен
      (${код}).\`` проходила мимо — а человеку от обёртки не легче, в скобках он читает машинное
      слово. Дыра была живой: так были написаны ТРИ подписи в платёжной панели платформы
      (выставление счёта, отмена, сверка).
- [x] Правило расширено на шаблонную строку, в которую подставлен тот же ключ (в том числе через
      `String(...)` и каст). Доказательство: на дереве ДО правки панели гейт даёт ровно эти 3
      находки, после — `OK`. Добавлены две фикстуры в self-test (было 43 красных, стало 45).
- [x] Сами три подписи переведены на общую карту `errorCodeText` с текстовым запасным вариантом.

### Остаётся открытым

1. Лендинг (см. выше) — жду решения владельца.
2. `/api/auth/email-password/lookup` — владелец сказал «его надо удалять». Не сделано в этом
   проходе; отдельная правка, потому что это удаление двери, а не текста.
3. `/api/auth/email-password/register` заводит учётки `role: 'client'` с паролем, хотя владелец
   говорит, что клиенту пароль не нужен вообще. Дверь оставлена работать; вопрос «нужна ли она» —
   владельцу.

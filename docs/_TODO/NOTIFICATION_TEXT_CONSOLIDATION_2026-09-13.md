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
      AST-разведкой (TypeScript compiler API) по `src/**/*.{ts,tsx}` найдено 610 call-site'ов со
      статическим строковым литералом (351 `UserFacingError` + 343 `toast.error` + 116
      `toast.success`, минус 200 динамических passthrough) — 287 различных текстов. Плюс отдельно
      обработан `staffSecurityErrorText.ts` (~36 кодов) и две именованные константы модулей
      (`SERVICE_HAS_NO_DOER_MESSAGE`, `PATIENT_PROGRAM_NOT_FOUND_MESSAGE`), не попадавшие в
      автосбор, потому что литерал жил в объявлении константы, а не в самом call-site. «Текста нет»
      кейсов с падением на generic fallback В ЭТОМ проходе не обнаружено — прежняя дыра
      (`portal_access_denied`) уже была закрыта до этой работы; см. отдельную находку про TROIKA
      дублирования этого же текста в разделе выше.
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
- [ ] Независимый адверсарный аудит прошёл ПЕРЕД приёмкой (не «зелёный CI» = «готово»). НЕ
      выполнено этим агентом-исполнителем по канону (аудитор не может быть тем же агентом/моделью,
      что автор) — требуется отдельный проход перед приёмкой владельцем/оркестратором.

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
- [ ] Независимый адверсарный аудит ЭТОГО (третьего) прохода — НЕ выполнен этим же агентом (правило:
      аудитор ≠ автор). Требуется отдельный проход перед финальной приёмкой владельцем.

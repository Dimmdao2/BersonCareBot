# Независимый адверсарный аудит №2: Э3 «это ваш аккаунт?» и выбор ФИО человеком

**Вердикт: FAIL.** Три подтверждённых дефекта (два — в области F2, один — в области F3), все с прямой
строкой канона. Заявленные F1, F4, F5 и зелёный полный CI подтверждены живыми прогонами и инъекциями.

**Кандидат:** клон `/home/dev/dev-projects/bcb-wt-fio-dialog`, ветка `wt/merge-fio-dialog`, дерево
`31037c3c8` (= `371adb1f8` + слияние `feat/doctor-ui-rebuild`; слияние не тронуло ни одного файла Э3 —
`git diff --stat 371adb1f8 31037c3c8 -- packages/platform-merge apps/webapp/src/modules/auth
apps/webapp/src/infra/repos/pgUserByPhone.ts apps/webapp/src/shared/ui/patient/auth` пуст).
Коммиты этапа: `f82c3603d` (механика), `b11f1fe4d` (первая коррекция), `371adb1f8` (коррекция по пяти
находкам первого аудита).

**Источник «todo» и «done»:** `docs/_TODO/MERGE_MECHANISM_REWRITE_2026-09-14.md`, этап Э3;
правила — `docs/ARCHITECTURE/AUTH_AND_IDENTITY_CANON.md` §18, §18а, §20.

**Классификация по §24.4 (AGENTS.md).** Повторяемое поведение движка слияния (F1, F2, F4, F5) — живой
прогон по `bcb_webapp_dev` внутри транзакции с `ROLLBACK` плюс инъекции в продуктовый код и существующие
наборы. Разовые действия (удаление `applyMessengerContactPreOtp`/`verifyCompletionState`, маршрутизация
двери, тексты) — взглядом и точечным исполнением. Новых тестов аудит не писал: каждый named fault ловится
уже существующим тестом при инъекции. Автоматических UI-тестов нет.

**Среда живого прогона.** `bcb_webapp_dev`, подключение суперпользователем через сокет-реле
(`node`-реле под пользователем `postgres`, `/tmp/e3sock`) — RLS не мешает движку, но и не подменяет его
логику. Каждый сценарий: `BEGIN` → создание строк → настоящий `mergePlatformUsersInTransaction` →
чтение результата → `ROLLBACK`. После прогонов в базе не осталось ни строки (проверено запросами по
display_name и external_id — 0 и 0). Скрипт и полный вывод:
`docs/audit/evidence/merge-e3-round2-2026-09-15/live-merge-scenarios.ts.txt` (расширение `.txt`,
чтобы файл-доказательство не попал в lint/типовой граф репозитория; запускается
`tsx live-merge-scenarios.ts.txt` после `cp` в рабочий каталог) и `live-merge-scenarios.out`.

---

## 1. Вердикты по точкам брифа

| Точка | Вердикт | Чем доказано |
|---|---|---|
| **F1** — защита от отката (тесты зовут настоящий движок, инъекции их краснят) | **PASS** | Шесть независимых инъекций, каждая краснит именно свой тест; с ВСЕМИ снятыми гейтами полный набор webapp даёт **5 failed из 3175**, то есть слепоты прошлого круга больше нет. Детали — §2 |
| **F2** — `display_name` в конфликте | **FAIL** | Конфликт по legacy-имени и доезд выбранного значения до `user_identity` — работают (сценарии A, D, I). Но два разных входа молча уничтожают имя человека: **Д-1** и **Д-2** в §3 |
| **F3** — дверь мессенджера | **FAIL** | Дверь M2M действительно отвечает `409 human_account_confirmation_required` + `continuationUrl`, удаление двух функций ничего не оборвало. Но **вторая дверь того же класса (channel-link) осталась на ложном `phone_owned_by_other_user` и ведёт человека в тупик** — **Д-3** в §3 |
| **F4** — уведомление во все каналы старой учётки | **PASS** | Живьём: после слияния на канонической учётке лежат ОБЕ telegram-привязки и max-привязка (`tg-initiator`, `tg-real-owner`, `max-real-owner`), загрузчик их не схлопывает, подтверждённая почта старой учётки переехала подтверждённой. Детали — §4 |
| **F5** — латиница конструкцией | **PASS** | Марка `HumanMergeCustomFioValue` выдаётся только валидатором, и движок ПОВТОРНО проверяет значение на латиницу: подделанное мимо Zod решение `{source:'custom', value:'Smith John'}` отклонено живьём. Снятие runtime-проверки — «Smith John» доезжает до `platform_users` и `user_identity`. Детали — §5 |
| **Полный CI** | **PASS (измерено, не принято на веру)** | `TEST_CPUSET=0-7 VITEST_MAX_WORKERS=8 /home/dev/brain/host-orch/run-tests.sh "pnpm install --frozen-lockfile && pnpm run ci"` на `31037c3c8`: 11/11 шагов PASS, `код возврата 0`, 548 s под общим замком. Лог — `evidence/full-ci-31037c3c8.out` |

---

## 2. F1 — инъекции (каждая применялась к продуктовому коду и откатывалась)

Базовая точка: чистое дерево, `vitest run --project unit accountMergeMedicalHistory.unit.test.ts
accountMergeNotification.unit.test.ts` → **11 passed**.

| # | Что сломано руками | Что покраснело | Живое подтверждение той же поломки |
|---|---|---|---|
| A | оба гейта «нет решения человека» (`pgPlatformUserMerge.ts:419`, `:711`) заменены на автоподстановку решения | `refuses an automatic merge without a human confirmation` | сценарий `E-inj`: `mergePlatformUsersInTransaction(..., {})` **слило две учётки без единого вопроса** |
| B | сверка снимка (`:509`) обойдена (`if (false && …)`) | `refuses a confirmation when the locked account snapshot changed after it was shown` | сценарий `J-inj`: подтверждение, показанное для «Иванов Иван Петрович», применилось к строке, уже переименованной в «Петров Пётр» |
| C | `resolveHumanFioField` и ветка `display_name` выбирают сами вместо `throw` (`:285`, `:742`) | `refuses a structured FIO conflict…` + `treats different legacy display-only FIO as a human conflict…` | сценарий `C-inj`: при конфликте «Иванов Иван» / «Сидорова Анна» движок сам записал «Иванов Иван» |
| D | снята runtime-проверка латиницы (`:291`, `:760`) | `rejects a Latin custom FIO even when a caller bypasses the request schema` | сценарий `D`: «Smith John» записан в `platform_users` **и** в `user_identity` |
| E | `mergePairIfDistinct` снова кидает `phone_owned_by_other_user` вместо `human_account_confirmation_required` | `routes an existing-account collision to human confirmation` (integrator) | — (разовое отображение кода, см. §3 Д-3) |
| ALL | A+B+C+D одновременно | **5 failed / 3130 passed / 40 skipped из 3175** в полном наборе webapp | — |

После каждой инъекции дерево восстанавливалось (`git checkout -- <файл>`); финальное состояние —
`git status --porcelain` пуст, целевые тесты снова 11 passed.

---

## 3. Находки

### Д-1 (дефект, подтверждён живьём). Выбор варианта «ФИО» стирает разобранные части, которые канон велит ДОПОЛНИТЬ

**Строка канона.** §18а п.3: «**Поля не конфликтуют** — совпадают, либо с одной стороны пусто. Тогда
просто **дополняем недостающее**… Спрашивать нечего.»

**Где.** `packages/platform-merge/src/pgPlatformUserMerge.ts:737-770` — в ветке конфликта по
`display_name` выбор человека переписывает `last_name`/`first_name`/`patronymic` значениями выбранной
стороны (а при «ввести свой вариант» — обнуляет их все).

**Вход и неверный исход (живьём, сценарий B).** Целевая учётка: `display_name='Иванов Иван'`,
`last_name='Иванов'`, `first_name='Иван'`. Дубликат: `display_name='Ваня'`, разобранных частей нет.
`conflicts = ["display_name"]`, человек выбирает «Ваня». Результат:

```
--- target platform_users: {"display_name":"Ваня","first_name":null,"last_name":null,"patronymic":null}
--- target user_identity : {"display_name":"Ваня","first_name":null,"last_name":null,"patronymic":null}
```

Фамилия и имя **не конфликтовали** (с одной стороны пусто) — по канону их надо было дополнить, а они
уничтожены. Зеркально то же в сценарии G (legacy — цель, разобранная — дубликат). Человек в диалоге
выбирает подпись, а теряет фамилию: врач в списке клиентов и в карточке читает ФИО из `user_identity`
(`apps/webapp/src/infra/repos/userIdentityFioSql.ts:14-24`, без COALESCE на legacy-колонки), то есть
после слияния у пациента остаётся только прозвище.

**Оговорка, которую обязан знать ведущий:** `formatDoctorFio` собирает подпись из частей и лишь потом
берёт `display_name`, поэтому сохранить части «как есть» — тоже не готовое решение: врач увидит
«Иванов Иван» вместо выбранного «Ваня». Правильный разбор (спрашивать части отдельно, или выводить
части из выбранного значения, или уводить решение владельцу) — не в компетенции аудита; факт нарушения
строки канона от этого не меняется.

**Досягаемость на живых данных DEV** (срез с прод-дампа): 229 учёток-клиентов с разобранными частями и
29 legacy-учёток только с `display_name`.

### Д-2 (дефект, подтверждён живьём). Пустое имя найденной учётки МОЛЧА затирает настоящее имя второй стороны

**Строка канона.** §18а: «…вторая сторона пуста — поле просто дополняется» и п.3 «Поля не конфликтуют —
совпадают, **либо с одной стороны пусто**. Тогда просто дополняем недостающее».

**Где.** `pgPlatformUserMerge.ts:770-779` — не-конфликтная ветка: `fallbackDisplayName =
normalizedFioPart(recognizedAccount.display_name) ?? ''`, где `recognizedAccount` — та учётка, которую
показали человеку (`foundAccountId`). Если у неё `display_name` пустой, а разобранных частей нет ни у
кого, в канон записывается **пустая строка**.

**Вход и неверный исход (живьём, сценарий F).** Найденная учётка: `display_name=''`. Вторая:
`display_name='Иванов Иван Петрович'`. `conflicts = []` — **вопроса человеку нет вообще**:

```
--- target platform_users: {"display_name":"","first_name":null,"last_name":null,"patronymic":null}
--- target user_identity : {"display_name":"","first_name":null,"last_name":null,"patronymic":null}
```

Имя человека исчезает из платформы. В диалоге он при этом видел карточку «**ФИО не указано**, создан
<дата>» (`AccountMergeConfirmation.tsx:73`) и нажал «Да, это мой аккаунт» — то есть подтвердил учётку, а
потерял собственное имя. Сценарий N: то же в обратную сторону (пустая учётка — цель). Сценарий O: если у
именованной стороны есть разобранные части, имя выживает — дефект бьёт ровно по legacy-парам.

**Досягаемость на живых данных DEV:** 12 учёток-клиентов из 270 имеют пустой `display_name`
(`select count(*) … where role='client' and merged_into_id is null and coalesce(trim(display_name),'')=''`
→ 12), а «найденной» в обеих дверях (телефон, почта) становится именно уже существующая учётка.

### Д-3 (дефект, подтверждён исполнением). Вторая дверь того же конфликта осталась на ложном `phone_owned_by_other_user` и ведёт в тупик

**Строка канона/плана.** §18а — конфликт двух живых учёток разбирается диалогом «это ваш аккаунт?»;
§18 — привязка чужого контакта сливает учётки. Этап Э3 обязан убрать движковый выбор, а не убрать
слияние.

**Где.** `apps/webapp/src/infra/repos/pgChannelLinkClaim.ts:137-152`: `tryMergeChannelLinkOwners` —
путь «канал уже привязан к НАСТОЯЩЕЙ учётке» (`classification.kind === 'real'`,
`apps/webapp/src/modules/auth/channelLink.ts:183-216`) — раньше звал
`mergePlatformUsersInTransaction`, а теперь **безусловно кидает** `MergeConflictError('merge: human
account confirmation required')`. Дальше `classifyMergeFailure` (в `mergeFailureClassification.ts:60-65`
у `MergeConflictError` единственный запасной код) превращает это в тот самый ложный код. Исполнено:

```
channel-link door classification = {"code":"phone_owned_by_other_user","candidateIds":["t-1","e-2"]}
human text shown for it = Телефон уже принадлежит другому пользователю
```

**Что видит человек.** `channelLink.ts:216` → `{ ok: false, code: 'conflict', mergeReason:
'phone_owned_by_other_user' }` → бот показывает
`channelLink.completeFailed.conflict`: «Привязка не выполнена: этот Telegram уже связан с другим
аккаунтом. **Войдите в веб-приложении под тем пользователем или обратитесь в поддержку.**» Диалога
подтверждения на этом пути нет, `continuationUrl` не выдаётся, слияние не происходит никогда. В том же
ходу оператору уходит алерт с той же ложной причиной
(`recordChannelLinkOwnershipConflict`, `channelLink.ts:212`). Речь при этом о привязке КАНАЛА, а не
телефона, — текст врёт дважды.

Рядом: после `throw` в `tryMergeChannelLinkOwners` осталась недостижимая строка
(`runWebappSql(... auth_channel_link_mark_secret_used_if_unused ...)`) — мёртвый код, оставшийся от
вырезанного слияния.

---

## 4. F4 — доказательство по каналам (PASS)

Сценарий A, живьём. До слияния: у инициатора `telegram/tg-initiator` и подтверждённый телефон, у
найденной (старой) учётки `telegram/tg-real-owner`, `max/max-real-owner` и подтверждённая почта. После
`mergePlatformUsersInTransaction`:

```
--- target channels : [{"channel_code":"max","external_id":"max-real-owner"},
                       {"channel_code":"telegram","external_id":"tg-initiator"},
                       {"channel_code":"telegram","external_id":"tg-real-owner"}]
--- target contacts : [{"contact_kind":"email","value_normalized":"old-owner@example.test","confirmed":true},
                       {"contact_kind":"phone","value_normalized":"+79990000001","confirmed":true}]
```

Обе telegram-привязки живут на канонической учётке отдельными строками. Загрузчик
`loadPlatformUserChannelBindingRows` (`apps/webapp/src/infra/repos/loadPlatformUserChannelBindings.ts:12-21`)
— это ровно такой же `select` без схлопывания, а `mergeNotificationTargets`
(`accountMergeNotification.ts:16-35`) раскладывает каждую строку в отдельную цель и дедуплицирует по
паре «канал+получатель»; ключ идемпотентности содержит хеш получателя, поэтому два telegram-адресата не
схлопнутся и в очереди. Вызов идёт ПОСЛЕ слияния и по каноническому `user.userId`
(`buildAppDeps.ts:1798-1805`), `mergedAccountId` берётся из факта слияния, а не из наличия решения
(`pgUserByPhone.ts:772-776`). Почта настоящего владельца переезжает **подтверждённой**, поэтому email- и
sms-цели фильтр `if (!contact.confirmedAt) continue` не отсекает.

Инъекция F: вернул fan-out на схлопнутую сессионную проекцию (`user.bindings.telegramId` /
`maxId`) — `accountMergeNotification.unit.test.ts` краснеет
(`expected [ Array(2) ] to deeply equal [ Array(4) ]`), то есть именно этот тест удерживает состав
получателей. Инъекция откачена.

---

## 5. F5 — латиница (PASS)

- Марку `HumanMergeCustomFioValue` (`humanMergeDecision.ts:10-19`) нельзя получить из строки иначе как
  через `createHumanMergeCustomFioValue`, который отвергает пустое и любое `[A-Za-z]`; Zod-схема все
  четырёх дверей (`humanMergeDecisionSchema.ts:16-20`, маршруты `phone/confirm`,
  `messenger-bind/finish`, `email/confirm`, `patient/email-change/confirm`) пропускает значение только
  через этот конструктор.
- Собранное МИМО схемы решение движок всё равно отвергает: сценарий D, подделка
  `{source:'custom', value:'Smith John' as unknown as HumanMergeCustomFioValue}` →
  `merge: invalid custom human choice for display_name`; следом кириллическое «Иванова Мария»
  принимается и доезжает до `platform_users` и `user_identity`.
- Инъекция D доказывает, что именно эта runtime-проверка держит вход: без неё «Smith John» оказывается в
  каноне.

Подделать решение иначе не выходит: сценарии J/K/L/M — изменённый после показа снимок, подделанный
`conflicts: []`, решение от другой пары и `accountConfirmed: false` отвергаются
(`shown account details changed before confirmation` / `human decision does not match locked account
pair`).

---

## 6. F3 — что проверено и оказалось в порядке

- Дверь `POST /api/integrator/messenger-phone/bind` отдаёт `409` только для
  `human_account_confirmation_required` (`route.ts:120-127`), тело несёт абсолютный `continuationUrl`;
  контракт `apps/webapp/INTEGRATOR_CONTRACT.md` описывает и код, и поле.
- Человек по браузерному пути действительно доходит до диалога: `confirmPhoneAuth` при конфликте
  возвращает `mergeRequired: true` с prompt (`phoneAuth.ts:232-235`), маршруты отдают его клиенту, а
  `PhoneMessengerAuthFlow`/`EmailAccountPanel` показывают `AccountMergeConfirmation`.
- Удаление `applyMessengerContactPreOtp` и `verifyCompletionState` ничего не оборвало: их последние
  вызовы ушли ещё в `f82c3603d`, ссылок в коде нет (`grep` по `apps`, `packages`), `profile_bind` теперь
  проходит через OTP-челлендж и браузерный `finish` (`phoneMessengerBind.ts:259-300`,
  `PhoneMessengerAuthFlow.tsx:172-200`), контракт и рунбук переписаны в том же коммите; typecheck и оба
  набора тестов зелёные.

---

## 7. Вопросы владельцу (по §24.6 — не работа, пока владелец не скажет)

1. **`continuationUrl` строится из `request.url`** (`route.ts:120`), а не из `env.APP_BASE_URL`, которым
   в этом же файле строятся строки алерта (`messengerPhoneHttpBindExecute.ts:186`). Внешний вызов на
   внутренний адрес (`http://127.0.0.1:6200/...`) даст человеку ссылку
   `http://127.0.0.1:6200/app`, которую он не откроет. Строки плана про это нет.
2. **Нормальный путь пишет операторский алерт как ошибку.** `human_account_confirmation_required`
   проходит через ту же ветку, что и настоящие блокеры: `admin_audit_log` со `status: 'error'` и релей
   оператору (`messengerPhoneHttpBindExecute.ts:131-229`). Это штатный сценарий «человек подтвердит в
   браузере», а не инцидент.
3. **Бот говорит «Номер привязан» до того, как номер привязан.** `profile_bind` теперь только открывает
   OTP-попытку; запись делает браузерный `finish`. Шаблон
   `channelLink`/`phoneAuthPhoneLinked` = «Номер привязан. Вернитесь в приложение.»
   (`apps/integrator/src/content/{telegram,max}/user/templates.json`).
4. **Уведомление о слиянии не несёт ни кода подтверждения, ни кнопки «это не я»**, хотя §18а
   («Уведомление старых контактов») их называет: текст — «Ваши учётные записи объединены после входа с
   нового устройства. Если это были не вы, обратитесь в поддержку»
   (`notificationText.ts:61-63`). В строке плана Э3 этого нет — отдельное решение.
5. **Контакты старой учётки после слияния остаются подтверждёнными** (`merge-from` в
   `userContactsMirrorWrite.ts:33-54` переносит `confirmed_at` как есть), а §18а говорит, что они должны
   появиться в новой учётке **неподтверждёнными**. Сегодня это же свойство и доставляет уведомление
   настоящему владельцу (§4), поэтому менять его в отрыве от п.4 нельзя.

---

## 8. НЕ ПРОВЕРЕНО

- **Живой UI диалога** (кнопки, «ввести свой вариант», мобильные ширины) — по §1a аудитор не поднимает
  второй Next-сервер, а на общий `:5200` кандидат не приземлён. Проверено только поведение слоёв под UI.
- **Настоящий M2M-вызов двери `messenger-phone/bind`** — требует подписанного внешнего клиента; проверены
  отображение кода в статус (чтением) и поведение пакета (тестом + инъекцией E).
- **Доставка уведомлений** дальше постановки в очередь `outbound_messages` — очередь и отправка вне
  скоупа Э3.
- **Э1, Э2, Э4a, Э4b, Э5** — вне брифа.

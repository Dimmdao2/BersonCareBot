# Э3, третий круг: три дефекта второго аудита закрыты

**Клон:** `/home/dev/dev-projects/bcb-wt-fio-dialog`, ветка `wt/merge-fio-dialog`.
**Вход:** `abe4b03f2`. **Коррекция:** `f2ef7bd7e`.
**Оракул:** `docs/ARCHITECTURE/AUTH_AND_IDENTITY_CANON.md` §18а. **План:** `docs/_TODO/MERGE_MECHANISM_REWRITE_2026-09-14.md`, этап Э3.
**Вход по находкам:** `docs/audit/merge-e3-human-confirmation-round2-2026-09-15.md` (вердикт FAIL, Д-1…Д-3).
**Доказательства:** `docs/audit/evidence/merge-e3-round3-2026-09-15/`.

F1, F4, F5 и состав уведомления не трогались — приняты прошлым кругом.

---

## Д-1. Выбор варианта ФИО больше не стирает НЕконфликтующие разобранные части

**Решение ведущего, по которому сделано:** расхождение между выбранным человеком display-вариантом и
разобранными частями другой стороны — это КОНФЛИКТ, и он обязан попадать в диалог **со своим выбором**;
ни молча стирать части, ни молча их сохранять движок не имеет права.

**Что изменено.**

1. `packages/platform-merge/src/humanMergeDecision.ts`, `createHumanMergePrompt`. Когда конфликтует
   `display_name` (legacy-подпись против разобранного ФИО), в `conflicts` теперь попадает не только
   `display_name`, но и **каждая часть, которая есть ровно у одной стороны**. Для входа из находки
   (`'Иванов Иван'` + `last='Иванов'`, `first='Иван'` против `'Ваня'`) диалог спрашивает три вопроса:
   `['display_name', 'last_name', 'first_name']`. Порядок детерминирован — снимок, привязывающий ответ
   к показанному (`humanMergeDecisionMatchesPrompt`), продолжает работать.
2. `packages/platform-merge/src/pgPlatformUserMerge.ts`. Ветка `display_name` больше не переписывает
   `last_name`/`first_name`/`patronymic` оптом по выбранной стороне и не обнуляет их при «ввести свой
   вариант». Каждая часть проходит через `resolveHumanFioField` с новым параметром
   `humanChoiceRequired`: поле названо конфликтом в показанном диалоге — движок требует ответ и
   применяет ровно его (включая ответ «не указано»); поле не названо — работает прежнее дополнение
   недостающего (§18а, п.3).

**Следствие для входа из находки.** Человек, выбравший «Ваня», отвечает ещё на два вопроса: «Фамилия:
Иванов / Не указано / свой вариант» и «Имя: Иван / Не указано / свой вариант». Оставил части — они
доезжают до канона и зеркала; снял — они снимаются по его слову. Беззвучно не пропадает ни одна
сторона. Оговорка аудитора («просто сохранить части» решением не является) снята тем же ходом: движок
ничего не сохраняет сам.

3. `apps/webapp/src/shared/ui/patient/auth/AccountMergeConfirmation.tsx`: пустая сторона рисуется как
   **«Не указано»**, а не пустой кнопкой — иначе новый вопрос был бы нажимаем, но нечитаем.

**Команда и вывод.**

```
pnpm --dir apps/webapp exec vitest run --project unit \
  accountMergeMedicalHistory.unit.test.ts accountMergeNotification.unit.test.ts
→ Test Files 2 passed (2) · Tests 15 passed (15)
```

Инъекции (полный вывод — `evidence/merge-e3-round3-2026-09-15/injections.out`):

| Инъекция в продуктовый код | Что покраснело |
|---|---|
| A — части снова переписываются оптом со стороны выбранной подписи | `keeps the FIO parts the person kept while writing the display name the person chose` |
| C — диалог снова спрашивает только про `display_name` | `asks about every FIO part the display-name choice can overwrite…` + `drops the FIO parts only when the person answered "not specified" for them` |

После каждой инъекции дерево восстанавливалось; `git status --porcelain` чист (кроме новых файлов
доказательств).

---

## Д-2. Пустое `display_name` найденной учётки больше не затирает настоящее имя второй стороны

**Что изменено.** `pgPlatformUserMerge.ts`, неконфликтная ветка: `fallbackDisplayName` перестал быть
«только найденная учётка, иначе пустая строка». Теперь это цепочка **найденная → вторая → `''`**, то
есть ровно §18а: «с одной стороны пусто — дополняем недостающее». Вопроса человеку в этом входе нет и
не должно быть: поля не конфликтуют.

**Команда и вывод.** Тот же прогон (15 passed) плюс инъекция B — возврат `?? ''` краснит
`lets the empty display name of the recognized account be filled in, not overwrite the real one`.

---

## Д-3. Вторая дверь того же правила закрыта, третья найдена и закрыта тем же швом

**Что изменено.**

1. `packages/platform-merge/src/mergeFailureClassification.ts` — **общий шов**. У классификации появился
   собственный код `human_account_confirmation_required`; все отказы движка, означающие «ждём ответа
   человека в диалоге», перестали падать в чужой `phone_owned_by_other_user`. Это и есть ответ на «правило
   живёт за несколькими дверьми»: чинится не названная дверь, а место, через которое они все проходят.
2. `apps/webapp/src/infra/repos/pgChannelLinkClaim.ts`, `tryMergeChannelLinkOwners` — безусловный
   `throw` внутри транзакции и недостижимая строка `auth_channel_link_mark_secret_used_if_unused` после
   него убраны. Функция больше не открывает транзакцию ради исключения: возвращает
   `{ ok: false, reason: 'human_account_confirmation_required' }`. Одноразовый токен привязки при этом
   не гасится — привязку можно довести, не запрашивая новую ссылку.
3. `apps/integrator/src/kernel/domain/executor/executeAction.ts` + `content/{telegram,max}/user/templates.json`
   — новый ключ `channelLink.completeFailed.humanConfirmation`. Вместо «этот Telegram уже связан с
   другим аккаунтом. Войдите в веб-приложении под тем пользователем или обратитесь в поддержку» бот
   говорит правду и называет **реальный** следующий шаг: открыть приложение и подтвердить телефон или
   почту того аккаунта — там живёт диалог «это ваш аккаунт?» (браузерный путь `confirmPhoneAuth`,
   подтверждённый прошлым аудитом). Тот же ключ подставлен и во вторую карту текстов
   (`phoneMessengerBindCompleteFailureTemplateKey`), где этот код раньше уходил в глухой `phoneAuthFailed`.
4. Операторский алерт (`channel_link ownership conflict … classifiedReason=…`) печатает причину
   дословно — теперь она правдива. Сам факт алерта на штатном пути не трогал: это вопрос владельцу №2.

**Третья дверь.** `packages/platform-merge/src/identityProjectionWrite.ts:103`,
`collapseIdentityProjectionCandidates` кидает `MergeConflictError('… human account confirmation
required')` — тот же текст, та же прежняя ложная классификация. Отдельной правки не потребовала:
закрылась швом из п.1. Проверено исполнением вместе с остальными.

**Четвёртая дверь проверена и оказалась чистой:** `apps/webapp/src/infra/repos/pgEmailPasswordLookup.ts:99`
уже пишет `reason: 'human_account_confirmation_required'` своим кодом и отдаёт наружу `email_conflict` —
ложного утверждения про телефон там нет.

**Команда и вывод.**

```
pnpm --dir apps/webapp exec tsx /tmp/e3-check.mts        → evidence/classify-merge-failure.out
channel-link door              -> human_account_confirmation_required ["t-1","e-2"]
identity projection collapse   -> human_account_confirmation_required ["t-1","e-2"]
engine: no decision            -> human_account_confirmation_required ["t-1","e-2"]
engine: field unanswered       -> human_account_confirmation_required ["t-1","e-2"]
engine: snapshot moved         -> human_account_confirmation_required ["t-1","e-2"]
real blocker (must stay)       -> merge_blocked_distinct_real_users ["t-1","e-2"]
```

Настоящая дверь, вызванная напрямую (`evidence/channel-link-door.out`):

```
channel-link door result = {"ok":false,"reason":"human_account_confirmation_required","candidateIds":["t-1","e-2"]}
```

```
pnpm --dir apps/integrator exec vitest run src/kernel/domain/executor
→ Test Files 8 passed (8) · Tests 27 passed (27)
```

**Чем НЕ доказано.** Подстановку нового ключа шаблона и его текст я проверил чтением кода и JSON
(`channelLinkCompleteFailureTemplateKey` — приватная функция модуля, живого бота в клоне нет).
Постоянного теста на текст не заводил: §10a прямо запрещает фиксировать пользовательский текст тестом.

---

## Проверки

| Что | Команда | Итог |
|---|---|---|
| Целевые тесты движка | `pnpm --dir apps/webapp exec vitest run --project unit accountMergeMedicalHistory.unit.test.ts accountMergeNotification.unit.test.ts` | 15 passed |
| Юниты репозиториев webapp | `pnpm --dir apps/webapp exec vitest run --project unit src/infra/repos` | 67 файлов, 290 passed |
| Исполнитель integrator | `pnpm --dir apps/integrator exec vitest run src/kernel/domain/executor` | 8 файлов, 27 passed |
| Typecheck webapp | `pnpm --dir apps/webapp typecheck` | rc=0 |
| Typecheck integrator | `pnpm --dir apps/integrator typecheck` | rc=0 |
| Lint webapp | `pnpm --dir apps/webapp lint` | rc=0 |
| Полный CI | `TEST_CPUSET=0-7 VITEST_MAX_WORKERS=8 /home/dev/brain/host-orch/run-tests.sh "pnpm install --frozen-lockfile && pnpm run ci"` | см. `evidence/full-ci.out` |

## Вопросы владельцу (не работа, ничего из этого не чинил)

1. `continuationUrl` строится из `request.url`, а не из `APP_BASE_URL` — внешний M2M-вызов на внутренний
   адрес даст человеку неоткрываемую ссылку.
2. Штатный путь «человек подтвердит в браузере» пишет операторский алерт как ошибку (`status: 'error'`)
   наравне с настоящими блокерами.
3. Бот говорит «Номер привязан» до того, как номер привязан: `profile_bind` теперь только открывает
   OTP-попытку, запись делает браузерный `finish`.
4. Уведомление о слиянии не несёт ни кода подтверждения, ни кнопки «это не я», хотя §18а их называет.
5. Контакты старой учётки после слияния остаются подтверждёнными, а §18а требует неподтверждённых;
   менять в отрыве от п.4 нельзя — сегодня именно это свойство доставляет уведомление владельцу.
6. **Новый, из этого круга.** Прямого продолжения диалога В САМОЙ двери channel-link нет: чтобы
   показать «это ваш аккаунт?» человеку, вернувшемуся в приложение, нужно знать `externalId`
   мессенджера, с которым возник конфликт, а он сегодня нигде для браузера не сохраняется (только в
   `admin_audit_log`, куда пациенту ходить нельзя). Сделать это = либо колонка на строке
   одноразового токена (миграция), либо новый читатель конфликта — отдельный этап, не дефект-фикс. Сейчас
   человек выведен из тупика существующим путём: бот отправляет его подтвердить телефон/почту того
   аккаунта, где диалог уже живёт.

## НЕ СДЕЛАНО

- **Живой UI диалога** (три вопроса вместо одного, кнопка «Не указано», «ввести свой вариант»,
  мобильные ширины) не проверен в браузере: §1a запрещает поднимать второй Next-сервер из клона, на
  общий `:5200` кандидат не приземлён, автоматические UI-тесты запрещены. Это первое, что нужно
  прокликать после приземления.
- **Живой прогон по `bcb_webapp_dev`** (как во втором аудите) не повторял: сценарии второго аудита
  проверяли поведение движка, и оно здесь покрыто теми же входами через публичную границу
  `mergePlatformUsersInTransaction` с инъекционной проверкой. Перепроверка на живой базе после
  приземления не помешает.
- **Настоящий проход бота** по двери channel-link (Telegram/MAX → webhook → текст) не исполнялся:
  живого бота в клоне нет.
- **Вопросы владельцу 1–6** — ничего не чинил.
- **Э1, Э2, Э4a, Э4b, Э5** — вне брифа.

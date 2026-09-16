FAIL — 2 MUST FIX.

# Независимый адверсарный аудит правила текстов после правки корня — круг 3

Дата: 2026-09-16  
Кандидат: `614fd6614` поверх `07ec8a67d` (база кандидата `a83e89e1d`)  
Область решения: только `docs/_TODO/E5_EMAIL_AT_LOGIN_GROUND_2026-09-15.md` §5 п.1 и `AGENTS.md` §21a.

## MUST FIX 1 — лимит тарифа по-прежнему написан вне словаря

**Достижимый сценарий.** При исчерпанной квоте филиалов `POST /api/admin/booking-engine/branches` и
`PATCH /api/admin/booking-engine/branches/[id]` кладут результат
`quotaLimitReachedRefusalMessage(...)` в поле `message` (`route.ts:64-72`, `[id]/route.ts:80-88`).
`apiJson` сохраняет серверный `message` в `ApiRequestError.message`, а
`BookingSoloLocationsSection` переносит `error.message` в `actionError` и показывает его человеку.

**Нарушение.** Сама фабрика всё ещё содержит инлайновую фразу в
`apps/webapp/src/app-layer/guards/requireEntitlement.ts:61-62`. Это соседняя ветка того же изменённого
модуля, где четыре `entitlementMutation*` уже перенесены в `notificationTextFactory`. Зелёный сторож её
не оправдывает: маршрут импортирует фабрику из другого модуля, а шапка сторожа честно объявляет эту
границу (`check-notification-text-coverage.mjs:79-83`).

**Impact.** Видимый отказ остаётся второй независимо редактируемой копией вне единого словаря и может
разойтись с остальными тарифными отказами без красного гейта.

**Строка оракула.** `AGENTS.md:2008-2015`: «Любой текст, который увидит человек … берётся из
notificationText.ts … к полю message в ответе маршрута … строку на месте вызова не писать»;
`AGENTS.md:2024-2025`: «чего он не ловит — не разрешено, а просто не поймано».

## MUST FIX 2 — `rate_limited` и `too_many_attempts` ошибочно сведены к одному смыслу

**Достижимый сценарий.** В `startEmailChallenge` это разные продуктовые состояния:

- `too_many_attempts` возвращается активной decaying-lockout после исчерпания попыток проверки кода
  (`emailAuth.ts:313-320`);
- `rate_limited` возвращается cooldown повторной отправки, когда новый challenge не создан
  (`emailAuth.ts:352-370`).

На первичном вызове `/api/auth/email/start` экран показывает `data.message` как `emailStartError`
(`EmailAccountPanel.tsx:61-84`). Коммит `07ec8a67d` объединил оба case и теперь для обоих отдаёт
`notificationText.authTooManyAttempts` (`email/start/route.ts:78-84`). Поэтому человек, который лишь
слишком рано повторил отправку, читает «Слишком много попыток», а прежняя точная инструкция
«Подождите перед повторной отправкой» потеряна.

**Почему это два смысла.** Resend cooldown ограничивает частоту отправки нового письма; decaying lockout
защищает проверку кода после неверных попыток. У них разные причины и разные пользовательские действия,
а обязательного security-неразличения здесь нет: API уже возвращает разные машинные коды. Общий
`Retry-After` не превращает эти состояния в один продуктовый смысл.

**Impact.** Сообщение стало фактически неверным для обычного раннего resend и перестало объяснять,
какое действие надо повторить после ожидания.

**Строка оракула.** `AGENTS.md:2008-2017`: соответствие «машинный код → фраза» принадлежит
`errorCodeText.ts`; один ключ обязателен только для **одинакового смысла**, а неподходящая формулировка
исправляется в словаре. Исключение безопасности из `AGENTS.md:2018-2019` к этим кодам не относится.

## Что прошло

1. **Корень G4b.** Во временном реальном route-файле проверены function-scoped `const`, `.concat`,
   литеральный массив с `.join`, object-literal через `[ключ]`, через точку и через вложенный контейнер,
   локальная фабрика. Команда
   `/home/dev/brain/host-orch/run-tests.sh "node apps/webapp/scripts/check-notification-text-coverage.mjs"`
   вернула `7 call site(s)` и для каждого — именно `template sentence`; после замены тех же семи форм на
   `notificationText` тот же полный обход дерева вернул `notification text coverage: OK`.
2. **Граница.** Шапка точно обещает same-file const/concat/join/object/local-function и прямо говорит,
   что импортированные идентификаторы между модулями не разворачиваются
   (`check-notification-text-coverage.mjs:79-83`). Обещания межмодульного анализа нет.
3. **Нешумность.** На исходном дереве команда
   `/home/dev/brain/host-orch/run-tests.sh "node apps/webapp/scripts/check-notification-text-coverage.mjs --self-test"`
   завершилась `rc=0`: `65 leak fixtures red`, `31 safe shapes green`,
   `12 targeted mutations green`, затем полный tree-check `OK`.
4. **Целевые мутации не являются счётчиком без проверки.** Для каждой пары код сначала требует красный
   `checkSource(source)`, затем зелёный `checkSource(mutation)`; только после этого пара входит в число
   (`check-notification-text-coverage.mjs:1315-1326`). Дополнительно безопасная сторона одной пары была
   временно заменена исходной утечкой: команда
   `/home/dev/brain/host-orch/run-tests.sh "node apps/webapp/scripts/check-notification-text-coverage.mjs --self-test --self-test-only"`
   штатно завершилась `rc=1` с `self-test mutation stayed red ... function-scoped const`. Поломка
   восстановлена, повторный штатный прогон зелёный.
5. **Перенесённые фразы.** Четыре `entitlementMutation*`, `invalid_email`, `email_send_failed`, default,
   `phone invalid_code`, `sms_disabled_web` и `delivery_failed` не потеряли смысл и не создали нового
   смыслового близнеца. Исключение — отдельная потеря смысла `rate_limited`, вынесенная в MUST FIX 2.
6. **Owner default Э5.** Изменения не расширяют разрешённые до подтверждения email поверхности и не
   затрагивают показ клинических данных; нарушения `docs/_TODO/E5_EMAIL_AT_LOGIN_GROUND_2026-09-15.md:194-197`
   в проверенном diff нет.

## Итог

Механика корня, нешумность дерева, честная межмодульная граница и самотест приняты. Кандидат не проходит
§21a из-за одной достижимой инлайновой фабрики и одного ошибочного объединения двух разных отказов.
Продуктовые исправления аудитор не вносил.

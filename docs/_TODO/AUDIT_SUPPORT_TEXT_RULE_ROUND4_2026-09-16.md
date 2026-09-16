FAIL — 3 MUST FIX.

# Независимый адверсарный аудит правила текстов — круг 4

Дата: 2026-09-16  
Кандидат: `d3bbddd586761c71b6538431af944c98a5dbf53e` в ветке
`wt/patient-support-single-door`  
Область authority: `docs/_TODO/E5_EMAIL_AT_LOGIN_GROUND_2026-09-15.md` §5 п.1,
`AGENTS.md` §10a, §10b и §21a, brief круга 4.

До проверки пункты классифицированы как в brief: пп. 1 и 3 — взгляд + `rg`; п. 2 — взгляд на
полную цепочку ответа + целевой прогон; п. 4 — тест существующего гейта по всему дереву. Новые тесты
и автоматизированные UI-тесты не создавались.

## MUST FIX 1 — тест оставил вторую точную копию текста лимита тарифа

**Достижимый сценарий.** Фабрика теперь действительно одна в production-коде:
`notificationTextFactory.entitlementQuotaLimitReached(action, mechanicLabel)` возвращает прежнее предложение,
`quotaLimitReachedRefusalMessage` передаёт в неё прежний `action` и
`MECHANIC_REGISTRY[mechanic].label`; оба caller-а по-прежнему передают «создать локацию» / «сохранить
локацию» и механику `branches`, чья метка — «Филиалы». Но
`apps/webapp/src/app/api/admin/booking-engine/branches/route.route.test.ts:94-100` дословно повторяет всё
предложение.

Это не теоретическое замечание. Временная законная, смыслосохраняющая правка только словарной фабрики с
«в вашем тарифе исчерпан лимит …» на «лимит тарифа … исчерпан» покрасила этот route-test: команда
`/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest --run --project=route src/app/api/admin/booking-engine/branches/route.route.test.ts"`
вернула `1 failed | 2 passed`, единственная разница — поле `message`. Временная правка возвращена. Значит тест
фиксирует копирайт, требует правки при честной смене фразы и является второй копией, которую пункт 1 brief просил
искать по всем вызывающим.

**Impact.** Законная правка единственного словарного ключа красит набор, хотя наблюдаемое продуктовое поведение
«человек получает понятный отказ с действием и названием лимита, а не машинный код» сохранено. Это ровно ложный
красный сигнал, запрещённый каноном тестов.

**Строка оракула.** `AGENTS.md:1439-1445`: запрещён тест, фиксирующий точный пользовательский текст;
`AGENTS.md:1469-1477`: существующий тест тоже меряется вопросом «придётся ли его править при честной правке
кода?»; если придётся, он держит форму, а не поведение.

## MUST FIX 2 — пациентский resend-path снова объединяет два состояния перед экраном

**Достижимый сценарий.** Маршрут теперь отдаёт разные пары:

- `rate_limited` → `notificationText.authResendTooSoon`;
- `too_many_attempts` → `notificationText.authTooManyAttempts`.

Первичный `startEmail` в `EmailAccountPanel` показывает `data.message`, и на этом пути фразы различимы. Но
настоящий повтор из формы кода проходит через `EmailAccountPanel.tsx:364-390`: условие
`res.status === 429 || data.error === 'rate_limited'` классифицирует **любой** 429 как обычный cooldown и
выбрасывает `data.message`. `OtpCodeForm.tsx:124-138` получает только `{ kind: 'rate_limited',
retryAfterSeconds }`, а `:259-262` показывает один countdown.

Сценарий достижим без искусственного состояния: в первой вкладке открыт challenge и истёк countdown; во второй
вкладке (или на другом устройстве той же учётки) исчерпаны попытки кода и зарегистрирован lockout; resend из
первой вкладки получает от `startEmailChallenge` код `too_many_attempts` и HTTP 429. Экран первой вкладки
обращается с ним как с `rate_limited` и не показывает фразу о переборе. Разные ответы маршрута до человека на
этом пути не доходят.

**Impact.** Человек с защитной блокировкой видит обычный таймер повторной отправки вместо отличимого объяснения
перебора кода; исправление route mapping не закрыло поведение продукта на пациентском resend-path.

**Строка оракула.** `docs/_TODO/E5_EMAIL_AT_LOGIN_GROUND_2026-09-15.md:194-197`: повторная отправка кода — одна
из разрешённых дверей ограниченного email-gate; `AGENTS.md:2008-2017`: видимый текст ожидаемого отказа и
соответствие кода фразе принадлежат словарю, одинаковый смысл использует один ключ. Дополнительное прямое
требование authority brief, пункт 2: ранний повтор отправки и перебор кода должны быть различимы человеку.

## MUST FIX 3 — `authResendTooSoon` является близнецом существующего `authResendCooldown`

Комментарий нового ключа утверждает, что email-окно не равно минуте. Факты говорят обратное:

- `apps/webapp/src/modules/auth/otpConstants.ts:1-2` задаёт общий resend cooldown ровно `60` секунд;
- `apps/webapp/src/modules/auth/emailAuth.ts:321-339` использует этот cooldown для email challenge;
- DB-путь `20260823T043206_deliver_c4_mail_profile_tenant_binding.sql:109-113` проверяет ровно
  `interval '60 seconds'` и возвращает остаток от тех же 60 секунд.

`retryAfterSeconds` — не другое окно, а уменьшающийся остаток минутного окна. Оба ключа объясняют один и тот же
отказ одному и тому же следующему действию: новую отправку запросили раньше окончания минутного cooldown, надо
подождать и повторить отправку. Разница подробности формулировки не создаёт новый смысл. По полному тематическому
проходу словаря командой
`rg -n -i 'повторн|отправк|запрос|слишком част|подожд|попыт' apps/webapp/src/shared/notifications/notificationText.ts`
близнец найден именно в `notificationText.ts:294-295`.

**Impact.** Один продуктовый отказ снова имеет два независимо редактируемых ключа, а ложный комментарий закрепляет
расхождение. Правильная граница остаётся между resend cooldown и `authTooManyAttempts`; для минутного resend нужен
один существующий ключ, а не два.

**Строка оракула.** `AGENTS.md:2016-2017`: «Одинаковый смысл — ОДИН ключ на все экраны, а не второй ключ с тем
же текстом. Не подходит формулировка — правится ключ, для всех сразу».

## Что прошло

1. **Production-фраза лимита перенесена без потери смысла.** `git show d3bbddd58` подтверждает одинаковый шаблон
   до/после; `rg -n 'исчерпан лимит|quotaLimitReachedRefusalMessage\\(' apps/webapp/src` нашёл одну production-
   фабрику и два route-caller-а. `MECHANIC_REGISTRY.branches.label` по-прежнему равно «Филиалы». Отдельная проблема
   тестовой копии вынесена в MUST FIX 1.
2. **Маршрут различает коды.** `email/start/route.ts:78-85` действительно сопоставляет `rate_limited` и
   `too_many_attempts` разным фразам. Первичный patient-start и оба doctor-вызова сохраняют серверный `message`.
   Незакрытый patient-resend вынесен в MUST FIX 2.
3. **Гейт нешумный на законной правке словаря.** На исходном дереве команда
   `/home/dev/brain/host-orch/run-tests.sh "node apps/webapp/scripts/check-notification-text-coverage.mjs --self-test"`
   вернула `65 leak fixtures red`, `31 safe shapes green`, `12 targeted mutations green` и полный tree-check
   `OK`. Затем `commonUnknownValue: 'Неизвестно'` временно заменён законным словарным текстом «Значение
   неизвестно»; та же команда сохранила те же `65 / 31 / 12` и `OK`. Временная правка возвращена.
4. **Затронутые route-наборы зелёные на кандидате.** Команда
   `/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest --run --project=route src/app/api/auth/email/start/route.route.test.ts src/app/api/admin/booking-engine/branches/route.route.test.ts"`
   вернула `2 passed` файла и `4 passed` теста.
5. **Типы.** Команда `pnpm --dir apps/webapp run typecheck` (`tsc --noEmit`) завершилась `rc=0`.
6. **Owner default Э5.** Diff `d3bbddd58` меняет только фабрику/выбор текста; новых дверей к клиническим данным
   не добавляет и разрешённый набор до подтверждения email не расширяет.

## Границы аудита

Полный CI, DEV/TEST/PROD, миграции, БД и второй Next-сервер не запускались. Продуктовый код и тесты аудитор не
исправлял; все временные мутации возвращены. Вердикт в `feat` не записывался.

## Повторная независимая сверка точного кандидата

При повторном входе ветка уже находилась на более позднем `c2de91cf266fc132326c243a98bb1fdb961e6208`, поэтому
предмет аудита не подменялся текущим деревом: `d3bbddd586761c71b6538431af944c98a5dbf53e` был открыт detached,
проверен и оставлен без изменений, после чего рабочая ветка возвращена на исходный HEAD.

- `/home/dev/brain/host-orch/run-tests.sh "node apps/webapp/scripts/check-notification-text-coverage.mjs --self-test"`
  на исходном кандидате: `65 leak fixtures red`, `31 safe shapes green`, `12 targeted mutations green`,
  tree-check `OK`, `rc=0`.
- После временной законной замены `commonUnknownValue: 'Неизвестно'` на `Значение неизвестно` та же команда
  сохранила `65 / 31 / 12`, tree-check `OK`, `rc=0`; изменение возвращено.
- `/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest --run --project=route
  src/app/api/auth/email/start/route.route.test.ts
  src/app/api/admin/booking-engine/branches/route.route.test.ts"`: `2 passed` файла, `4 passed` теста.
- После временной смыслосохраняющей редакции только фабрики лимита на
  `Невозможно ${action}: лимит тарифа «${mechanicLabel}» исчерпан.` отдельный branches route-test дал
  `1 failed | 2 passed`: красным было только дословно ожидаемое поле `message`; изменение возвращено.
- `pnpm --dir apps/webapp run typecheck`: `tsc --noEmit`, `rc=0`.

Повторная трассировка подтвердила все три MUST FIX без новых находок: два production caller-а лимита сохраняют
те же `action` и `MECHANIC_REGISTRY.branches.label`; resend-путь `EmailAccountPanel` схлопывает любой HTTP 429 в
`rate_limited` до `OtpCodeForm`; `OTP_RESEND_COOLDOWN_SEC = 60` и DB-проверка `interval '60 seconds'` опровергают
комментарий нового ключа. DEV/TEST/PROD и миграции не затрагивались.

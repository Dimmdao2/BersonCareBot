PASS — 0 MUST FIX.

# Независимый адверсарный аудит правила текстов — круг 5

Дата: 2026-09-16
Кандидат: `c2de91cf266fc132326c243a98bb1fdb961e6208` в ветке
`wt/patient-support-single-door`
Authority: `docs/_TODO/E5_EMAIL_AT_LOGIN_GROUND_2026-09-15.md` §5 п.1,
`AGENTS.md` §10a, §10b и §21a, brief круга 5.

Текущий `HEAD` содержит два последующих документационных коммита, но предмет аудита не изменён:

```bash
git show -s --format='target %H %T' c2de91cf2
git show -s --format='head   %H %T' HEAD
```

Обе команды показали один tree `9c7db553f0467e401fb9145fa9be13a47df68723`; дополнительно команда

```bash
git diff --exit-code c2de91cf2 -- apps/webapp/src/app/api/admin/booking-engine/branches/route.route.test.ts apps/webapp/src/app/api/auth/email/start/route.ts apps/webapp/src/shared/notifications/notificationText.ts apps/webapp/src/shared/ui/patient/EmailAccountPanel.tsx apps/webapp/src/app/api/admin/booking-engine/branches/route.ts
```

завершилась `rc=0`.

До проверки пункты классифицированы как в brief: пп. 1 и 3 — взгляд + `rg`; п. 2 — взгляд на
полную цепочку ответа + прогон; п. 4 — тест существующего гейта по всему дереву. Новые тесты и
автоматизированные UI-тесты не создавались.

## 1. Лимит тарифа — PASS

Команда полного прохода по фабрике, обёртке, фразе и вызывающим:

```bash
rg -n "quotaLimitReachedRefusalMessage|entitlementQuotaLimitReached|исчерпан лимит|лимит.*исчерпан" apps/webapp/src
```

Результат: единственный шаблон фразы находится в
`shared/notifications/notificationText.ts` у
`notificationTextFactory.entitlementQuotaLimitReached`; `quotaLimitReachedRefusalMessage` передаёт в него
прежний `action` и `MECHANIC_REGISTRY[mechanic].label`. Production-caller-ы остались в двух ветках маршрутов
филиалов: «создать локацию» и «сохранить локацию». Для `branches` реестр по-прежнему даёт метку «Филиалы».
Второй production-шаблон того же смысла рядом не найден.

Видимый результат сохраняет прежний смысл: человеку называют невозможное действие, тарифный лимит и механику,
а не машинный код.

## 2. Два состояния почты доходят до человека раздельно — PASS

Сквозной взгляд подтвердил цепочку:

- `app/api/auth/email/start/route.ts`: `rate_limited` получает
  `notificationText.authResendCooldown`, `too_many_attempts` —
  `notificationText.authTooManyAttempts`; оба ответа сохраняют собственный машинный код и `message`;
- первичный вызов `EmailAccountPanel.startEmail` показывает серверный `data.message` в
  `emailStartError`;
- повтор из формы кода проверяет `too_many_attempts` до общей ветки HTTP 429 и возвращает
  `{ kind: 'error', message }`; `OtpCodeForm` кладёт эту фразу в `error` и рисует её под полем кода;
- только `rate_limited` превращается в `{ kind: 'rate_limited' }` и видимый countdown повторной отправки.

То есть защитная блокировка больше не схлопывается в обычный cooldown: человек видит
«Слишком много попыток. Подождите и повторите позже.», а ранний повтор — минутный countdown.

Затронутые route-наборы прогнаны командой:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest --run --project=route src/app/api/auth/email/start/route.route.test.ts src/app/api/admin/booking-engine/branches/route.route.test.ts"
```

Результат на восстановленном кандидате: `2 passed` файла, `4 passed` теста.

## 3. Три находки круга 4 закрыты — PASS

### 3.1. Близнец ключа удалён

```bash
rg -n "authResendTooSoon|authResendCooldown" apps/webapp/src
rg -n -i "подождите минут|повторной отправк|слишком частые запрос|перед повторн" apps/webapp/src/shared/notifications/notificationText.ts
```

`authResendTooSoon` отсутствует. Тематический проход по всему словарю нашёл один ключ минутного повтора —
`authResendCooldown: 'Подождите минуту перед повторной отправкой.'`. Это соответствует фактическому
60-секундному окну. `authTooManyAttempts` остаётся отдельным смыслом: исчерпаны попытки ввода, следующее действие
человека отличается от ранней повторной отправки.

### 3.2. Блокировка проверяется до общей ветки 429

`EmailAccountPanel.tsx` сначала разбирает `data.error === 'too_many_attempts'` и передаёт объяснение в
видимую ошибку `OtpCodeForm`; лишь следующая ветка обрабатывает `res.status === 429 ||
data.error === 'rate_limited'` как countdown. Найденный в круге 4 достижимый сценарий двух вкладок закрыт.

### 3.3. Route-тест не держит копирайт, но держит код и механику

Вместо дословного предложения expected вызывает
`quotaLimitReachedRefusalMessage('branches', 'создать локацию')`.

Для проверки нешумности фабрика временно и смыслосохраняюще редактировалась на
`Невозможно ${action}: лимит тарифа «${mechanicLabel}» исчерпан.`. Команда:

```bash
/home/dev/brain/host-orch/run-tests.sh "node apps/webapp/scripts/check-notification-text-coverage.mjs --self-test && pnpm --dir apps/webapp exec vitest --run --project=route src/app/api/admin/booking-engine/branches/route.route.test.ts"
```

осталась зелёной: гейт сохранил `65 / 31 / 12` и tree `OK`, route-файл — `3 passed`.

Затем отдельно внесены две целевые поломки в production-ответ и командой

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest --run --project=route src/app/api/admin/booking-engine/branches/route.route.test.ts"
```

доказаны зубы:

1. `error: 'branch_quota_reached'` → `error: 'quota_reached'` — `1 failed | 2 passed`, assertion показал
   подмену кода;
2. `mechanic: 'branches'` → `mechanic: 'files'` — `1 failed | 2 passed`, assertion показал подмену механики.

Все три временные правки возвращены до финального прогона.

## 4. Нешумность и самотест по всему дереву — PASS

Финальная команда на восстановленном дереве:

```bash
/home/dev/brain/host-orch/run-tests.sh "node apps/webapp/scripts/check-notification-text-coverage.mjs --self-test && pnpm --dir apps/webapp exec vitest --run --project=route src/app/api/auth/email/start/route.route.test.ts src/app/api/admin/booking-engine/branches/route.route.test.ts && pnpm --dir apps/webapp run typecheck"
```

Результат: `65 leak fixtures red`, `31 safe shapes green`, `12 targeted mutations green`;
полный tree-check — `notification text coverage: OK`; route-наборы — `2 passed` файла / `4 passed` теста;
`tsc --noEmit` — `rc=0`. Законная редактура фабрики дала тот же зелёный результат, поэтому ложного красного
сигнала на честном тексте нет.

## Границы аудита

Полный CI, DEV/TEST/PROD, миграции, БД и второй Next-сервер не запускались. Продуктовый код и тесты аудитор не
оставлял изменёнными; временные мутации возвращены. Строка вердикта в `feat` не записывалась.

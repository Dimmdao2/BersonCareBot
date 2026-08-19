# Operator alert env label (DEV/TEST/PROD) — 2026-08-20

## Источник оракула

Владелец, 20.08, дословно: «и вот какая проблема - я не вижу в почте никакой информации ОТКУДА идут ошибки.
Думаю для отладки и работы с ДЕВ / ТЕСТ / ПРОД нам надо как то это указывать в почте». Контекст: DEV, TEST и
PROD пишут в один почтовый ящик, и владелец не мог отличить их по письму (`«Очередь транскода HLS: error»`,
`«Самая старая неотправленная позиция: 18 ч»`, `«Уведомления с пустой аудиторией: всего 7»`).

## Что сделано

**Один новый чокпоинт**, а не разметка по местам вызова:
[`apps/webapp/src/modules/operator-alerts/operatorAlertEnvLabel.ts`](../../apps/webapp/src/modules/operator-alerts/operatorAlertEnvLabel.ts).

- `computeOperatorAlertEnvLabel({ appBaseUrl, override })` — чистая функция: хост из `APP_BASE_URL`
  (`127.0.0.1`/`localhost` → `DEV`, `test.bersoncare.ru` → `TEST`, `bersoncare.ru` → `PROD`), нераспознанный
  хост → `unknown(<хост>)` (никогда тихо не становится `PROD`), непарсящийся URL → `unknown(<то, что было
  передано>)`. Явный override (env `OPERATOR_ALERT_ENV_LABEL`) побеждает при непустом значении, но по умолчанию
  не задан — при отсутствующей переменной ничего не ломается, работает вывод из `APP_BASE_URL`.
- `resolveOperatorAlertEnvLabel()` — обвязка поверх чистой функции, читает `env.APP_BASE_URL` (см.
  `apps/webapp/src/config/env.ts`) и `process.env.OPERATOR_ALERT_ENV_LABEL`.
- `stampOperatorAlertSubject(subject)` — `[<МЕТКА>] <исходная тема>`; исходный текст темы после метки не
  меняется.

Подключено ровно в двух местах — тех самых, что названы в задаче:

1. **`dispatchOperatorAlert.ts`** (единый диспетчер TG/Max/SMS/email/staff web push) — `pushTitle` теперь
   стемпится один раз (`const pushTitle = stampOperatorAlertSubject(input.pushTitle ?? input.topic)`), а не в
   каждом канале отдельно. `pushTitle` — тот же самый идентификатор, что идёт и в `subject` email-канала
   (`fireOperatorRelay({ ..., subject: pushTitle })`), и в заголовок web-push (`sendAdminIncidentStaffWebPush`).
   Один edit закрыл оба канала без дублирования кода на каждом.
2. **`sendOperatorFallbackEmail.ts`** (fallback-путь пустой аудитории, design D-b) — независимый путь доставки
   email, стемпится отдельно: `stampOperatorAlertSubject(input.subject)` перед вызовом
   `adapter.sendTransactionalEmail`.

Telegram/Max/SMS не имеют понятия «тема письма» — у них весь текст один блок, который целиком уходит в
сообщение; в задаче явно просили метку именно в SUBJECT (владелец читает список писем на телефоне), поэтому в
их текст метка не добавлена. Она добавлена в заголовок web-push (см. п.1) — это тот канал из пункта 4 задания,
который «идёт через тот же чокпоинт».

## До / после (реальная тема письма)

Вход: `dispatchOperatorAlert({ block: 'critical', topic: 'hls_transcode_queue', pushTitle: 'Очередь
транскода HLS: error', ... })`, окружение TEST (`APP_BASE_URL=https://test.bersoncare.ru`).

- **До:** `Очередь транскода HLS: error`
- **После:** `[TEST] Очередь транскода HLS: error`

Fallback-путь, окружение PROD (`APP_BASE_URL=https://bersoncare.ru`):

- **До:** `BersonCare: некому доставить служебное уведомление`
- **После:** `[PROD] BersonCare: некому доставить служебное уведомление`

## Пункт 6 — apps/integrator

`apps/integrator/src/integrations/bersoncare/operatorAlertRelayRoute.ts` (`POST
/api/bersoncare/operator-alert-relay`) — это ЧИСТЫЙ приёмник-релей: он не формирует собственные операторские
алерты, а только переупаковывает то, что уже прислал webapp (`payload.metadata.subject` → `subject` исходящего
письма, дефолт `'BersonCare'` если `metadata.subject` не передан). Единственный вызывающий этот маршрут в
кодовой базе — `apps/webapp/src/modules/operator-alerts/relayOperatorAlert.ts`, который зовётся из
`dispatchOperatorAlert.ts`. Второго независимого пути операторских алертов в интеграторе НЕТ — метка
доходит до этого же ящика через уже покрытый чокпоинт, отдельно покрывать в интеграторе нечего.

## Тесты

- `apps/webapp/src/modules/operator-alerts/operatorAlertEnvLabel.unit.test.ts` — три известных хоста → три
  метки, нераспознанный хост → честный `unknown(<хост>)` (не «PROD» по умолчанию), override побеждает вывод,
  пустой/невалидный override не ломает вывод.
- `apps/webapp/src/modules/operator-alerts/dispatchOperatorAlert.envLabel.unit.test.ts` — реальный прогон
  `dispatchOperatorAlert` до релея: подтверждено, что `metadata.subject`, ушедший в `relayOperatorAlert`
  (email-канал), несёт `[TEST] ...`. **Красный доказан**: временный откат стемпинга в `dispatchOperatorAlert.ts`
  уронил именно этот тест (`AssertionError: expected 'Очередь транскода HLS: error' to be '[TEST] Очередь
  транскода HLS: error'`), после возврата фикса — тест снова зелёный.
- `apps/webapp/src/app-layer/operator-alerts/sendOperatorFallbackEmail.unit.test.ts` — независимый путь
  fallback-письма несёт `[PROD] ...`.

Команды:
```
cd apps/webapp
npx vitest run src/modules/operator-alerts/operatorAlertEnvLabel.unit.test.ts \
  src/modules/operator-alerts/dispatchOperatorAlert.envLabel.unit.test.ts \
  src/app-layer/operator-alerts/sendOperatorFallbackEmail.unit.test.ts
# → Test Files 3 passed (3), Tests 9 passed (9)

npx vitest run src/modules/operator-alerts src/app-layer/operator-alerts src/modules/admin-incidents src/app-layer/health
# → Test Files 8 passed (8), Tests 22 passed (22) — регресс не внесён

npx tsc --noEmit -p tsconfig.json   # чисто (после build workspace-пакетов, см. НЕ СДЕЛАНО)
npx eslint src/modules/operator-alerts/operatorAlertEnvLabel.ts \
  src/modules/operator-alerts/operatorAlertEnvLabel.unit.test.ts \
  src/modules/operator-alerts/dispatchOperatorAlert.ts \
  src/modules/operator-alerts/dispatchOperatorAlert.envLabel.unit.test.ts \
  src/app-layer/operator-alerts/sendOperatorFallbackEmail.ts \
  src/app-layer/operator-alerts/sendOperatorFallbackEmail.unit.test.ts
# → чисто
```

## Прод и деплой

- **PROD не тронут**: изменения — код + тесты, никакого подключения к живому серверу.
- **Новая env-переменная — `OPERATOR_ALERT_ENV_LABEL`.** Она НЕ добавлена ни в один deploy-скрипт и ни в один
  `.env.example`/prod-конфиг; это чисто опциональный override, и по умолчанию (переменная не задана нигде)
  метка выводится из уже существующего `APP_BASE_URL`, который на всех трёх окружениях уже задан
  (`docs/ARCHITECTURE/SERVER CONVENTIONS.md`: `APP_BASE_URL=https://bersoncare.ru` на проде,
  `test.bersoncare.ru` на TEST, `http://127.0.0.1:5200` на DEV). Ничего в проде включать/менять не нужно —
  письма из PROD немедленно после деплоя получат метку `[PROD]` без единой правки конфигурации.

## НЕ СДЕЛАНО

- **Живой прогон на TEST не сделан** — задача решена и проверена на уровне юнит-тестов до сетевого релея
  (`relayOperatorAlert`/`operatorAlertRelayRoute` замоканы); фактическое письмо на реальный TEST/integrator не
  отправлялось. Мотивация: боевая отправка — outward-facing действие, не входит в рамки «код + тесты» этой
  миссии без отдельного подтверждения.
- **Telegram/Max/SMS-текст метку не несёт** — у этих каналов нет понятия «тема», в задаче явно спрошена метка
  в SUBJECT; текстовое тело для них не трогали, чтобы не размывать одну содержательную правку в несколько мест.
  Если владелец хочет метку и в теле TG/Max/SMS-сообщений — это отдельное дополнение той же функции
  `stampOperatorAlertSubject`/новой обёртки над `text`, не сделанное сейчас.
- **`docs/ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md` не обновлён** записью про
  `OPERATOR_ALERT_ENV_LABEL` — переменная существует, но нигде не описана в каноне env-переменных. Мелкая
  доку-правка, не сделана в рамках этой сфокусированной миссии.


## Упрощение по указанию владельца (20.08, после сдачи)

Владелец: «мне достаточно хоста (test или prod) или DEV - уж эту метку в дев можно поставить? не усложнять
главное». Убрано два усложнения:

1. **Метки «неизвестно» больше нет.** Незнакомый хост подставляется как есть — сам хост и отвечает на вопрос
   «откуда письмо». Прежний вид `unknown(<host>)` был честным, но лишним.
2. **Отдельной env-переменной `OPERATOR_ALERT_ENV_LABEL` больше нет.** Одна переменная, о которой надо помнить
   при выкатке, — это ровно то, что забывают. Метка целиком выводится из `APP_BASE_URL`.

Итог: `bersoncare.ru → PROD`, `test.bersoncare.ru → TEST`, `127.0.0.1`/`localhost`/`0.0.0.0` → `DEV`, любой
другой хост → он сам, пустой адрес → `DEV` (так бывает только на локальной машине).

⛔ Инвариант, который держит тест: незнакомый хост НЕ становится `PROD`. Иначе оператор пойдёт чинить прод
из-за письма с чужого стенда.

# Аудит-2 `F4` — после правки, которая УДАЛИЛА гейт каналов в интеграторе

**Вердикт: `FAIL, NOT FOR LAND`.**

Блокирующих `2`, неблокирующих `4`. Инъекций посажено `6`: убито `4`, **не поймано `2`**.
Оставлен один падающий acceptance-тест (`deliveryChannelCallerGate.route.test.ts`) — фиксированный oracle
для блокера `B2-1`; продуктовый код я не правил (§24.6).

Проверялся `42fbd07d1` в дереве `c1111a542` (merge-коммит поверх, продуктовых изменений не несёт), клон
`/home/dev/dev-projects/bcb-wt-night-f4-20260823`, ветка `wt/night-f4-20260823`.
Всё ниже — свои замеры: собственный dev-сервер на `:5250` с тремя различимыми Host, собственный
listener-интегратор на `:4290` (пишет каждый входящий запрос), живая DEV-БД `bcb_webapp_dev`,
прогон отгруженных модулей маршрутов на `HEAD` и на родителе `21b8826e1`, собственные инъекции.
Из отчёта автора не взято ничего.

**Из круга 1 не перепроверялось** (доказано там): вход не изменился ни на одной поверхности, 27 строк равны
legacy в обеих таблицах, миграция детерминирована, изоляция поверхностей в вебаппе работает.

---

## Ответ на главный вопрос брифа

**Да, удаление гейта расширило то, что может сделать внешний вызывающий, и открыло два пути внутри
вебаппа, где перед доставкой не осталось ни одной проверки канала.**

Гейт интегратора был дубликатом решения **только для тех вызывающих, которые уже проверяют канал сами**.
Для двух путей вебаппа он дубликатом НЕ был — он был единственной проверкой, и теперь её нет.

Один и тот же подписанный запрос, при сегодняшних живых настройках DEV (`sms/telegram/max` выключены на
всех трёх поверхностях), на родителе и на HEAD:

| Маршрут | `21b8826e1` (до) | `c1111a542` (после) |
| --- | --- | --- |
| `POST /api/bersoncare/send-sms` | `403 auth_channel_disabled`, dispatch `0` | **`200 {"ok":true}`, dispatch `1`** |
| `POST /api/bersoncare/send-otp` (telegram) | `403 auth_channel_disabled`, dispatch `0` | **`200 {"ok":true}`, dispatch `1`** |
| `POST /api/bersoncare/request-contact` (telegram) | `403 auth_channel_disabled`, dispatch `0` | **`200 {"ok":true,"status":"accepted"}`** |

Прогон — отгруженные модули маршрутов (`registerBersoncareSendSmsRoute` / `SendOtp` / `RequestContact`)
в реальном Fastify, реальная HMAC-подпись, каждый в своём дереве коммита.
Значения каналов взяты живьём:

```
$ sudo -u postgres psql -d bcb_webapp_dev -c "select key, value_json from public.system_settings where key like 'auth%enabled'"
 auth_email_enabled    | {"value": true}
 auth_sms_enabled      | {"value": false}
 auth_telegram_enabled | {"value": false}
 auth_max_enabled      | {"value": false}
```

Интегратор **достижим снаружи хоста** — не гипотетически, замер:

```
$ curl -s -X POST https://test.bersoncare.ru/api/bersoncare/send-sms -H 'content-type: application/json' -d '{}'
{"ok":false,"error":"missing_headers"}          # это тело sendSmsRoute.ts:88, ответил интегратор
```

`deploy/host/apply-test-nginx-webapp.sh:167` проксирует `^/(health|internal|api/bersoncare|api/telegram)`
на `127.0.0.1:3300`. Дверь закрыта только IP-allowlist nginx (`allow 10.9.0.0/24`, `10.9.1.0/24`,
`172.17.0.0/16`, `151.241.228.122`, `127.0.0.1`; `deny all`) — прикладной проверки канала за ней больше нет,
осталась только HMAC. На PROD такой location'а нет (`deploy/nginx/bersoncarebot-webapp.vhost.template.conf`
проксирует только `/` на вебапп), Telegram работает long-polling'ом (`longPolling.ts`: «Never calls
setWebhook»), то есть на проде интегратор наружу не выставлен.

---

## Итог по пунктам брифа

| ID | Вердикт | Доказательство |
| --- | --- | --- |
| 1. Кто ещё зовёт четыре маршрута | **PASS** | 4 литеральных call-site, все в вебаппе; динамической сборки пути нет; ни бот, ни крон, ни deploy-скрипты не зовут — но интегратор проксируется наружу на TEST (замер выше) |
| 2. Что стоит перед доставкой после снятия гейта | **PASS** | HMAC (`401` на подписи/окне, `400` без заголовков), валидация (`400`), идемпотентность (`duplicate`, dispatch `1`), provider readiness (`resolveSmtpOutboundConfig`) — все живы, замер на отгруженных маршрутах |
| 3. Путь к четырём адаптерам мимо гейта вебаппа | **FAIL** | два маршрута доставки без проверки канала (`B2-1`), плюс ни один тест не защищает ни одну проверку на стороне вызывающего (`B2-2`) |
| 4. Отсутствующая/неизвестная поверхность закрывает способ | **PASS** (с оговоркой `N2-4`) | legacy-ключ `true` при surface-ключах `false` → `403`; неизвестный Host → `404`; отсутствующая/мусорная строка → `500` и `0` запросов к интегратору |
| 5. Живой сценарий `B-1` на трёх Host в обе стороны | **PASS** | ниже, раздел 3 |
| 6. Бьют ли новые тесты отгруженный путь | **PASS** | инъекция `I-1` (та самая, что круг 1 не поймал) теперь убита; тесты ездят по заголовку, а не по параметру |
| 7. Умолчания: одно объявление или два | **PASS** (два, но они больше не могут разойтись молча) | ниже, раздел 5 |

---

## 1. Блокеры

### `B2-1` (блокер). Два маршрута доставки доходят до `send-sms`, не спросив политику канала

Обход **всех** мест вызова гейта в вебаппе (`isAuthChannelEnabled` / `getAuthChannelPolicy` /
`getClientVisibleAuthChannelPolicy` / `isIndependentAuthMethodEnabled` / `isOAuthProviderEnabled`) даёт
~35 маршрутов. В этот список НЕ входят два, которые при этом доходят до интеграторского шва доставки:

1. **`POST /api/patient/diary/purge-otp/start`** →
   `deps.auth.startPhoneAuth(phone, ctx, { delivery: { channel: 'sms' } })` →
   `integratorSmsAdapter.sendCode` → `deliverSmsCodeViaIntegrator` → `POST /api/bersoncare/send-sms`.
   В файле маршрута нет ни одного упоминания политики каналов.
2. **`POST /api/booking/public/create`** (анонимный, без сессии) →
   `issuePublicBookingVerification` → `deps.publicBookingVerification.deliverCode` =
   `deliverSmsCodeViaIntegrator` (`buildAppDeps.ts:1549`) → `POST /api/bersoncare/send-sms`.
   Ни маршрут, ни модуль `publicBookingVerification.ts` политику не читают.

До `42fbd07d1` оба упирались в `403 auth_channel_disabled` интегратора (замерено выше). Сейчас — не
упираются ни во что: владелец выключил SMS во всех трёх блоках тумблеров, а SMS продолжает уходить.

Прочие пути проверены и **гейт проходят**: `/api/auth/phone/start` — в обеих ветках (явный канал —
`isAuthChannelEnabled`, автоматический публичный вход — `getClientVisibleAuthChannelPolicy`, и при
`automaticChannel == null` доставка подавляется `suppressDelivery`); `/api/patient/messenger/request-contact`
(при `target == null` до отправки не доходит, `400`); вся почтовая ветка (`startEmailChallenge`,
`emailOtpPublic`, `patient-invites`) — каждый её маршрут гейт зовёт.

**Oracle**: `apps/webapp/src/modules/auth/deliveryChannelCallerGate.route.test.ts` — красный на текущем
продукте (`2 failed`), зелёный, как только проверка появляется в обоих маршрутах (проверил временной
правкой, правку откатил). Продуктовый код я не менял.

### `B2-2` (блокер). Ни один тест репозитория не защищает ни одну проверку на стороне вызывающего

Правка перенесла решение из ОДНОГО места (четыре маршрута интегратора, одна функция, у которой был
собственный тест `authChannelPolicy.test.ts` — удалён этим же коммитом) в ~35 мест вызова в вебаппе.
Инъекция `I-5`: убрал гейт из `/api/auth/phone/start` — того маршрута, через который идёт публичный вход по
SMS/telegram/max/email.

```
Test Files  19 passed (19)
      Tests  100 passed (100)
```

Живая проверка того же дерева (SMS выключен на всех трёх поверхностях):

```
POST /api/auth/phone/start  Host: staff.local  -> 200 {"challengeId":"GPeMu7riEQiaAlC2-nHvBw"}
listener :4290 <- POST /api/bersoncare/send-sms {"phone":"+79991110041","code":"249695", ...}   # подписан
```

То есть удалить проверку канала с любого из ~35 маршрутов сейчас можно молча: набор останется зелёным, а
коды пойдут по выключенному способу. После отката инъекции тот же запрос снова даёт `403`, `0` запросов к
интегратору. Пока гейт стоял в интеграторе, это ловилось конструкцией; теперь не ловится ничем.

---

## 2. Что осталось перед доставкой (пункт 2) — свой замер на отгруженных маршрутах

| Проверка | Запрос | Ответ | dispatch |
| --- | --- | --- | --- |
| HMAC, неверная подпись | `x-bersoncare-signature: deadbeef` | `401 invalid_signature` | `0` |
| HMAC, окно 300 с | timestamp `-4000 c`, подпись валидна | `401 invalid_signature` | `0` |
| HMAC, нет заголовков | без `timestamp`/`signature` | `400 missing_headers` | `0` |
| Валидация тела | `{"phone":"+7999..."}` без `code`/`idempotencyKey` | `400 phone, code and idempotencyKey required` | `0` |
| Идемпотентность | тот же `idempotencyKey` дважды | `200 {"ok":true}` → `200 {"ok":true,"status":"duplicate"}` | `1` |
| Provider readiness | `send-email`, `resolveSmtpOutboundConfig` + `isResolvedMailerConfigured` | `503 email_not_configured` при неготовом провайдере | `0` |

Все четыре механизма живы. Живьём на TEST дополнительно подтверждены HMAC и валидация: публичный
`https://test.bersoncare.ru/api/bersoncare/send-sms` без заголовков отвечает `400 missing_headers` телом
самого маршрута.

---

## 3. Живой сценарий `B-1` (пункт 5) — три Host, обе стороны

Сервер `:5250`, `APP_BASE_URL=http://staff.local:5250`, `PATIENT_APP_ORIGIN=http://patient.local:5250`,
`INTEGRATOR_API_URL=http://127.0.0.1:4290` (мой listener). Метод — SMS: его доставка реально идёт через
интегратор. Запрос один и тот же, меняется только `Host`.

**Базовая линия** (SMS выключен везде): `staff` `403`, `patient` `403`, `platform_admin` `403`,
запросов к интегратору `0`.

**Включён `auth_surface_patient_sms_enabled = true`, остальные два `false`:**

| Host | Ответ вебаппа | Запрос к интегратору |
| --- | --- | --- |
| `staff.local:5250` | `403 auth_channel_disabled` | нет |
| `patient.local:5250` | **`200 {"challengeId":"1lQojdNw1Z8aSB2vOB3YVA","deliveryChannel":"sms"}`** | **`POST /api/bersoncare/send-sms`, подписан** |
| `admin.staff.local:5250` | `403 auth_channel_disabled` | нет |

**Зеркально, `auth_surface_staff_sms_enabled = true`, остальные два `false`:**

| Host | Ответ вебаппа | Запрос к интегратору |
| --- | --- | --- |
| `staff.local:5250` | **`200 {"challengeId":"9XPBr3jBQjf9dD8yBaU7Dg","deliveryChannel":"sms"}`** | **`POST /api/bersoncare/send-sms`, подписан** |
| `patient.local:5250` | `403 auth_channel_disabled` | нет |
| `admin.staff.local:5250` | `403 auth_channel_disabled` | нет |

Ровно один запрос к интегратору в каждом прогоне, ровно с той поверхности, где способ включён.
`B-1` в своей исходной формулировке («кнопка есть, код не приходит» / «вебапп закрыл, дверь интегратора
открыта») закрыт: второго источника правды больше нет.

---

## 4. Отсутствие legacy-фолбэка (пункт 4) — живьём

| Подстава | Ответ | Запросов к интегратору |
| --- | --- | --- |
| `auth_sms_enabled = true`, все `auth_surface_*_sms_enabled = false` | `403` на `staff` и на `patient` | `0` |
| `auth_surface_patient_sms_enabled = true`, `auth_sms_enabled = false` | `200` (раздел 3) | `1` |
| Неизвестный Host (`evil.example:5250`) | `404`, тело пустое — до маршрута не доходит | `0` |
| Без Host-соответствия (`127.0.0.1:5250`) | `404` | `0` |
| Строка surface-ключа **удалена** | `500` | `0` |
| Строка surface-ключа = `{"value":"yes"}` | `500` | `0` |

Решение принимает только новый ключ, в обе стороны. Отката к старому ключу и к «разрешено» нет ни в одном
из шести случаев. Оговорка по последним двум — `N2-4`.

DEV возвращён в исходное состояние: 74 строки (`system_settings` + `app_runtime_settings`, `auth%enabled`)
побайтно совпадают со снятым до работы бэкапом, `diff` пустой.

---

## 5. Умолчания (пункт 7)

Объявления по-прежнему **два** — 9 legacy-ключей и 27 surface-ключей, — но они больше не могут разойтись
молча: автор выровнял legacy под матрицу `F1` и закрепил равенство тестом (инъекция `I-4` его убивает).

Снятая программно таблица всех 36 объявленных умолчаний: `email` и `passkey` — `true`, остальные семь
контролей — `false`, одинаково на всех трёх поверхностях, и surface-умолчания совпадают с
`defaultSurfaceAuthControlEnabled` (матрица `F1`) во всех 27 ячейках.

Живой DEV: `auth_email_enabled=true`, `auth_passkey_enabled=true`, остальные семь `false`.
**Свежесобранная среда получила бы тот же набор способов входа, что и работающая.** `N-5` круга 1 закрыт по
существу.

---

## 6. Неблокирующее

### `N2-1`. HMAC на `send-sms` — теперь единственная дверь, и её не проверяет ни один тест

Инъекция `I-6`: `verifySignature` в `sendSmsRoute.ts` заменена на `return true`.

```
Test Files  14 passed (14)
      Tests  68 passed (68)
```

Обход: `sendSmsRoute.route.test.ts` не существует вовсе; `invalid_signature` утверждает ровно один файл во
всём интеграторе — `relayOutboundRoute.route.test.ts`, к `send-sms` отношения не имеющий. Пока перед
доставкой стоял ещё и гейт канала, отсутствие теста на подпись стоило дешевле; после правки HMAC — последнее,
что отделяет публично проксируемый на TEST маршрут от реальной отправки.

### `N2-2`. Комментарий в `sendEmailRoute.ts` обещает гарантию, которой больше нет

`sendEmailRoute.ts:154`: «Provider readiness follows policy so a disabled channel cannot probe provider
state». Политики в этом файле нет с `42fbd07d1`; `isAuthCode` вычисляется, но на доступ уже не влияет.
Строка читается как действующее правило и вводит в заблуждение следующего, кто сюда придёт.

### `N2-3`. Вместе с гейтом маршрутов удалён гейт `user.phone.link` в `writePort` — замены нет, достижимость не доказана

Тот же коммит вырезал `authChannelPolicy` из `apps/integrator/src/infra/db/writePort.ts` (ветка
`user.phone.link`) и причину отказа `'auth_channel_disabled'` из `PhoneLinkFailureReason`. Это НЕ один из
четырёх маршрутов: действие исполняется внутри событийного конвейера интегратора
(`executeAction.ts:886`, `resource: ctx.event.meta.source` — бот telegram/max), вебапп в этом пути
отсутствует, то есть заменяющей проверки не появилось нигде. Соседние вебапп-маршруты того же продуктового
решения (`/api/integrator/messenger-phone/bind`, `/api/integrator/phone-messenger-bind/{claim,complete}`,
`/api/integrator/channel-link/complete`) гейт по-прежнему зовут — продукт стал отвечать на один вопрос
по-разному в зависимости от точки входа.

**Почему не блокер:** производителя действия `user.phone.link` в репозитории я не нашёл (обход по `*.ts`,
`*.json`, `*.sql`: только `case` исполнителя, тип, write-порт и e2e-харнесс), а комментарий D25
(`executeAction.ts:460`) утверждает, что гейтованный вебапп-маршрут `phone-messenger-bind/complete` сам
делает канонический write и никогда не просит интегратор вызвать `user.phone.link`. Сценарии живут в БД, в
DEV-БД таблицы сценариев нет — доказать или опровергнуть достижимость я не смог. Утверждение автора «вебапп
— единственный клиент» для этого места неверно; решение, оставлять ли его без гейта, — за ведущим.

### `N2-4`. Отсутствующая или испорченная строка surface-ключа даёт `500`, а не отказ

Замер выше: удалённая строка и `{"value":"yes"}` дают `500` на `/api/auth/phone/start` при `0` запросов к
интегратору. По доставке это fail-closed, но экран входа при этом не «закрывает способ», а падает
(`RuntimeSettingUnavailableError`). Класс известен с круга 1 (`N-4`: выражение `BCB-MIGRATION-VERIFY` не
исполняется ничем, и неполная миграция рапортует успех). Правкой `42fbd07d1` не тронут, в объём этого круга
не входит — повторяю как подтверждённый замер, а не как новую находку.

---

## 7. Инъекции

Набор-оракул вебаппа: 19 файлов, импортирующих политику каналов, `100 passed` на чистом дереве.
Набор интегратора: 13 файлов `src/integrations/bersoncare/*.test.ts`, `68 passed`.

| # | Класс | Что посажено | Результат |
| --- | --- | --- | --- |
| `I-1` | surface fall-through | `authPolicyNameForRequestSurface` всегда `'staff'` (разделение поверхностей вырезано) | **убита**, `2` красных (`publicAuthPolicy.unit`, `email-otp/start.route`) |
| `I-2` | surface → «разрешено» | `getSurfaceAwareToggle`: `if (!surface) return true` | **убита**, `1` красный |
| `I-3` | legacy-фолбэк | `if (!surface)` читает `auth_<control>_enabled` | **убита**, `1` красный |
| `I-4` | расхождение умолчаний | `auth_passkey_enabled` в реестре снова `false` | **убита**, `1` красный |
| `I-5` | доставка мимо гейта вызывающего | гейт удалён из `/api/auth/phone/start` | **НЕ ПОЙМАНА** — `100/100` зелёных; живьём SMS ушла при выключенном канале |
| `I-6` | маршрут интегратора без вебаппа | `verifySignature` в `send-sms` → `return true` | **НЕ ПОЙМАНА** — `68/68` зелёных |

Посажено `6`, убито `4`, не поймано `2`. Все инъекции откачены, каждая проверена `git diff --quiet`.

`I-1` — ровно та, что круг 1 не поймал (`N-3`). Теперь ловится: новые тесты автора мокают `next/headers` и
ездят по разрешённому заголовку `x-bc-resolved-surface`, а не по параметру. **Пункт 6 брифа — `PASS`.**

---

## 8. Что НЕ сделано

- **Full CI не гонялся** — по брифу это работа ведущего. Прогнаны точечные наборы: вебапп `19+1` файл
  (`100 passed` + `2 failed` мои acceptance), интегратор `13` файлов (`68 passed`), `tsc --noEmit` по вебаппу
  (`exit 0`), `eslint` по добавленному файлу.
- **`next build` не собирался** — тот же неопровергнутый участок, что и в круге 1.
- **Сквозной живой прогон `POST /api/booking/public/create` до самой отправки** не делался: в DEV-БД нет
  подходящей связки «слот + филиал + услуга». Путь доказан обходом графа вызовов и красным acceptance-тестом,
  доходящим до самого шва доставки (`deliverCode` вызван при выключенном SMS).
- **Достижимость `user.phone.link`** не доказана и не опровергнута (`N2-3`) — сценарии хранятся в БД,
  в DEV их нет.
- **`B-2`, `N-4`, `N-6`, `N-7`** — развилки владельца, выведены из объёма. Чужой дефект
  `pre-session exact gate` не трогался, `feat/doctor-ui-rebuild` не трогалась.

## 9. Следы аудита

DEV возвращён побайтно (74 строки, `diff` пустой). Свой dev-сервер `:5250` и listener `:4290` погашены;
чужие `:5200`, `:5210`, `:4200`, `:3300`, `:6300` не трогались. Временное дерево родительского коммита
удалено (`git worktree remove`). Продуктовый код не изменён ни на байт: в `git status` только этот отчёт и
один добавленный тест-файл.

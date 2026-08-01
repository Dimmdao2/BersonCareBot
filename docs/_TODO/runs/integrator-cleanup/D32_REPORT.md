# D32 — неподдержанный тип сообщения получает ответ, а не тишину

## Главный вывод: продукт уже делает то, что просит решение владельца — молчания нет

Проверил `apps/integrator/src/kernel/domain/executor/handlers/supportRelay.ts` (обработчики
`handleConversationUserMessage` — пациент→админ, `handleConversationAdminReply` — админ→пациент) до
любых правок: обе стороны **уже** проверяют белый список типов (`deps.supportRelayPolicy`) и при отказе
**отправляют ответ отправителю**, а не молчат. Пересылка при этом не происходит (`return` до записи
`conversation.message.add` / `question.message.add` и до intent'а пересылки).

`git blame` показал, что этот код — не черновик и не мёртвый путь: ветка отказа с ответом (не тишиной)
существует с 2026-03-18 (`24d602b3ff`), а обработчики зарегистрированы в диспетчере действий
(`apps/integrator/src/kernel/domain/executor/executeAction.ts:1529-1534`, `case 'conversation.user.message'`
/ `case 'conversation.admin.reply'`) и политика реально подключена в DI
(`apps/integrator/src/app/di.ts:61,272` — `defaultSupportRelayPolicy`). Формулировка брифа «сегодня белые
списки роняют сообщение молча» на текущий код не распространяется — либо описывала более раннее
состояние, либо ошиблась в предпосылке. Решение владельца («можно ответить, что пока не поддерживается»)
уже реализовано.

Что реально отсутствовало и было единственным пробелом гейта приёмки — **тесты**, фиксирующие это
поведение: `grep` по `apps/integrator/src` не нашёл ни одного теста на `UNSUPPORTED_TYPE`,
`RELAY_UNSUPPORTED_ADMIN`, `isAllowedUserToAdmin`/`isAllowedAdminToUser`. Без теста это поведение могло
быть случайно сломано любой последующей правкой без сигнала. Работа этого прогона — закрыть именно этот
пробел.

## Что изменено

**Только один файл, только тесты** — продуктовый код не тронут (гейт «продуктовый код правим только в
части ответа на неподдержанный тип» соблюдён буквально: правок продуктового кода не потребовалось, значит
и границу править нечем):

- `apps/integrator/src/kernel/domain/executor/handlers/supportRelay.d3.test.ts` — добавлен блок
  `describe('D32 unsupported message type gets a reply, not silence', …)`, 4 теста (+212 строк).
  - `user->admin: unsupported type replies to the sender and is not forwarded`
  - `user->admin: supported type is forwarded and gets no unsupported-type reply`
  - `admin->user: unsupported type replies to the admin and is not forwarded`
  - `admin->user: supported type is forwarded and gets no unsupported-type reply`

Проверяемый продуктовый код (не менялся, только прочитан и покрыт тестами):

- `apps/integrator/src/kernel/domain/executor/handlers/supportRelay.ts:260-285` — пациент→админ, ветка
  отказа с ответом (`RELAY_USER.UNSUPPORTED_TYPE`).
- `apps/integrator/src/kernel/domain/executor/handlers/supportRelay.ts:531-555` — админ→пациент, ветка
  отказа с ответом (`ADMIN.RELAY_UNSUPPORTED_ADMIN`).

## Тексты — где лежат

Оба текста уже в контенте, не в исходниках (соответствует правилу D21/D13b):

- `apps/integrator/src/content/telegram/user/templates.json:93` — ключ `relay.unsupportedType`:
  «этот вид сообщений не поддерживается. Напишите ваш вопрос текстом.»
- `apps/integrator/src/content/telegram/admin/templates.json:23` — ключ `admin.relay.unsupportedType`:
  «Такой тип сообщения нельзя переслать пользователю. Используйте текст, фото или документ.»
- Ключи зарегистрированы в `apps/integrator/src/kernel/domain/executor/templateKeys.ts:21,25`
  (`ADMIN.RELAY_UNSUPPORTED_ADMIN`, `RELAY_USER.UNSUPPORTED_TYPE`).

Есть нюанс с каналом MAX — см. «Развилки».

## Доказательство поломкой — для каждого из 4 тестов

Для каждого теста: внёс правку в `supportRelay.ts` руками, прогнал только
`supportRelay.d3.test.ts`, зафиксировал красный вывод, вернул файл к исходному (`git diff --stat`
после возврата — пусто, продуктовый код не менялся).

### 1. `user->admin: unsupported type replies to the sender and is not forwarded`

Поломка: заменил ветку отказа на тихий скип (`return { status: 'skipped', error: 'UNSUPPORTED_TYPE_BREAK_TEST' }`
перед построением ответа) — эмуляция «роняем молча».

```
✗ user->admin: unsupported type replies to the sender and is not forwarded
  AssertionError: expected 'skipped' to be 'success'
```

Остальные 5 тестов файла остались зелёными — поломка бьёт точно по цели.

### 2. `user->admin: supported type is forwarded and gets no unsupported-type reply`

Поломка: инвертировал условие (`!policy.isAllowedUserToAdmin` → `policy.isAllowedUserToAdmin`) — теперь
поддерживаемый тип ошибочно попадает в ветку отказа вместо пересылки.

```
✗ user->admin: unsupported type replies to the sender and is not forwarded
  Error: unexpected read: platformUser.idByChannelBinding
✗ user->admin: supported type is forwarded and gets no unsupported-type reply
  AssertionError: expected [] to include 'conversation.message.add'
```

(Эта правка одновременно калечит оба направления проверки для пациент→админ — оба теста на этот
хэндлер закономерно покраснели; первый упал на неожиданном чтении, потому что путь выполнения ушёл в
обычную пересылку без нужного мока, что тоже корректно доказывает поломку.)

### 3. `admin->user: unsupported type replies to the admin and is not forwarded`

Поломка: тихий скип в admin-ветке (`return { status: 'skipped', error: 'UNSUPPORTED_TYPE_BREAK_TEST' }`).

```
✗ admin->user: unsupported type replies to the admin and is not forwarded
  AssertionError: expected 'skipped' to be 'success'
```

Остальные 5 тестов — зелёные.

### 4. `admin->user: supported type is forwarded and gets no unsupported-type reply`

Поломка: инвертировал условие в admin-ветке.

```
✗ admin->user: unsupported type replies to the admin and is not forwarded
  Error: unexpected read: question.byConversationId
✗ admin->user: supported type is forwarded and gets no unsupported-type reply
  AssertionError: expected [] to include 'conversation.message.add'
```

После каждой проверки файл возвращён к оригиналу (`cp` из бэкапа), сверено `git diff --stat` — пусто.

## Полный прогон интегратора — числа до/после

- **До** (`npx vitest --run` в `apps/integrator`, чистое дерево): `Test Files 23 passed | 3 skipped (26)`,
  `Tests 154 passed | 9 skipped (163)`. Совпадает с числом из брифа (154).
- **После** (с добавленными тестами, продуктовый код не тронут):
  `Test Files 23 passed | 3 skipped (26)`, `Tests 158 passed | 9 skipped (167)`.
  +4 теста, 0 падений, 0 новых skip.
- `npx tsc --noEmit` — чисто. `npx eslint src/kernel/domain/executor/handlers/supportRelay.d3.test.ts` —
  чисто.

## Развилки — владельцу

1. **Бриф был основан на устаревшей/неверной предпосылке.** Поведение «ответ вместо тишины» в коде уже
   год как реализовано (`24d602b3ff`, 2026-03-18) и подключено в DI. Стоит ли считать пункт D32 закрытым
   этим прогоном (тесты добавлены, гейт формально выполнен) или нужен отдельный процесс, почему бриф
   разошёлся с реальным состоянием кода — решать владельцу, сам не стал чинить процесс, а зафиксировал факт.
2. **MAX: фолбэк-тексты остаются захардкожены в коде, а не в контенте.**
   `getUnsupportedUserRelayText`/`getUnsupportedAdminRelayText` (`supportRelay.ts:175-187`) для
   `source === 'max'` **всегда** возвращают русский текст из исходника и **никогда** не идут через
   `templatePort`/контент — даже несмотря на то, что `content/max/user/templates.json` и
   `content/max/admin/templates.json` существуют и обслуживают другие тексты для MAX. Это не новая
   поломка этого прогона (код такой с марта), но раз в задаче явно сказано «тексты — в контент, не в
   исходники», указываю: для Telegram это правило выполнено, для MAX — нет. В область этого прогона (по
   границам брифа — «продуктовый код правим только в части ответа на неподдержанный тип», а не рефакторим
   MAX-контент) не входит; если владелец хочет закрыть и это — отдельная маленькая задача (завести ключи
   в `content/max/*/templates.json`, убрать спецкейс `source === 'max'` в двух функциях).
3. **Админ-сторона: белый список уже покрывает все 11 известных типов.** `DEFAULT_ALLOWED_ADMIN_TO_USER`
   (`apps/integrator/src/config/appSettings.ts:27-39`) включает все 11 значений
   `SUPPORT_RELAY_MESSAGE_TYPES` — то есть под дефолтным конфигом ветка отказа для админа срабатывает
   только на типы **вне** самого enum'а (например `poll`/`dice`, которых Telegram-интеграция вообще не
   мапит в `relayMessageType`), а не на «голосовые» и т.п., как для пациента (белый список которого — 3
   типа из 11). Механизм при этом полностью симметричен и работает (тесты 3 и 4 это доказывают на
   искусственно суженной политике) — уместность ответа для админ-стороны не решал молча, просто фиксирую,
   что при текущих дефолтах она почти никогда не срабатывает на практике.

## Чего не смог / не делал

- Не расширял белый список типов (голосовые не поддержаны) — вне области по прямому запрету брифа.
- Не трогал продуктовый код — он уже соответствовал требованию, любая правка была бы untracked scope creep.
- Не чинил несоответствие MAX (см. «Развилки» п.2) — вне заявленной границы прогона.

FAIL — 2 MUST FIX

Проверен exact candidate `b5fb53a03` поверх `a46599fe2`, `6ba50076a`, `a620e866d` в ветке
`wt/patient-support-single-door`. Источник продуктового оракула:
`docs/_TODO/E5_EMAIL_AT_LOGIN_GROUND_2026-09-15.md` §5 п.1 — «разрешены лишь экран привязки,
повторная отправка кода, поддержка и выход; клинические данные до завершения не показываются».
Для текстового гейта действует `AGENTS.md` §21a.

Число MUST FIX получено двумя независимыми проверками ниже: реальная route-инъекция выявила шесть
молча пропущенных пользовательских форм, объединённых одним корневым finding №1; отдельная мутация
self-test подтвердила finding №2. Команды:

```bash
/home/dev/brain/host-orch/run-tests.sh "cd /home/dev/dev-projects/bcb-wt-latin-ban/apps/webapp && node scripts/check-notification-text-coverage.mjs"
/home/dev/brain/host-orch/run-tests.sh "cd /home/dev/dev-projects/bcb-wt-latin-ban/apps/webapp && node scripts/check-notification-text-coverage.mjs --self-test --self-test-only"
```

## MUST FIX 1 — G4b по-прежнему зависит от формы записи

**Оракул:** пункт 1 брифа — «G4b ловит фразу в любой форме записи»; `AGENTS.md` §21a — «Любой
текст, который увидит человек по известному, ожидаемому коду отказа или события, берётся из
`notificationText.ts`».

Достижимый сценарий: автор route выносит inline-фразу в локальную константу, собирает её штатными
операциями JavaScript либо вызывает соседнюю фабрику; значение реально попадает в
`NextResponse.json({ message })`, но lint остаётся зелёным. Копия живёт вне словаря, расходится при
следующей редактуре и нарушает §21a. Это не hypothetical hardening: все варианты были одновременно
внесены во временный реальный route
`apps/webapp/src/app/api/__audit-g4b/route.ts`; импортированная фабрика находилась в соседнем `.ts`.

Результат команды выше: гейт сообщил только одну находку — вложенный тернарник в подстановке.
Остальные пользовательские ответы прошли молча:

| Форма пользовательского `message` | Результат |
| --- | --- |
| function-scoped `const local = \`Введите текст сообщения до ${LIMIT} символов\`` → `message: local` | прошло молча — MUST FIX 1 |
| `'Введите текст сообщения'.concat(\` до ${LIMIT} символов\`)` | прошло молча — MUST FIX 1 |
| `['Введите', 'текст сообщения', \`до ${LIMIT} символов\`].join(' ')` | прошло молча — MUST FIX 1 |
| объект со статическим шаблоном → `message: MESSAGE_BY_KEY[MESSAGE_KEY]` | прошло молча — MUST FIX 1 |
| локальная `wrappedUserMessage(LIMIT)`, возвращающая inline-шаблон | прошло молча — MUST FIX 1 |
| импортированная `importedUserMessage(LIMIT)`, возвращающая inline-шаблон | прошло молча — MUST FIX 1 |
| ``message: `...${mode ? 'Введите текст сообщения' : 'Укажите текст обращения'} до ${LIMIT} символов` `` | покраснело — хорошо |

Вывод гейта для этой инъекции:

```text
notification text coverage: 1 call site(s) carry an inline string instead of notificationText
src/app/api/__audit-g4b/route.ts:34: template sentence in a NextResponse.json/Response.json "message" property
```

Все временные route-файлы удалены.

## MUST FIX 2 — новый красный self-test может остаться красным не по причине G4b

**Оракул:** пункт 5 брифа — «Самотест правила — не подделка… красные образцы краснеют ИМЕННО по
проверяемой причине, а не по любой»; `AGENTS.md` §10b — «целевая мутация/fault injection обязательна
один раз на каждый независимый класс поломки».

Образец `G4b: шаблон-предложение внутри тернарника` содержит две независимые причины падения:
проверяемый шаблон в `whenTrue` и строковый литерал `'x'` в `whenFalse`, который ловит старое правило
G4. Временная мутация заменила только проверяемый шаблон на безопасный
`notificationText.someKey`, оставив посторонний `'x'`:

```ts
message: ru ? notificationText.someKey : 'x'
```

Команда self-test из начала отчёта осталась зелёной и по-прежнему напечатала:

```text
notification text coverage self-test: OK (58 leak fixtures red, 30 safe shapes green)
```

Следовательно этот образец не доказывает обход тернарника: реализацию G4b для conditional можно
сломать, а счётчик останется зелёным из-за G4. Временная мутация откатена.

## Проверки без findings

### Шум — PASS

**Оракул:** пункт 2 брифа — законные формы должны оставаться зелёными.

Во временном route одновременно проверены технический `console.error` с длинным шаблоном,
двухсловная пользовательская динамика ``message: `Укажите ${missing.join(', ')}.` `` и шаблон
вокруг `notificationText.commonGenericError`. Команда:

```bash
/home/dev/brain/host-orch/run-tests.sh "cd /home/dev/dev-projects/bcb-wt-latin-ban/apps/webapp && node scripts/check-notification-text-coverage.mjs"
```

Результат: `notification text coverage: OK`. Базовый прогон чистого дерева той же командой также
`OK`; законных живых строк обобщение не покраснило.

### Живая утечка `clinic-delivery-test` — PASS

**Оракул:** `AGENTS.md` §21a — «Одинаковый смысл — ОДИН ключ на все экраны, а не второй ключ с тем
же текстом».

Diff показывает буквальный перенос прежней фразы в
`notificationText.settingsDeliveryTestNoMessenger(messenger)` без изменения смысла: «У вашей
учётной записи не подключён {Telegram|MAX} для проверки». Поиск по коду и смысловой поиск нашли
один ключ и один call site; близнеца того же смысла нет:

```bash
node /home/dev/brain/tools/code-search.mjs "employee recipient missing telegram max delivery test no messenger account connected" --repo bcb -k 20
rg -n "У вашей учётной записи не подключён|settingsDeliveryTestNoMessenger|employee_recipient_missing" apps/webapp/src docs/_TODO/NOTIFICATION_TEXT_CONSOLIDATION_2026-09-13.md
```

### Снятый email-ключ — PASS

**Оракул:** `AGENTS.md` §21a — «Одинаковый смысл — ОДИН ключ на все экраны».

В production-коде мёртвых ссылок на `authEmailAlreadyUsedByAnotherAccount` нет. Старое имя осталось
только в историческом отчёте первого круга, где оно и описывает прежнее состояние. Проверены exact
identifier, смысловой индекс и обратные ссылки в `notificationText.ts`/`errorCodeText.ts`:

```bash
node /home/dev/brain/tools/code-search.mjs "authEmailAlreadyUsedByAnotherAccount" --repo bcb -k 20
rg -n "authEmailAlreadyUsedByAnotherAccount" . || true
rg -n "authEmailBelongsToAnotherAccount" apps/webapp/src/shared/notifications apps/webapp/src/app/api
```

Patient email-change теперь использует тот же `authEmailBelongsToAnotherAccount`, что общая карта и
два email-confirm route. Смысл конфликта не изменён; общий текст дополнительно сохраняет полезный
следующий шаг «Укажите другой», уже восстановленный предыдущим owner-проходом.

Затронутые route-наборы и TypeScript прошли:

```bash
/home/dev/brain/host-orch/run-tests.sh "cd /home/dev/dev-projects/bcb-wt-latin-ban/apps/webapp && pnpm exec vitest run --project route src/app/api/admin/clinic-delivery-test/route.route.test.ts src/app/api/auth/email-otp/confirm/route.route.test.ts src/app/api/doctor/clients/route.route.test.ts"
/home/dev/brain/host-orch/run-tests.sh "cd /home/dev/dev-projects/bcb-wt-latin-ban && pnpm --dir apps/webapp run typecheck"
```

Результат первой команды: `3 passed` test files, `14 passed` tests. Вторая команда: `tsc --noEmit`,
exit 0.

## НЕ ДЕЛАЛОСЬ

- Продуктовый код не исправлялся: это независимый audit gate.
- Полный CI не запускался.
- Миграции и живая БД не затрагивались; DEV/TEST/PROD не трогались.
- Второй Next-сервер не поднимался.
- Временные инъекции удалены.

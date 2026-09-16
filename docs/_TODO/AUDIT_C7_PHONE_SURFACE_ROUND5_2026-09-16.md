PASS — 0 MUST FIX

# Независимый адверсарный аудит C7, круг 5

Кандидат: `200b34009` поверх `276448209` и audit-artifact круга 4 `a8f290098`.
Предмет закрывающего круга — только снятие самооракульного positive-ожидания в
`phoneStartFallback.route.test.ts`; продуктовый код кандидат не меняет.

## Оракул и классификация до проверки

Источник: `docs/_TODO/STAFF_DOORS_HARDCODED_2026-09-16.md:70-76`:

> «вход по номеру идёт именно автоматической веткой - вырезать все подобное, это старое. Сейчас
> вход по номеру только по коду после подтверждения контактов в мессенджере»

1. Снятое ожидание — качество теста: **ВЗГЛЯД** на `git show 200b34009` и фильтр §10a.
2. Сохранность отказов — повторяемое поведение: **ТЕСТ** и пять целевых инъекций.
3. Живая привязка номера — wiring глазами плюс существующие route/unit-наборы; автоматический UI-тест
   запрещён §10a.
4. Граница кандидата — `git diff`, TypeScript, ESLint и затронутые наборы.

## 1. Удаление честное

`git show 200b34009 -- apps/webapp/src/modules/auth/phoneStartFallback.route.test.ts` показывает ровно:

- удалён один test-case `keeps profile binding confirmation available for a profile-bind challenge`;
- комментарий над матрицей приведён в соответствие §10a: direct
  `phone/start → phone/confirm` не имеет продуктового клиента и не обещан owner-строкой C7;
- ни один отказ и ни одна проверка порядка двери не удалены.

Команда

```bash
git diff --name-status 200b34009^..200b34009
```

дала единственную строку:

```text
M apps/webapp/src/modules/auth/phoneStartFallback.route.test.ts
```

Оставшиеся девять тестов по-прежнему проверяют: surface-gate до parse/identity lookup; запрет явного
`purpose=login`; запрет отсутствующего purpose; те же отказы на `staff`, `platform_admin` и branded
patient; session-door до `findByPhone`; запрет non-profile challenge в `phone/confirm`.

Снятый test-case был вредным по §10a. Его `200` был скопирован из compatibility-реализации, а не из
независимого продуктового oracle; честное удаление неиспользуемого direct confirm требовало бы править этот
expected. Конечный живой результат привязки он не видел, потому что не вызывал ни один из
`phone/messenger-bind/{start,status,finish}`.

## 2. Fault injection оставшихся девяти тестов

Базовый committed-набор запускался командой:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/modules/auth/phoneStartFallback.route.test.ts"
```

Результат до инъекций: `1 passed` файл, `9 passed (9)` тестов.

Каждая инъекция ниже отдельно вносилась в production-route, затем той же командой запускались только
оставшиеся девять тестов и изменение полностью откатывалось до следующей инъекции.

| ID | Целевая поломка | Красный результат |
|---|---|---|
| I1 | снять surface-gate `phone_bot` в `phone/start` | `3 failed, 6 passed`: пустое тело на закрытой поверхности, `staff`, `platform_admin` |
| I2 | разрешить явный `purpose=login`, оставив omitted закрытым | `2 failed, 7 passed`: default и branded explicit-login |
| I3 | разрешить отсутствующий purpose, оставив явный `login` закрытым | `2 failed, 7 passed`: default и branded omitted-purpose |
| I4 | поднять `findByPhone` выше session-door | `1 failed, 8 passed`: anonymous profile-bind увидел identity lookup |
| I5 | пропустить non-profile challenge через `phone/confirm` | `1 failed, 8 passed`: legacy login challenge вернул `200` вместо `403` |

Итог по каталогу: **убито 5 из 5 классов поломок, непойманного 0**. Временных изменений production-кода
не осталось: `git diff -- apps/webapp/src/app/api/auth/phone/start/route.ts
apps/webapp/src/app/api/auth/phone/confirm/route.ts` не вывел ничего.

## 3. Живая привязка номера не зависела от снятого ожидания

Взгляд на текущий wiring подтвердил единственную продуктовую цепочку:

- `PatientBindPhoneBrowser.tsx:26-40` передаёт `purpose="profile_bind"` в `PhoneMessengerAuthFlow`;
- `PhoneMessengerAuthFlow.tsx:246-262` после номера открывает messenger picker и вызывает только
  `phone/messenger-bind/start`;
- `PhoneMessengerAuthFlow.tsx:142-162` опрашивает `phone/messenger-bind/status`, затем вызывает finish;
- `PhoneMessengerAuthFlow.tsx:91-128` завершает profile bind через
  `phone/messenger-bind/finish` и `onProfileComplete`;
- direct `phone/confirm` в этой цепочке не вызывается.

Команда

```bash
git diff --name-only 200b34009^..200b34009 -- \
  apps/webapp/src/app/app/patient/bind-phone/PatientBindPhoneBrowser.tsx \
  apps/webapp/src/shared/ui/patient/auth/PhoneMessengerAuthFlow.tsx \
  apps/webapp/src/app/api/auth/phone/messenger-bind/start/route.ts \
  apps/webapp/src/app/api/auth/phone/messenger-bind/status/route.ts \
  apps/webapp/src/app/api/auth/phone/messenger-bind/finish/route.ts \
  apps/webapp/src/modules/auth/phoneMessengerBind.ts
```

не вывела ничего: commit `200b34009` не сдвинул живую поверхность.

Нижние публичные и security-границы проверены командой:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/modules/auth/phoneStartFallback.route.test.ts src/app/api/auth/check-phone/checkPhoneEnumeration.route.test.ts src/modules/auth/phoneMessengerBindTokenProofs.unit.test.ts src/infra/repos/pgUserByPhone.createOrBind.messengerChannel.unit.test.ts"
```

Результат: `4 passed` файла, `40 passed (40)` тестов. Наборы держат start-route и session-door
profile-bind, token-bound provider/contact proof, отказ replay/channel/phone mismatch и нижнюю
profile-bind границу `createOrBind`. Снятый direct-positive test не входил ни в один из этих швов и не был
покрытием живой messenger-цепочки.

## 4. Дерево и статические проверки

- `pnpm --dir apps/webapp exec tsc --noEmit` — exit `0`.
- `pnpm --dir apps/webapp exec eslint` по изменённому тесту, обоим direct-route, трём
  `messenger-bind` route, `PatientBindPhoneBrowser`, `PhoneMessengerAuthFlow` и четырём затронутым
  test-файлам — exit `0`.
- `git diff --check 200b34009^..200b34009` — exit `0`, вывода нет.
- `git diff --check 276448209..200b34009` — exit `0`, вывода нет.
- Полный CI не запускался по прямому запрету brief. DEV/TEST/PROD и общий Next `:5200` не трогались;
  второй сервер не поднимался.

## Вердикт

**PASS — 0 MUST FIX.** Самооракульное ожидание удалено целиком, все owner-valid отказы и порядок двери
сохранены, пять из пяти заданных поломок пойманы оставшимися девятью тестами, а живая
`PatientBindPhoneBrowser → PhoneMessengerAuthFlow(profile_bind) → phone/messenger-bind/*` цепочка не менялась
и проходит свои нижние наборы.

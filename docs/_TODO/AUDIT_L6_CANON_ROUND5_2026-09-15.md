Классификация по §24.4: смешанный аудит — отсутствие app-layer-проверок и корректность активных текстов проверены взглядом; ответы публичной двери и две канонические проверки являются повторяемым поведением и проверены route-тестом с fault injection; `tsc` и ESLint — разовые технические gates.

# Независимый аудит Л6, круг 5 — приёмка этапа целиком

Вердикт: **PASS — MUST FIX нет**.

Кандидат: `75c9a5f461ac3e5ed1ab8cbb463720654dea5f29` ветки `wt/leads-reject-ctx`.
Состав этапа Л6: `a6c9090c9`, `5db5a86ea`, `b9b5feea8`, `4934577b7`, коррекция
`75c9a5f46`.

Оракул:

- `docs/_TODO/LEADS_AND_COMMUNICATION_VISIBILITY_2026-09-14.md`, пункт 6 очереди: заполненный
  телефон не роняет заявку, телефон остаётся полем заявки, мусор получает `400 invalid_phone`;
- `docs/ARCHITECTURE/AUTH_AND_IDENTITY_CANON.md` §18в: телефон заявки не становится
  идентичностью, заявителя определяет подтверждённая почта;
- критерии брифа круга 5.

## MUST FIX

Нет.

Единственный MUST FIX круга 4 устранён. В §18 канона заявка теперь прямо названа пассивным
участником слияния: телефон заявки личности не выбирает и учётки не соединяет
(`AUTH_AND_IDENTITY_CANON.md:434-439`). В §11.1 плана прежняя owner-цитата сохранена дословно, но
заголовок и вводный абзац явно помечают её отменённой историей, по которой работать нельзя, и ведут
в действующий §18в (`LEADS_AND_COMMUNICATION_VISIBILITY_2026-09-14.md:623-634`).

## Проверка итогового состояния взглядом

### App-layer не проверяет формат телефона

`resolveVerifiedLeadApplicant.ts:21-30` принимает только id учётки подтверждённой почты и возвращает
его как `platformUserId`; телефона в сигнатуре и исполняемой форматной проверки нет. Команда:

```bash
rg -n "^import.*(phoneNormalize|phoneValidation)|isValidPhoneE164\(|normalizePhone\(|invalid_(lead_)?phone" apps/webapp/src/app-layer/leads
```

Результат: единственное совпадение — поясняющий комментарий
`resolveVerifiedLeadApplicant.ts:17` с HTTP-кодом `invalid_phone`; исполняемых проверок нет.
Канонический E.164-инвариант находится в `modules/leads/service.ts:19-28`, до записи заявки.

### Телефонная identity-capability снята целиком, права не переехали в миграцию

```bash
rg -n "read_public_lead_trusted_phone_owner|leads\.trusted-phone-owner\.read|findTrustedPhoneOwner|findTrustedCanonicalUserIdByPhoneFromPool|lead_identity_merge_conflict" apps/webapp/src apps/webapp/db/drizzle-migrations deploy/postgres/privileges deploy/postgres/generated
git ls-files 'apps/webapp/db/drizzle-migrations/*public_lead_trusted_phone_owner*'
```

Результат обеих команд: вывод пуст. Удалённого корня нет в приложении, миграциях, единственной
ручной декларации прав и generated-артефактах.

### Активные тексты не предписывают снятую механику

Точный поиск по владеющим текстам, модульному документу и связанному замеру:

```bash
rg -n "\*\*Слияние по телефону|заявки\*\* \(человек|заявки \(человек|привязываем, сливаем аккаунт|телефон уже принадлежит другой уч[её]тке|Телефон чужой уч[её]тки в публичной заявке" docs/ARCHITECTURE/AUTH_AND_IDENTITY_CANON.md docs/_TODO/LEADS_AND_COMMUNICATION_VISIBILITY_2026-09-14.md apps/webapp/src/modules/leads/leads.md docs/_TODO/MERGE_MECHANISM_REWRITE_2026-09-14.md docs/_TODO/E5_EMAIL_AT_LOGIN_GROUND_2026-09-15.md
```

Результат: прежнее предписание осталось только внутри явно отменённой owner-цитаты §11.1 и в
разовом замере Э5. Семантический поиск выполнен командой:

```bash
node /home/dev/brain/tools/code-search.mjs "заявка телефон выбирает существующую учётную запись сливает аккаунты добавляет подтвержденную почту" --repo bcb -k 30
```

Он дополнительно поднял `OWNER_PRODUCT_RULES.md` §33, но там речь о другой поверхности — публичной
записи на приём, а правило запрещает молчаливую привязку чужого человека. Поднятый замер Э5 не
является активной редакцией: владеющий план называет его «ЗАМЕР, а не работа» и той же обратной
ссылкой фиксирует, что его развилки 5 и 6 закрыты более поздним §18в
(`MERGE_MECHANISM_REWRITE_2026-09-14.md:103-124`). По §0 исторический evidence не переписывается.
Активные канон, план Л6 и модульный документ согласованы: телефон — метаданные заявки, identity —
подтверждённая почта.

### Сохранённые тесты проходят линейку владельца §10a

`route.route.test.ts:302-353` вызывает настоящий публичный `POST` вместе с wiring и проверяет
конечные HTTP-ответы и созданную заявку. Проверок текста исходника, импортов или UI нет:

```bash
rg -n "readFileSync|toContain\(|indexOf\(|match\(/|\.ui\.test|@testing-library|jsdom" apps/webapp/src/app/api/leads/public/submit/route.route.test.ts
```

Результат: вывод пуст. Сценарии `not-a-phone` и 20 цифр не дублируют production-развилку: первый
отсекается общим грубым фильтром формы, второй проходит его и краснеет только при снятии E.164 в
сервисе заявок. Удалённый unit `resolveVerifiedLeadApplicant.unit.test.ts` не сохранён; почтовое
опознание проверяется на выходе публичной цепочки.

## Фактическая матрица публичной двери

| Класс входа | Фактический ответ | Фактическая запись |
|---|---|---|
| Активное необязательное phone-поле, значение пусто | `201` | `phoneNormalized:null`, почтовый `platformUserId` |
| Мусор без десяти цифр: `not-a-phone` | `400 invalid_phone` | заявка не создана |
| Двадцать цифр, не E.164: `12345678901234567890` | `400 invalid_phone` | заявка не создана |
| Корректный E.164: `+79990000000` | `201` | телефон и `Звонить после 18:00` сохранены, `platformUserId` почтовый |
| Phone-поле выключено клиникой, тело содержит E.164 | `201` | `phoneNormalized:null`, почтовый `platformUserId` |

Непустые классы проверяются постоянными сценариями `route.route.test.ts:302-353`. Для двух краёв,
где постоянный сценарий не утверждал весь HTTP-результат, существующий route-тест был временно
усилен без добавления нового теста, прогнан и восстановлен:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/app/api/leads/public/submit/route.route.test.ts --reporter=verbose -t 'пройденная дверь создаёт ровно одну заявку'"
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/app/api/leads/public/submit/route.route.test.ts --reporter=verbose -t 'значение поля, выключенного клиникой'"
```

Результат каждой команды: `Test Files 1 passed (1)`, `Tests 1 passed | 14 skipped (15)`, wrapper
`rc=0`. В первом прогоне включено необязательное поле и проверены `phoneNormalized:null` и почтовый
id; во втором дополнительно проверен HTTP `201`.

## Таблица инъекций

| Внесённая поломка | Команда | Покрасневшее конечное утверждение | Результат |
|---|---|---|---|
| Удалено условие E.164 из `modules/leads/service.ts:26-28` | `/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/app/api/leads/public/submit/route.route.test.ts --reporter=verbose -t 'цифровой мусор, который проходит форму'"` | 20-значный мусор получил `201`, ожидались `400 invalid_phone`; заявка не должна создаваться | `Test Files 1 failed (1)`, `Tests 1 failed / 14 skipped`, wrapper `rc=1` |
| Почтовый `platformUserId` в `resolveVerifiedLeadApplicant.ts:27` подменён на `phone-owner-account` | `/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/app/api/leads/public/submit/route.route.test.ts"` | E.164 и выключенное phone-поле сохранили чужой id вместо учётки подтверждённой почты | `Test Files 1 failed (1)`, `Tests 2 failed / 13 passed`, wrapper `rc=1` |

Обе обязательные канонические поломки пойманы; непойманных обязательных классов нет. Все временные
изменения production-кода и route-теста восстановлены. Проверка:

```bash
git diff --exit-code -- apps/webapp/src/app-layer/leads/resolveVerifiedLeadApplicant.ts apps/webapp/src/modules/leads/service.ts apps/webapp/src/modules/booking-form/validateAnswers.ts apps/webapp/src/app/api/leads/public/submit/route.route.test.ts
```

Результат: exit `0`, вывод пуст.

## Финальные проверки кандидата

Затронутый набор заявок:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/app/api/leads/public/submit/route.route.test.ts src/modules/leads/service.unit.test.ts src/modules/leads/notifyClinicLeadCreated.unit.test.ts src/infra/repos/pgLeads.rejection.unit.test.ts src/app-layer/leads/withDoctorLeadsApiAccess.unit.test.ts"
```

Результат: `Test Files 5 passed (5)`, `Tests 24 passed (24)`, wrapper `rc=0`.

TypeScript:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec tsc --noEmit"
```

Результат: wrapper `rc=0`, вывод пуст.

ESLint по затронутому исполняемому phone-path:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec eslint src/app-layer/leads/resolveVerifiedLeadApplicant.ts src/app/api/leads/public/submit/route.ts src/app/api/leads/public/submit/route.route.test.ts src/infra/repos/pgCanonicalPlatformUser.ts src/modules/leads/service.ts src/modules/booking-form/validateAnswers.ts"
```

Результат: wrapper `rc=0`, вывод пуст.

Синхронизация единственной декларации прав и generated-артефактов:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm run check:db-privileges-generated"
```

Результат: DEV/TEST/new PROD privileges, allowlist и port-context artifacts совпадают побайтно;
wrapper `rc=0`.

Проверка патча:

```bash
git diff --check a6c9090c9^..75c9a5f46
```

Результат: exit `0`, вывод пуст.

## ВОПРОСЫ ВЛАДЕЛЬЦУ

Нет.

## НЕ СДЕЛАНО

- Полный CI не запускался — запрещён брифом.
- DEV/TEST/PROD, миграции, режим TEST и работающий `127.0.0.1:5200` не затрагивались; второй
  Next-сервер не поднимался.
- Автоматические UI-тесты не создавались и не запускались.
- Продуктовый код и owner-тексты аудитор не менял; постоянных acceptance-тестов не добавлял.
- Строка вердикта в `feat` не писалась; merge и push не выполнялись.


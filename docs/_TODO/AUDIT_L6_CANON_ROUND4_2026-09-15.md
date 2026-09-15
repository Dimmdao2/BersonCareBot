Классификация по §24.4: смешанный аудит — отсутствие app-layer-проверок и корректность активных текстов проверяются взглядом; ответы публичной двери и две канонические проверки являются повторяемым поведением и проверяются route-тестом с fault injection.

# Независимый аудит Л6, круг 4 — приёмка этапа целиком

Вердикт: **FAIL — MUST FIX 1**.

Кандидат: `4934577b7` ветки `wt/leads-reject-ctx`, этап Л6: `a6c9090c9`, `5db5a86ea`,
`b9b5feea8`, `4934577b7`.

Оракул:

- `docs/_TODO/LEADS_AND_COMMUNICATION_VISIBILITY_2026-09-14.md`, пункт 6 очереди: заполненный
  телефон не роняет заявку, телефон остаётся полем заявки, мусор получает `400 invalid_phone`;
- `docs/ARCHITECTURE/AUTH_AND_IDENTITY_CANON.md` §18в: телефон заявки не становится
  идентичностью, заявителя определяет подтверждённая почта;
- прямые критерии брифа круга 4, включая отсутствие форматных проверок в `app-layer` и отсутствие
  активных текстов, предписывающих снятую механику.

## MUST FIX

### 1. Два активных owner-текста по-прежнему предписывают снятое слияние по телефону заявки

Более поздний канон §18в однозначен: заявка не привязывает телефон, совпадение телефона с чужой
учётной записью не является событием идентичности
(`docs/ARCHITECTURE/AUTH_AND_IDENTITY_CANON.md:569-574`). Однако рядом остались две утвердительные
активные редакции прежнего решения:

1. общий §18 того же канона говорит, что человек оставил заявку с почтой, в другой учётке у него
   телефон, и это «сливается штатно»
   (`docs/ARCHITECTURE/AUTH_AND_IDENTITY_CANON.md:434-436`);
2. открытый план в §11.1 сохраняет заголовок «Слияние по телефону» и прямое предписание привязать,
   слить аккаунт и добавить почту к существующей телефонной учётке
   (`docs/_TODO/LEADS_AND_COMMUNICATION_VISIBILITY_2026-09-14.md:623-630`).

Точный поиск по двум владеющим активным документам:

```bash
rg -n "\*\*Слияние по телефону|заявки\*\* \(человек|заявки \(человек" docs/_TODO/LEADS_AND_COMMUNICATION_VISIBILITY_2026-09-14.md docs/ARCHITECTURE/AUTH_AND_IDENTITY_CANON.md
```

Результат: найдены именно две конфликтующие активные точки — строки `434-435` канона и `623`
плана. Пояснения в пункте Л6 и модульном документе корректно называют прежнюю механику снятой и в
finding не входят.

Достижимое последствие: следующий исполнитель, следуя §18 или §11.1 как активному owner-тексту,
может вернуть уже удалённую ветку, в которой введённый без подтверждения телефон выбирает чужую
учётную запись и переносит на неё подтверждённую почту. Это нарушает §18в и снова создаёт неверный
`platformUserId` либо живой `500` из-за отсутствующей capability. Это прямое нарушение критерия 4
брифа, а не замечание к стилю.

Исправление должен сделать отдельный исполнитель: удалить или заменить несовместимые активные
формулировки в §18 и §11.1 явной ссылкой на более поздний §18в. Аудитор owner-текст не переписывает
и собственный fix не принимает.

Других MUST FIX не найдено.

## Проверка итогового состояния взглядом

### App-layer не проверяет формат телефона

`resolveVerifiedLeadApplicant.ts:21-30` только строит branded applicant из почтового user id;
телефон в сигнатуре отсутствует. Точный поиск исполняемых форматных конструкций во всём lead
app-layer:

```bash
rg -n "^import.*(phoneNormalize|phoneValidation)|isValidPhoneE164\(|normalizePhone\(|throw new Error\('invalid_(lead_)?phone" apps/webapp/src/app-layer/leads
```

Результат: вывод пуст. Поясняющий комментарий о снятой копии не является проверкой.

### Удалённая телефонная identity-capability снята целиком

```bash
rg -n "read_public_lead_trusted_phone_owner|leads\.trusted-phone-owner\.read|findTrustedPhoneOwner|findTrustedCanonicalUserIdByPhoneFromPool" apps/webapp/src apps/webapp/db/drizzle-migrations deploy/postgres/privileges deploy/postgres/generated
```

Результат: вывод пуст. Удалённой функции нет в миграциях, репозитории, единственной декларации прав
или generated-артефактах. Побайтная синхронизация декларации проверена отдельным gate ниже.

### Тесты не сторожат текст и не дублируют снятый unit-слой

```bash
test ! -e apps/webapp/src/app-layer/leads/resolveVerifiedLeadApplicant.unit.test.ts
```

Результат: exit `0`. Сохранённые сценарии `<10 цифр` и `20 цифр не-E.164` — два класса входа,
прямо названные брифом; они проходят разные production-развилки и проверяют одинаково публичный
HTTP-результат и отсутствие записи. Сценарий E.164 проверяет конечную созданную заявку, включая
телефон, способ связи и почтовый `platformUserId`. Проверок исходного текста, импортов или UI в
изменении нет.

## Фактическая матрица публичной двери

| Класс входа | Фактический ответ | Фактическая запись |
|---|---|---|
| Активное необязательное phone-поле, значение пусто | `201` | `phoneNormalized:null`, почтовый `platformUserId` |
| Мусор без десяти цифр: `not-a-phone` | `400 invalid_phone` | заявка не создана |
| Двадцать цифр, не E.164: `12345678901234567890` | `400 invalid_phone` | заявка не создана |
| Корректный E.164: `+79990000000` | `201` | телефон и `Звонить после 18:00` сохранены, `platformUserId` почтовый |
| Phone-поле выключено клиникой, тело содержит E.164 | `201` | `phoneNormalized:null`, почтовый `platformUserId` |

Четыре непустых класса проверяют конечные assertions
`route.route.test.ts:302-352`. Для пустого активного phone-поля существующий сценарий временно
усилен настройкой поля и assertion на конечную запись, после чего тест восстановлен. Команда:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/app/api/leads/public/submit/route.route.test.ts --reporter=verbose -t 'пройденная дверь создаёт ровно одну заявку'"
```

Результат: `Test Files 1 passed (1)`, `Tests 1 passed | 14 skipped (15)`, wrapper `rc=0`.

## Таблица инъекций

Каждая поломка вносилась отдельно в production-код. Для обеих использовалась команда:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/app/api/leads/public/submit/route.route.test.ts"
```

| Внесённая поломка | Покрасневшее конечное утверждение | Результат |
|---|---|---|
| Удалено условие E.164 из `modules/leads/service.ts:26-28` | 20-значный цифровой мусор получил `201`, ожидались `400 invalid_phone`; заявка не должна создаваться | `1 failed / 14 passed`, wrapper `rc=1` |
| Почтовый `platformUserId` в `resolveVerifiedLeadApplicant.ts:27` подменён на `phone-owner-account` | E.164 и выключенное phone-поле сохранили чужой id вместо учётки подтверждённой почты | `2 failed / 13 passed`, wrapper `rc=1` |

Итого по точной команде выше: две обязательные канонические инъекции, обе пойманы; непойманных
обязательных классов нет. Временные изменения восстановлены. Проверка:

```bash
git diff --exit-code -- apps/webapp/src/app-layer/leads/resolveVerifiedLeadApplicant.ts apps/webapp/src/modules/leads/service.ts apps/webapp/src/modules/booking-form/validateAnswers.ts apps/webapp/src/app/api/leads/public/submit/route.route.test.ts
```

Результат: exit `0`, вывод пуст.

## Финальные проверки восстановленного кандидата

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

ESLint по затронутому phone-path:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec eslint src/app-layer/leads/resolveVerifiedLeadApplicant.ts src/app/api/leads/public/submit/route.ts src/app/api/leads/public/submit/route.route.test.ts src/modules/leads/service.ts src/modules/booking-form/validateAnswers.ts"
```

Результат: wrapper `rc=0`, вывод пуст.

Синхронизация единственной декларации прав и generated-артефактов:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm run check:db-privileges-generated"
```

Результат: DEV/TEST/new PROD privileges, allowlist и port-context artifacts совпадают побайтно;
wrapper `rc=0`.

## ВОПРОСЫ ВЛАДЕЛЬЦУ

Нет. MUST FIX прямо следует из §18в и критерия 4 брифа; нового продуктового решения не требуется.

## НЕ СДЕЛАНО

- Конфликтующие owner-тексты и продуктовый код аудитор не исправлял.
- Полный CI не запускался — запрещён брифом.
- DEV/TEST/PROD, миграции, режим TEST и работающий `127.0.0.1:5200` не затрагивались; второй
  Next-сервер не поднимался.
- Автоматические UI-тесты не создавались и не запускались.
- Строка вердикта в `feat` не писалась; merge и push не выполнялись.

## Строка вердикта для ведущего

```text
FAIL Л6, круг 4, кандидат 4934577b7: app-layer формат телефона не проверяет; пять классов публичной двери дают требуемые результаты; E.164-инъекция убита 1/15, подмена почтового applicant — 2/15; финальный lead-набор 5/5 файлов и 24/24 теста, tsc, eslint и privilege-generated check зелёные. MUST FIX 1: два активных owner-текста всё ещё предписывают снятое §18в слияние по неподтверждённому телефону заявки — AUTH_AND_IDENTITY_CANON §18:434-436 и открытый LEADS-план §11.1:623-630. Production-код и временные тестовые изменения восстановлены; полный CI, DEV/TEST/PROD, миграции, live Next, merge и push не выполнялись.
```

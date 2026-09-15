Классификация по §24.4: смешанный аудит — снятие копии и отсутствие дублей проверяются взглядом; ответы публичной двери и живость заслонов являются повторяемым поведением и проверяются route-тестом с fault injection.

# Независимый аудит Л6, круг 3 — телефон в заявке проверяется одним местом

Вердикт: **FAIL — MUST FIX 1**.

Кандидат: `b9b5feea8` ветки `wt/leads-reject-ctx` поверх текстов `5db5a86ea` и
принятой продуктовой правки `a6c9090c9`.

Оракул:

- `docs/_TODO/LEADS_AND_COMMUNICATION_VISIBILITY_2026-09-14.md`, пункт 6 очереди:
  заполненный телефон отвечает `201`, телефон и способ связи сохраняются, заявитель остаётся
  учёткой подтверждённой почты, мусорный телефон отвечает `400 invalid_phone`;
- `docs/ARCHITECTURE/AUTH_AND_IDENTITY_CANON.md` §18в: телефон заявки не становится
  идентичностью;
- прямой критерий брифа круга 3: телефон в заявке проверяется одним местом, а каждый оставшийся
  заслон должен иметь наблюдаемый зуб при отдельном снятии.

## MUST FIX

### 1. В lead-пути остались два места проверки формата; первое не имеет отдельного эффекта

Кандидат снял копию из
`apps/webapp/src/app-layer/leads/resolveVerifiedLeadApplicant.ts`, но публичная заявка всё ещё
проходит две форматные развилки:

1. `apps/webapp/src/modules/booking-form/validateAnswers.ts` отказывает телефону с числом цифр
   меньше десяти как `invalid_phone`;
2. `apps/webapp/src/modules/leads/service.ts` нормализует телефон и проверяет E.164 перед записью,
   бросая `invalid_lead_phone`.

Это не только два текста. Достижимый запрос `phone: "not-a-phone"` на текущем кандидате
останавливается в первой развилке. При отдельном снятии этой развилки тот же запрос доходит до
сервиса заявок и получает тот же публичный результат; весь route-набор остаётся зелёным.

Инъекция: временно удалено условие `field.fieldType === 'phone' && ...length < 10` из
`validateAnswers.ts`. Команда:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/app/api/leads/public/submit/route.route.test.ts"
```

Результат: `Test Files 1 passed (1)`, `Tests 15 passed (15)`, wrapper `rc=0`.
Ни одно assertion не покраснело. Значит заявленное кандидатом «одно место» не достигнуто:
грубый фильтр остаётся вторым chokepoint, но на публичной двери целиком перекрыт более строгим
сервисом заявок. Это прямое нарушение scope брифа; кандидат не принимается до консолидации
lead-пути.

Продуктовый fix аудитор не делает. Конкретная механика консолидации должна сохранить правила
других поверхностей общего booking-form сервиса; глобально удалять фильтр без проверки его
остальных callers из этого finding не следует.

## Фактическая матрица двери

Для вывода фактических status/body и записанного результата в route-тест временно добавлялась
трассировка, затем она полностью удалена. Основная команда для пяти классов:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/app/api/leads/public/submit/route.route.test.ts --reporter=verbose -t 'пройденная дверь|обязательный телефон|мусор в телефоне|цифровой мусор|значение поля'"
```

Результат команды: `Tests 5 passed | 10 skipped (15)`, wrapper `rc=0`.

Активное необязательное поле с пустым ответом проверено той же дверью отдельным временно
параметризованным запуском:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/app/api/leads/public/submit/route.route.test.ts --reporter=verbose -t 'пройденная дверь создаёт ровно одну заявку'"
```

Результат: `Tests 1 passed | 14 skipped (15)`, wrapper `rc=0`.

| Класс входа | Фактический ответ двери | Фактическая запись |
|---|---|---|
| Активное необязательное поле, телефон пуст | `201 {ok:true, leadId:"lead-1"}` | `phoneNormalized:null`, `platformUserId:00000000-0000-4000-8000-0000000000c1` |
| Меньше десяти цифр: `not-a-phone` | `400 {ok:false, error:"invalid_phone"}` | заявка не создана |
| Десять и больше цифр, но не E.164: `12345678901234567890` | `400 {ok:false, error:"invalid_phone"}` | заявка не создана |
| Корректный E.164: `+79990000000` | `201 {ok:true, leadId:"lead-1"}` | телефон `+79990000000`, способ связи `Звонить после 18:00`, почтовый `platformUserId` |
| Поле телефона выключено клиникой, тело содержит `+79990000000` | `201 {ok:true, leadId:"lead-1"}` | `phoneNormalized:null`, почтовый `platformUserId` |

Ни один класс, который должен давать `400`, не стал `201` или `500`; снятие resolver-копии
поведение этих классов не потеряло.

## Таблица инъекций

Каждая поломка вносилась отдельно в production-код. Для всех трёх использовалась команда:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/app/api/leads/public/submit/route.route.test.ts"
```

| Внесено | Поймано | Не поймано |
|---|---|---|
| Снят грубый phone-фильтр формы в `validateAnswers.ts` | Ничего: `15 passed / 15` | **Да** — второе место не имеет самостоятельного результата; MUST FIX 1 |
| Снята E.164-проверка перед записью в `modules/leads/service.ts` | `1 failed / 14 passed`: длинный цифровой мусор получил `201`, ожидался `400 invalid_phone` | Нет |
| Почтовый `platformUserId` в resolver подменён на `phone-owner-account` | `2 failed / 13 passed`: обязательный телефон и выключенное поле сохранили чужой `platformUserId` вместо учётки подтверждённой почты | Нет |

Итого по точной команде выше: **3 инъекции; 2 пойманы, 1 не поймана**. Непойманная
инъекция относится не к отсутствующей защите пользовательского результата, а к оставленному
дублирующему production-заслону — поэтому и является finding этого круга.

После инъекций временные изменения трёх production-файлов и временная трассировка route-теста
возвращены до байтового состояния кандидата. Проверка:

```bash
git diff --exit-code -- apps/webapp/src/app-layer/leads/resolveVerifiedLeadApplicant.ts apps/webapp/src/modules/leads/service.ts apps/webapp/src/modules/booking-form/validateAnswers.ts apps/webapp/src/app/api/leads/public/submit/route.route.test.ts
```

Результат: exit `0`, вывод пуст.

## Качество тестов

- Новый сценарий длинного цифрового мусора проверяет конечный HTTP-ответ и отсутствие созданной
  заявки; он краснеет при снятии E.164-решения в сервисе. Это поведенческий route-тест, не
  проверка текста или внутреннего вызова.
- Сценарии `<10 цифр` и `>=10 цифр, но не E.164` являются двумя явно заданными брифом классами
  входа, поэтому друг друга не дублируют по §10a.
- Удалённого `resolveVerifiedLeadApplicant.unit.test.ts` нет; отдельного unit-дубля identity или
  формата в просмотренном lead-scope не осталось.
- Автоматические UI-тесты не добавлялись.

Точная проверка удалённого файла:

```bash
test ! -e apps/webapp/src/app-layer/leads/resolveVerifiedLeadApplicant.unit.test.ts
```

Результат: exit `0`. Поиск возможных дублей выполнялся сначала через
`node /home/dev/brain/tools/code-search.mjs "resolveVerifiedLeadApplicant lead phone invalid_phone route" --repo bcb -k 12`,
затем точным запросом по просмотренному lead-scope:

```bash
rg -n "not-a-phone|12345678901234567890|fieldType === 'phone'|invalid_phone" apps/webapp/src/modules/booking-form apps/webapp/src/modules/leads apps/webapp/src/app/api/leads --glob '*test.ts' --glob '*.ts'
```

В тестах поиск нашёл только два route-сценария заданных брифом классов; production-совпадения —
два заслона из MUST FIX 1 и их HTTP-маппинг.

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

ESLint по затронутому и проверенному phone-path:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec eslint src/app-layer/leads/resolveVerifiedLeadApplicant.ts src/app/api/leads/public/submit/route.ts src/app/api/leads/public/submit/route.route.test.ts src/modules/leads/service.ts src/modules/booking-form/validateAnswers.ts"
```

Результат: wrapper `rc=0`, вывод пуст.

## ВОПРОСЫ ВЛАДЕЛЬЦУ

Нет.

## НЕ СДЕЛАНО

- Продуктовый код и тесты не исправлялись; все fault injection и трассировка откатаны.
- Полный CI не запускался — запрещён брифом.
- DEV/TEST/PROD, миграции, режим TEST и работающий `127.0.0.1:5200` не затрагивались;
  второй Next-сервер не поднимался.
- Строка вердикта в `feat` не писалась; merge и push не выполнялись.

## Строка вердикта для ведущего

```text
FAIL Л6, круг 3, кандидат b9b5feea8 поверх 5db5a86ea и a6c9090c9: пять классов телефона дают требуемый публичный результат; E.164-инъекция убита 1/15, подмена почтовой identity — 2/15; финальный lead-набор 5/5 файлов, 24/24 теста, tsc и eslint rc=0. MUST FIX 1: требование «телефон в заявке проверяется одним местом» не выполнено — кроме E.164 в modules/leads/service.ts остался грубый phone-фильтр modules/booking-form/validateAnswers.ts; его отдельное снятие оставило весь route-набор зелёным 15/15, то есть это второй заслон без самостоятельного наблюдаемого эффекта. Production-код и тесты восстановлены; полный CI, DEV/TEST/PROD, миграции, live Next, merge и push не выполнялись.
```

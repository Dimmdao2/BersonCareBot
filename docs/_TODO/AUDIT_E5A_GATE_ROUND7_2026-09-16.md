FAIL — 3 MUST FIX

# Независимый адверсарный аудит Э5a — гейт пациентской двери, круг 7

Предмет: коммит `c734c64276c909621ac8e7f5633458b74070b2cf` в ветке
`wt/e5-email-gate`, файл
`apps/webapp/scripts/check-patient-api-business-access-door.mjs`.

Оракул: `docs/_TODO/E5_EMAIL_AT_LOGIN_GROUND_2026-09-15.md` §5 п. 1 — «Безопасный
default: разрешены лишь экран привязки, повторная отправка кода, поддержка и выход;
клинические данные до завершения не показываются».

Классификация до проверки:

- вызов локального helper до двери, извлечение handler из обёртки и шум по дереву — повторяемое
  поведение гейта, доказательство собственными AST-инъекциями через публичную `checkSource()` и
  штатным tree-check;
- честность шапки — качество текста, доказательство взглядом против результатов тех же инъекций.

## MUST FIX-1 — локальный helper снова скрывается за псевдонимом, методом, `.call` и массивом

Строка оракула: клинические данные до завершения общего прохода не показываются.

`firstDataReadPortIn()` (`:344–383`) следует в тело локальной функции только когда выражение под
`await` — непосредственный вызов identifier, уже лежащего в `localFunctionBodies()`:

```ts
const callee = ts.isCallExpression(n.expression) ? n.expression.expression : undefined;
if (callee && ts.isIdentifier(callee) && locals.has(callee.text)) { /* ... */ }
```

Прямая форма `await loadPlan()` теперь краснеет, но эквивалентное реально выполняемое чтение остаётся
зелёным:

```ts
const loadPlan = async () =>
  await buildAppDeps().treatmentProgram.getForPatient({});
const f = loadPlan;
const exposed = await f(); // клиническое чтение уже выполнено
const gate = await requirePatientApiBusinessAccess();
if (!gate.ok) return gate.response;
return Response.json(exposed);
```

Тот же результат дали `await loadPlan.call(null)`, `await loaders.loadPlan()` и
`await [loadPlan][0]()`: ожидаемый красный, фактически зелёный, findings пусты. Это не helper вне
route-файла — все четыре варианта объявлены и вызваны в том же source file.

Impact: разработчик может вынести локальный вызов в обычный alias/объект, прочитать клинические
данные до общей двери и получить зелёный обязательный lint-gate.

Шапка на `:27–29` поэтому врёт: молчание осталось не только на helper'ах, объявленных вне файла
маршрута. Требование п. 3 аудита не выполнено; исправление обязано либо закрыть эти локальные формы,
либо честно сузить заявленную границу. Для обязательного гейта первый вариант нужен, чтобы выполнить
оракул.

## MUST FIX-2 — unrecognised handler можно снова спрятать перед защищённым callback

Строка оракула: клинические данные до завершения общего прохода не показываются.

`handlerBodiesOf()` (`:172–192`) fail-closed только когда итоговый список кандидатов целиком пуст.
Если настоящий handler скрыт в неразбираемой форме, а следующий аргумент даёт защищённое тело,
список уже не пуст и маршрут зеленеет:

```ts
async function actualHandler() {
  return Response.json(
    await buildAppDeps().treatmentProgram.getForPatient({}),
  );
}
const f = actualHandler;

export const GET = compose(
  f, // реальный handler проигнорирован
  async () => {
    const gate = await requirePatientApiBusinessAccess();
    if (!gate.ok) return gate.response;
    return Response.json({ ok: true });
  },
);
```

Фактически: зелёный результат и пустые findings. Вариант `compose([actualHandler], guardedCallback)`
также зелёный. Контрольные варианты ведут себя иначе: прямой
`compose(actualHandler, guardedCallback)` краснеет; `compose({ handler: actualHandler })`, где
кандидатов действительно ноль, тоже краснеет. Значит заявленный «пустой список — отказ» правдив,
но не закрывает обход: один распознанный защищённый callback маскирует любое число нераспознанных
аргументов с настоящим handler.

Impact: дефект круга 6 «настоящий handler спрятан первым аргументом, дверь — во втором callback»
остаётся достижимым после одного обычного alias или контейнера и снова пропускает клиническое чтение
мимо двери.

## MUST FIX-3 — карта тел по тексту имени путает lexical bindings: есть и обход, и ложный красный

Строка оракула: клинические данные до завершения общего прохода не показываются.

`localFunctionBodies()` (`:143–165`) рекурсивно обходит весь source file и складывает тела в один
`Map<string, Node>` по тексту имени. Scope и symbol identity не учитываются; последняя одноимённая
вложенная декларация перезаписывает реальное top-level binding.

Собственная парная инъекция:

- небезопасный top-level `actualHandler`, прочитавший `treatmentProgram`, был перезаписан в map
  одноимённым защищённым callback внутри не вызываемой `unrelatedScope()` — ожидаемый красный стал
  зелёным;
- защищённый top-level `actualHandler` был перезаписан одноимённым незащищённым callback внутри той
  же не вызываемой функции — законный handler стал красным.

Impact: первая форма скрывает клиническое чтение до двери; вторая ломает lint на законном коде без
изменения runtime-поведения. Это одновременно нарушение fail-closed поведения и требуемой
нешумности правила.

## Матрица собственных инъекций

Временный probe вызывал экспортированную `checkSource()`; файл после прогона удалён. Точная команда:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec node scripts/.audit-e5a-round7-probe.mjs"
```

Результат команды: `rc=1`, `16` адверсарных форм, `8` несовпадений с oracle.

| Форма | Требовалось | Факт |
|---|---:|---:|
| прямой локальный helper до двери | красный | красный, `treatmentProgram BEFORE` |
| alias локального helper | красный | **зелёный — MF-1** |
| `.call` локального helper | красный | **зелёный — MF-1** |
| метод объекта | красный | **зелёный — MF-1** |
| helper в массиве | красный | **зелёный — MF-1** |
| рекурсивный helper с последующим чтением | красный | красный; `seen` не зациклил и не проглотил чтение |
| helper объявлен ниже handler | красный | красный; hoisting разобран |
| прямой named handler + guarded callback | красный | красный |
| handler-alias + guarded callback | красный | **зелёный — MF-2** |
| handler в массиве + guarded callback | красный | **зелёный — MF-2** |
| полностью пустой список кандидатов | красный | красный |
| `Object.assign` с непосредственным handler | красный | красный |
| `compose(a, b)`, где один прямой кандидат без двери | красный | красный |
| защищённый handler + shadowed unsafe binding | зелёный | **красный — MF-3** |
| незащищённый handler + shadowed safe binding | красный | **зелёный — MF-3** |
| безопасная inline-обёртка | зелёный | зелёный |

## Self-test: количество и причина каждого красного

Штатный self-test:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec node scripts/check-patient-api-business-access-door.mjs --self-test"
```

Результат команды: `rc=0`, `10 bypass fixtures red`, `8 canonical fixtures green`; следующий за
self-test штатный tree-check также зелёный.

Чтобы число не маскировало неверную причину, тот же временный probe отдельно вызвал `checkSource()`
на каждой из десяти красных фикстур и сверил единственный finding с её предметом. Результат той же
probe-команды выше: `selfTestRedCases=10`, `selfTestReasonMismatches=0`.

Проверенные причины: ранний local-helper — `treatmentProgram BEFORE`; два handler'а — только
незащищённый `PUT`; прямое раннее чтение — `materialRating BEFORE`; пустая причина exception —
ошибка причины; оставшиеся формы — ожидаемый fail-closed конкретного `GET`. Самотест не краснеет
случайно, но не содержит форм из трёх findings выше.

Самотест допустим по §10a: он проверяет публичный результат механического гейта, а независимый oracle
— owner-граница клинических данных. Поломка дорогая и молчаливая: lint остаётся зелёным при маршруте,
который читает данные до двери.

## Штатное дерево, независимая перепись и исключения

Штатный прогон:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec node scripts/check-patient-api-business-access-door.mjs"
```

Результат команды: `rc=0`, `106 handlers`, `96 guarded routes`, `3 explicit exceptions`.

Независимый временный AST-census не импортировал проверяемый гейт. Точная команда:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec node scripts/.audit-e5a-round7-census.mjs"
```

Результат команды: `rc=0`, `guardedRoutes=96`, `exportedHandlers=106`,
`explicitExceptions=3`; временный census-файл удалён.

Исключения проверены взглядом:

- `patient/email-change/confirm/route.ts` — подтверждает pending email challenge текущего пациента;
  это identity/bind-flow, а не выдача клинических данных;
- `patient/messenger/request-contact/route.ts` — доступен только с пациентской сессией и при
  `need_activation`, просит мессенджер прислать contact для завершения primary proof; клинические
  данные не отдаёт;
- `patient/support/route.ts` — явный разрешённый oracle escape; отправляет обращение, клинические
  данные кабинета не отдаёт.

Все исключения заслужены в границе этого гейта. Законных маршрутов текущего дерева, покрасневших
после коррекции, штатный прогон не нашёл; отдельная безопасная shadowing-инъекция доказывает новый
ложный красный вне нынешнего дерева (MUST FIX-3).

## НЕ СДЕЛАНО

- Product/script fix не вносился: роль аудитора.
- Постоянные тесты не добавлялись; все probe/census-файлы удалены.
- Полный CI не запускался по прямому запрету brief.
- DEV, TEST, PROD, миграции и Next-сервер не затрагивались.

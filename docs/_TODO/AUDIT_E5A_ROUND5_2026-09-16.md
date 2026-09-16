FAIL — 6 MUST FIX

# Независимый аудит Э5a — круг 5

Предмет: только полнота статического правила
`apps/webapp/scripts/check-patient-api-business-access-door.mjs` в коммите `75fff48b2`.
Продуктовая половина `patient/material-ratings` и `businessAccess: 'optional'`, принятая кругом 4,
не перепроверялась.

Оракул: `docs/_TODO/E5_EMAIL_AT_LOGIN_GROUND_2026-09-15.md` §5 п. 1 — до завершения общего
прохода пациенту нельзя показывать клинические данные; разрешены только привязка почты, повторная
отправка кода, поддержка и выход.

## MUST FIX-1 — точное имя `buildAppDeps` не является границей доступа к данным

Файл и точная запись: `apps/webapp/scripts/check-patient-api-business-access-door.mjs`,
`depsLocals()` принимает только identifier-декларацию вида `const deps = buildAppDeps()`, а
`dataReadPortOf()` принимает только корень с точным текстом `buildAppDeps` или такой `deps`.

Достижимый сценарий: patient-route до двери делает одну из записей ниже, получает защищённые данные,
затем штатно вызывает дверь; линтер завершается зелёным:

- `await patientRepository.readProtectedData()` при прямом импорте репозитория;
- `await getDrizzle().select().from(...)`;
- `const { materialRating } = buildAppDeps(); await materialRating.getForPatient(...)`;
- `import { buildAppDeps as makeDeps } ...; await makeDeps().materialRating.getForPatient(...)`;
- `import * as appDeps ...; await appDeps.buildAppDeps().materialRating.getForPatient(...)`;
- `let deps; deps = buildAppDeps(); await deps.materialRating.getForPatient(...)`;
- `const ratings = deps.materialRating; await ratings.getForPatient(...)`;
- `await deps['materialRating'].getForPatient(...)`.

Impact: новый маршрут может прочитать клинические данные до общего прохода и остаться зелёным.
Нарушено требование owner-оракула выше.

## MUST FIX-2 — вызов helper до двери не связывается с чтением внутри helper

Файл и точная запись: тот же файл, `firstDataReadPortIn()` смотрит только синтаксическое поддерево
раннего statement и не следует в вызываемую функцию.

Образец, оставшийся зелёным: top-level `readProtectedData()` выполняет
`buildAppDeps().materialRating.getForPatient(...)`, а handler до двери делает
`const leaked = await readProtectedData()`.

Impact: helper читает клинические данные до двери, но маршрут проходит линтер. Нарушен owner-оракул.

## MUST FIX-3 — начатое до двери чтение не распознаётся без `await` на месте вызова

Файл и точная запись: тот же файл, `firstDataReadPortIn()` рассматривает только
`ts.isAwaitExpression(n)`.

Зелёный образец:

```ts
const pending = deps.materialRating.getForPatient({});
const gate = await requirePatientApiBusinessAccess();
if (!gate.ok) return gate.response;
return Response.json(await pending);
```

Вызов уже запустил чтение до двери; перенос `await` после двери не переносит начало операции.
Impact: клиническое чтение идёт до решения общего прохода, а линтер зелёный.

## MUST FIX-4 — результат двери можно переприсвоить до проверки

Файл и точная запись: тот же файл, `handlerPassesDoor()` связывает имя с первоначальным вызовом,
но не проверяет записи в binding между декларацией и `if (!gate.ok)`.

Зелёный образец:

```ts
let gate = await requirePatientApiBusinessAccess();
gate = { ok: true } as typeof gate;
if (!gate.ok) return gate.response;
const protectedData = await buildAppDeps().materialRating.getForPatient({});
```

Impact: отказ двери можно заменить разрешением и показать защищённые данные; линтер принимает handler.
Это прямой обход owner-оракула.

## MUST FIX-5 — объявление inline-helper ошибочно считается выполненным чтением

Файл и точная запись: тот же файл, `firstDataReadPortIn()` без границы функции рекурсивно заходит в
тело arrow/function declaration, находя там `await`, хотя объявление helper ничего не читает.

Законный образец, который линтер объявил нарушением:

```ts
const deps = buildAppDeps();
const readAfterDoor = async () => await deps.materialRating.getForPatient({});
const gate = await requirePatientApiBusinessAccess();
if (!gate.ok) return gate.response;
return Response.json(await readAfterDoor());
```

Impact: безопасный handler, где чтение вызывается только после двери, не проходит lint. Это ложное
срабатывание на законном коде.

## MUST FIX-6 — higher-order handler отклоняется по форме независимо от порядка

Файл и точная запись: тот же файл, `exportedHandlers()` извлекает body только у непосредственного
arrow/function initializer; `export const GET = makeHandler(async () => ...)` получает
`body: undefined`, после чего `checkSource()` безусловно создаёт нарушение.

Опасный HOF с чтением до двери был отклонён, но безопасный HOF с дверью первой был отклонён той же
ошибкой. Значит правило не распознаёт порядок в HOF, а запрещает форму целиком.

Impact: законный HOF-route не может пройти lint; это ложное срабатывание, обесценивающее гейт.

## 1. Формы записи — ТЕСТ

Способ: временные `route.ts` под
`apps/webapp/src/app/api/patient/__audit_e5a_round5__/**`, затем настоящий tree-check. Все файлы
удалены после прогона.

Точная команда для следующей таблицы:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec node scripts/check-patient-api-business-access-door.mjs"
```

| Форма | Результат |
|---|---|
| Прямой импорт репозитория до двери | НЕ распознана: зелёная |
| `getDrizzle()` до двери | НЕ распознана: зелёная |
| Top-level helper с чтением, вызванный до двери | НЕ распознана: зелёная |
| Вызов без `await`, ожидание promise после двери | НЕ распознана: зелёная |
| `Promise.all([read, door])` | Распознана как нарушение, но общим сообщением «must fail closed» |
| `const { materialRating } = buildAppDeps()` | НЕ распознана: зелёная |
| Дверь внутри `try`, чтение выше `try` | Распознана как нарушение, но общим сообщением «must fail closed» |
| HOF-handler с чтением до двери | Отклонён, но только потому, что HOF body не разбирается |
| Переприсваивание binding результата двери | НЕ распознано: зелёная |
| Законный inline-helper, вызываемый только после двери | ЛОЖНОЕ срабатывание `reads data BEFORE` |
| Законный HOF с дверью первой | ЛОЖНОЕ срабатывание `must fail closed` |
| `await request.json()` до двери | Законно зелёная |
| `await deps.runtimeConfig.getServerBoolean(...)` до двери | Законно зелёная |

Результат этой точной команды на перечисленных образцах: `5 violation(s)` — `Promise.all`, дверь
внутри `try`, оба HOF и законный inline-helper. Остальные опасные образцы отсутствовали в findings.

Дополнительные эквивалентные формы проверены отдельным tree-check той же точной командой во временном
каталоге `__audit_e5a_round5_more__`: alias и namespace для `buildAppDeps`, присваивание deps после
декларации, alias порта и bracket-access. Результат команды:
`OK (111 handlers, 101 guarded routes, 3 explicit exceptions)` — все эти обходы попали в перепись,
но ни один не был распознан как нарушение.

## 2. Законный код и перепись — ВЗГЛЯД

Результат по живому дереву: ложных срабатываний сейчас нет — после удаления образцов tree-check
зелёный. Это не снимает MUST FIX-5/6: чтение AST показывает, почему законные inline-helper и HOF
краснеют при появлении.

Точная команда живого tree-check:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec node scripts/check-patient-api-business-access-door.mjs"
```

Результат: `OK (106 handlers, 96 guarded routes, 3 explicit exceptions)`.

Перепись пересчитана независимо временным AST-скриптом: он сам рекурсивно перечислил
`route.{ts,tsx,js,jsx,mjs}`, применил scope patient / непубличный booking / guard-ratchet, затем сам
посчитал экспортированные HTTP methods и три точных exception-path. Он не импортировал проверяемый
линтер. Точная команда:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec node scripts/audit-e5a-round5-census.tmp.mjs"
```

Результат: `{"guardedRoutes":96,"exportedHandlers":106,"explicitExceptions":3}`. Заявленные
`96 / 106 / 3` сходятся. Временный census-скрипт удалён.

Self-test проверяемого гейта также запущен отдельно точной командой:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec node scripts/check-patient-api-business-access-door.mjs --self-test"
```

Результат: `8 bypass fixtures red, 6 canonical fixtures green`, затем живой tree-check
`106 handlers, 96 guarded routes, 3 explicit exceptions`. Self-test зелёный, но перечисленных выше
форм в нём нет.

## 3. Содержательность правила — ВЗГЛЯД

Точная команда:

```bash
git diff 75fff48b2^ 75fff48b2 -- apps/webapp/scripts/check-patient-api-business-access-door.mjs
```

Результат: FAIL. Правка действительно закрывает точную инъекцию круга 4
`await deps.materialRating...` и расширения route-файла, но правило порядка сформулировано через
конкретные AST-очертания текущего дерева: точное имя `buildAppDeps`, identifier-декларацию deps,
непосредственный `await`, top-level handler statements и непосредственный arrow/function export.
Тестовые образцы выше показывают, что эквивалентное чтение меняет результат линтера без изменения
наблюдаемого порядка «данные до двери»; одновременно безопасная вложенная функция краснеет. Значит
формулировка подогнана под текущую запись, а не держит инвариант по существу.

## Проверка числа findings и чистоты

После создания отчёта число MUST FIX проверяется командой:

```bash
rg -c '^## MUST FIX-' docs/_TODO/AUDIT_E5A_ROUND5_2026-09-16.md
```

Ожидаемый и полученный результат: `6`.

Все временные route-файлы и census-скрипт удалены. Финальная команда чистоты после коммита:

```bash
git status --short
```

Ожидаемый результат: пустой вывод.

## НЕ СДЕЛАНО

- Product/script fixes не вносились: роль проверяющего.
- Продуктовая половина, принятая кругом 4, не перепроверялась.
- Полный CI не запускался: запрещён brief.
- DEV migrations, TEST, PROD, deploy, push и второй Next-server не запускались.

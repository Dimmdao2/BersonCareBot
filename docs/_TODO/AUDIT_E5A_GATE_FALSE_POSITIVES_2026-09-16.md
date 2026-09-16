FAIL — 2 MUST FIX

# Независимый аудит Э5a: снятые ложные тревоги и граница гейта

Предмет: только коммит `8ce3ec717ed8f36895b06c4d2807528bc35a9e55` в ветке
`wt/e5-email-gate`.

Оракул: `docs/_TODO/E5_EMAIL_AT_LOGIN_GROUND_2026-09-15.md`, §5 п. 1 — до завершения
общего прохода пациенту разрешены только привязка почты, повторная отправка кода, поддержка и выход;
клинические данные не показываются.

Классификация до проверки:

- законные и опасные формы правила — повторяемое поведение, доказательство временными маршрутами;
- точность шапки — качество разового действия, доказательство взглядом и отдельной пробой каждой
  перечисленной формы.

## MUST FIX-1 — граница функции сняла не только ложную тревогу, но и вызванное чтение

Файл: `apps/webapp/scripts/check-patient-api-business-access-door.mjs`, `firstDataReadPortIn()`,
строки 300–327 на проверенном SHA.

Временный маршрут объявлял локальный `loadPlan` до двери. В безопасном варианте он вызывался после
двери — гейт остался зелёным, как требуется. Во втором варианте тот же helper реально вызывался до
двери:

```ts
export async function GET() {
  const deps = buildAppDeps();
  const loadPlan = async () => await deps.treatmentProgram.getForPatient({});
  const exposed = await loadPlan();
  const access = await requirePatientApiBusinessAccess();
  if (!access.ok) return access.response;
  return Response.json(exposed);
}
```

Гейт остался зелёным. `firstDataReadPortIn()` пропускает тело локальной функции при объявлении, но при
последующем раннем вызове не связывает identifier `loadPlan` с этим телом. Это уже не ложная тревога:
клиническое чтение действительно выполняется до двери. Исправление MF5 тем самым ослабило правило на
той же локальной форме, которую меняло.

Impact: новый patient-route может прочитать клинические данные до общего прохода и пройти обязательный
гейт. Нарушены oracle выше и явный критерий этого аудита: объявленный и тут же вызванный до двери helper
обязан краснеть.

Шапка честно говорит, что гейт молчит на чтении внутри вызванного helper. Это не отменяет finding:
acceptance-критерий различает локальный helper изменённой поверхности и заранее принятую границу
top-level helper. После исправления формулировку шапки надо сохранить честной для реально оставшейся
границы.

## MUST FIX-2 — `handlerBodyOf()` принимает callback второго аргумента за HTTP-handler

Файл: `apps/webapp/scripts/check-patient-api-business-access-door.mjs`, `handlerBodyOf()`, строки
135–149 на проверенном SHA.

Функция рекурсивно перебирает все аргументы вызова и возвращает первое найденное функциональное тело.
Временный маршрут передал настоящий handler первым аргументом как identifier, а защищённый служебный
callback — вторым:

```ts
async function actualHandler() {
  return Response.json(await buildAppDeps().treatmentProgram.getForPatient({}));
}

export const GET = wrap(actualHandler, async () => {
  const access = await requirePatientApiBusinessAccess();
  if (!access.ok) return access.response;
  return Response.json({ settled: true });
});
```

Гейт остался зелёным: `actualHandler` не дал тела, после чего `handlerBodyOf()` взял тело второго
callback и проверил его вместо HTTP-handler.

Impact: незащищённый handler можно скрыть первым аргументом обёртки, если любой последующий callback
содержит дверь. Это новый достижимый обход, созданный снятием ложной тревоги на обёртках, и прямое
ослабление owner-правила.

## Матрица собственных временных маршрутов

Точная команда при наличии временных маршрутов:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec node scripts/check-patient-api-business-access-door.mjs"
```

Команда завершилась `rc=1` и напечатала только две ожидаемые ею ошибки:

- `wrapper-read-first/route.ts` — чтение через `treatmentProgram` до двери;
- `wrapper-no-door/route.ts` — обёртка без двери.

Отсутствие остальных временных путей в выводе дало такую матрицу:

| Собственный образец | Требовалось | Факт |
|---|---:|---:|
| inline-helper объявлен до двери, вызван после | зелёный | зелёный |
| inline-helper объявлен и вызван до двери | красный | **зелёный — MF-1** |
| обёртка, дверь первой | зелёный | зелёный |
| обёртка, чтение до двери | красный | красный |
| обёртка без двери | красный | красный |
| handler-identifier первым аргументом, защищённый callback вторым | красный | **зелёный — MF-2** |

Все временные `route.ts` из
`apps/webapp/src/app/api/patient/__audit_e5a_false_positives__/` удалены после прогона.

## Границы шапки подтверждены

Той же командой отдельно присутствовали четыре маршрута, соответствующие четырём заявлениям шапки.
Ни один не появился среди нарушений, то есть запись совпадает с фактическим поведением:

- прямой repository-read мимо `buildAppDeps()` — гейт молчит;
- чтение в вызванном до двери top-level helper — гейт молчит;
- промис запущен до двери, `await` стоит после — гейт молчит;
- результат двери переприсвоен до проверки — гейт молчит.

Это подтверждённые границы, не `MUST FIX`, согласно brief. Шапка не объявляет гейт доказательством
отсутствия обходов и в этой части честна.

## Self-test по §10a

Точная команда:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec node scripts/check-patient-api-business-access-door.mjs --self-test"
```

Результат: `rc=0`, `8 bypass fixtures red`, `8 canonical fixtures green`; затем штатный tree-check
также завершился зелёным.

Два новых зелёных образца допустимы по §10a: они вызывают публичную границу `checkSource()` и проверяют
наблюдаемый результат гейта, а не строки его реализации; независимый oracle — воспроизведённые ложные
срабатывания круга 5. Честный внутренний рефакторинг не требует менять expected, пока обе законные формы
остаются зелёными. Однако одних положительных образцов недостаточно: именно отсутствие парного опасного
случая для local-helper и неоднозначной обёртки позволило обоим `MUST FIX` остаться незамеченными.

## Штатное дерево и независимая перепись

Штатный прогон после удаления временных маршрутов:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec node scripts/check-patient-api-business-access-door.mjs"
```

Результат: `rc=0`, `106 handlers`, `96 guarded routes`, `3 explicit exceptions`.

Числа независимо пересчитаны временным AST-census, который не импортировал функции проверяемого
гейта. Точная выполненная команда:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec node scripts/.audit-e5a-independent-census.mjs"
```

Результат собственной переписи: `96 guarded routes`, `106 handlers`, `3 explicit exceptions`.
Три найденных explicit exception path: `patient/email-change/confirm/route.ts`,
`patient/messenger/request-contact/route.ts`, `patient/support/route.ts`. Временный census-script удалён.

Полный CI не запускался по прямому запрету brief.

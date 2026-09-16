FAIL — MUST FIX: 2

# Независимый аудит Э5a — round 4

Дата: 2026-09-16. Ветка: `wt/e5-email-gate`. Аудируемые коммиты: `f1c5cd410`, `926a9b9e3`.

Authority: `docs/_TODO/E5_EMAIL_AT_LOGIN_GROUND_2026-09-15.md` §5 п.1: «разрешены лишь экран привязки, повторная отправка кода, поддержка и выход; клинические данные до завершения не показываются»; `docs/_TODO/MERGE_MECHANISM_REWRITE_2026-09-14.md` Э5: владелец 15.09 закрыл политику как «просьба → требование через 14 дней → отказ во входе».

## MUST FIX-1 — structural gate пропускает чтение защищённых данных до общего прохода

Метод: RUN + LOOK.

Результат: FAIL. Gate требует наличие `const gate = await requirePatientApiBusinessAccess()` и последующий `if (!gate.ok) return ...`, но не проверяет, что до этого прохода route не читает protected data. Временный реальный route под `apps/webapp/src/app/api/patient/audit-slip/route.ts` сначала вызвал `buildAppDeps().materialRating.getForPatient(...)`, затем прошёл `requirePatientApiBusinessAccess()` и вернул ответ. Gate остался зелёным:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec node scripts/check-patient-api-business-access-door.mjs"
```

Вывод на инъекции: `patient API business access door: OK (107 handlers, 97 guarded routes, 3 explicit exceptions)`.

Это ровно обход класса из brief: route читает patient protected data без shared pass, а structural gate не видит нарушение. Инъекция откатана; команда проверки чистоты до записи этого audit-файла:

```bash
git status --short
```

Вывод был пустой.

## MUST FIX-2 — structural gate не сканирует реальный patient route с расширением `route.js`

Метод: RUN + LOOK.

Результат: FAIL. Временный реальный route `apps/webapp/src/app/api/patient/audit-js-slip/route.js` с `export async function GET()` остался вне переписи, потому что `collectRouteFiles` берёт только имя `route.ts`. Gate остался зелёным:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec node scripts/check-patient-api-business-access-door.mjs"
```

Вывод на инъекции: `patient API business access door: OK (106 handlers, 96 guarded routes, 3 explicit exceptions)`.

Поиск текущих не-TS route-файлов:

```bash
node /home/dev/brain/tools/code-search.mjs "route.js patient api route handler" --repo bcb -k 20
rg --files apps/webapp/src/app/api | rg '/route\.(js|jsx|tsx)$'
```

`code-search` не нашёл существующий patient `route.js`; точный `rg` вернул пусто. Но новый `route.js` под `/api/patient/**` является route handler surface, а gate его не видит. Инъекция откатана; команда проверки чистоты до записи этого audit-файла:

```bash
git status --short
```

Вывод был пустой.

## 1. Named Route: `GET /api/patient/material-ratings`

Метод: RUN + LOOK.

Результат: PASS. `GET` идёт через `requirePatientApiBusinessAccess({ returnPath: routePaths.patient, businessAccess: 'optional' })`; after-deadline refusal, soft period allow и activation-pending aggregate-only поведение проверены route/guard тестами.

Команды:

```bash
node /home/dev/brain/tools/code-search.mjs "patient material-ratings requirePatientApiBusinessAccess businessAccess optional" --repo bcb -k 10
rg -n "requirePatientApiBusinessAccess|businessAccess: 'optional'|patientEmailGateForProtectedData|getOptionalPatientSession|patientClientBusinessGate" apps/webapp/src/app-layer/guards/requireRole.ts apps/webapp/src/app/api/patient/material-ratings/route.ts apps/webapp/src/app/api/patient/material-ratings/route.route.test.ts
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/modules/platform-access/patientEmailGatePolicy.unit.test.ts src/app-layer/guards/requireRole.patientEmailGate.unit.test.ts src/app/api/patient/material-ratings/route.route.test.ts src/app/api/patient/organization-context/route.route.test.ts src/shared/lib/webPush/patientWebPushApi.unit.test.ts"
```

Последний прогон: `5 passed (5)`, `30 passed (30)`.

Fault injection: временно заменил отказ `GET` на успешный JSON при `!gate.ok`. Команда:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/app/api/patient/material-ratings/route.route.test.ts"
```

Результат: FAIL, тест `refuses GET after the email deadline without reading rating data`, `expected 403`, got `200`. Инъекция откатана.

## 2. `businessAccess: 'optional'`

Метод: RUN + LOOK.

Результат: PASS. Optional path relaxes activation/stale-session handling, but email gate still runs before patient principal/module/data flow. The observed API result after deadline is still `patient_email_required`.

Команды:

```bash
sed -n '990,1125p' apps/webapp/src/app-layer/guards/requireRole.ts
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/app-layer/guards/requireRole.patientEmailGate.unit.test.ts"
```

Fault injection: temporarily wrapped `patientEmailGateForProtectedData` in `if (!optionalBusinessAccess)`. Result:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/app-layer/guards/requireRole.patientEmailGate.unit.test.ts"
```

Результат: FAIL, тест `keeps the email door on activation-pending aggregate reads`, `expected true to be false` at the after-deadline assertion. Инъекция откатана.

## 3. Structural Gate Coverage

Метод: LOOK + RUN.

Результат: FAIL из-за MUST FIX-1 и MUST FIX-2. Self-test работает для уже перечисленных fixtures, но не закрывает весь заявленный класс.

Команды:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec node scripts/check-patient-api-business-access-door.mjs --self-test"
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec node scripts/check-patient-api-business-access-door.mjs"
```

Self-test вывод: `6 bypass fixtures red`, `5 canonical fixtures green`; tree check: `106 handlers`, `96 guarded routes`, `3 explicit exceptions`.

Дополнительные инъекции в реальный `apps/webapp/src/app/api/patient/audit-slip/route.ts`, которые gate поймал красным:

- guard inside `try`: `1 violation(s)`, `patient/audit-slip/route.ts: exported GET must fail closed...`
- guard inside `if`: `1 violation(s)`, same message.
- `if (gate.ok === false) return gate.response`: `1 violation(s)`, same message.
- `export { handler as GET }`: `1 violation(s)`, same message.
- `export const GET = wrap(async () => ...)`: `1 violation(s)`, same message.
- `export { handler as GET } from './handler'`: `1 violation(s)`, same message.

Каждый раз команда была:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec node scripts/check-patient-api-business-access-door.mjs"
```

## 4. Exception List

Метод: LOOK.

Результат: PASS. Три исключения соответствуют oracle: привязка/подтверждение email, запрос контакта для activation, support. В прочитанных route bodies клинические данные не возвращаются пользователю while excepted.

Где искал:

```bash
node /home/dev/brain/tools/code-search.mjs "patient email-change confirm route latest pending email challenge" --repo bcb -k 10
node /home/dev/brain/tools/code-search.mjs "patient messenger request-contact route patientClientBusinessGate requestMessengerContact" --repo bcb -k 10
node /home/dev/brain/tools/code-search.mjs "patient support route relaySupportSubmission patientClientBusinessGate" --repo bcb -k 10
sed -n '1,220p' apps/webapp/src/app/api/patient/email-change/confirm/route.ts
sed -n '1,220p' apps/webapp/src/app/api/patient/messenger/request-contact/route.ts
sed -n '1,240p' apps/webapp/src/app/api/patient/support/route.ts
```

Итог по исключениям:

- `patient/email-change/confirm/route.ts`: confirms pending email challenge, returns `{ ok: true }` / merge prompt / errors; no clinical data response.
- `patient/messenger/request-contact/route.ts`: requests contact via integrator only for `need_activation`; no clinical data response.
- `patient/support/route.ts`: support escape; sends user-provided support payload plus account/contact metadata to operator relay, no clinical data response to patient.

## 5. Widening `926a9b9e3`

Метод: LOOK + independent recount.

Результат: PASS for regression check, aside from the structural slips above. The widening brings into scope routes that import the shared patient guard outside `/api/patient/**` and non-public `/api/booking/**`; I did not find unrelated routes pulled in.

Commands:

```bash
git diff f1c5cd410 926a9b9e3 -- apps/webapp/scripts/check-patient-api-business-access-door.mjs
node --input-type=module -e 'import fs from "node:fs"; import path from "node:path"; import ts from "typescript"; const apiRoot=path.resolve("apps/webapp/src/app/api"); const http=new Set(["GET","POST","PUT","PATCH","DELETE"]); const exceptions=new Set(["patient/email-change/confirm/route.ts","patient/messenger/request-contact/route.ts","patient/support/route.ts"]); const files=[]; function walk(d){ for(const e of fs.readdirSync(d,{withFileTypes:true})){ const f=path.join(d,e.name); if(e.isDirectory()) walk(f); else if(e.name==="route.ts") files.push(f); } } function inPath(rel){ return rel.startsWith("patient/") || (rel.startsWith("booking/") && !rel.startsWith("booking/public/")); } function importsGuard(source){ const sf=ts.createSourceFile("x.ts",source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS); return sf.statements.some(s=>ts.isImportDeclaration(s)&&ts.isStringLiteral(s.moduleSpecifier)&&s.moduleSpecifier.text==="@/app-layer/guards/requireRole"&&s.importClause?.namedBindings&&ts.isNamedImports(s.importClause.namedBindings)&&s.importClause.namedBindings.elements.some(el=>["requirePatientApiBusinessAccess","requirePatientBookingTrustedPhoneAccess"].includes(el.propertyName?.text??el.name.text))); } function handlers(source, rel){ const sf=ts.createSourceFile(rel,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS); let n=0; for(const s of sf.statements){ const exported=!!s.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword); if(exported&&ts.isFunctionDeclaration(s)&&s.name&&http.has(s.name.text)) n++; if(exported&&ts.isVariableStatement(s)){ for(const d of s.declarationList.declarations) if(ts.isIdentifier(d.name)&&http.has(d.name.text)) n++; } if(ts.isExportDeclaration(s)&&s.exportClause&&ts.isNamedExports(s.exportClause)){ for(const el of s.exportClause.elements) if(http.has(el.name.text)) n++; } } return n; } walk(apiRoot); let routeCount=0, handlerCount=0, exceptionCount=0, widened=0; const unrelated=[]; for(const file of files){ const rel=path.relative(apiRoot,file).split(path.sep).join("/"); const source=fs.readFileSync(file,"utf8"); const widenedOnly=!inPath(rel)&&importsGuard(source); if(!inPath(rel)&&!widenedOnly) continue; routeCount++; handlerCount+=handlers(source,rel); if(exceptions.has(rel)) exceptionCount++; if(widenedOnly) widened++; if(!rel.startsWith("patient/")&&!rel.startsWith("booking/")) unrelated.push(rel); } console.log(JSON.stringify({routeCount,handlerCount,exceptionCount,widenedOnlyRoutes:widened,nonPatientBookingRoutes:unrelated},null,2));'
rg -n "requirePatientApiBusinessAccess|requirePatientBookingTrustedPhoneAccess" apps/webapp/src/app/api/media -g 'route.ts'
```

Independent recount output: `routeCount: 96`, `handlerCount: 106`, `exceptionCount: 3`, `widenedOnlyRoutes: 5`. The 5 widened-only routes are:

- `media/[id]/hls/[[...path]]/route.ts`
- `media/[id]/playback/events/route.ts`
- `media/[id]/playback/route.ts`
- `media/[id]/preview/[size]/route.ts`
- `media/[id]/route.ts`

These are media delivery/playback surfaces with patient branches calling `authorizeMediaDelivery` or playback event recording after `requirePatientApiBusinessAccess`.

## 6. Neighboring Surfaces / Affected Sets

Метод: RUN.

Результат: PASS for targeted tests. Full CI was not run by brief.

Commands:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/modules/platform-access/patientEmailGatePolicy.unit.test.ts src/app-layer/guards/requireRole.patientEmailGate.unit.test.ts src/app/api/patient/material-ratings/route.route.test.ts src/app/api/patient/organization-context/route.route.test.ts src/shared/lib/webPush/patientWebPushApi.unit.test.ts"
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec node scripts/check-patient-api-business-access-door.mjs --self-test"
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec node scripts/check-patient-api-business-access-door.mjs"
```

Results: targeted Vitest `5 passed (5)`, `30 passed (30)`; self-test `6 bypass fixtures red`, `5 canonical fixtures green`; tree check `106 handlers`, `96 guarded routes`, `3 explicit exceptions`.

## Вопросы владельцу

Нет.

## НЕ СДЕЛАНО

- Fixes for MUST FIX-1 and MUST FIX-2 were not implemented: auditor role only.
- Full CI was not run: forbidden by brief for this audit.
- No DEV migration execute, TEST, PROD, deploy, push, or second Next server was run.

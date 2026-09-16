# Разобрано 176 маршрутов (`rg --files apps/webapp/src/app/api/doctor -g 'route.ts' | wc -l` → `176`); MUST FIX: 2 (`awk 'BEGIN{n=0} /^\| MUST FIX \|/{n++} END{print n}' docs/_TODO/AUDIT_DOCTOR_DOORS_A2_2026-09-16.md` → `2`)

## Вердикт

А2 не проходит аудит: два системных разрыва затрагивают 51 mutating handler в 43 route-файлах. Из них 45 handlers
не вызывают общую cabinet-wide mutation door, а ещё 6 handlers в mechanic-bearing поверхностях не вызывают
mechanic-specific mutation door. Обход достижим в состоянии `read_only`: workspace door намеренно сохраняет
чтение, после чего handler пишет данные. Продуктовый код и тесты в этом этапе не менялись.

Строка для ведущего: `A2 FAIL — 176/176 doctor-маршрутов и 251/251 HTTP-обработчиков разобраны; MUST FIX 2 (51 handler в 43 route-файлах: 45 cabinet-wide + 6 mechanic-specific); чтений через порт до двери 0; выборка tenant isolation 20/20 чистая.`

## Authority и способ проверки

Authority: `docs/_TODO/API_DOORS_BY_AREA_2026-09-16.md` §А2; `AGENTS.md` §1, §5, §10a, §10b и §24;
`docs/ARCHITECTURE/AUTH_AND_IDENTITY_CANON.md` §21; tenant-wall canon
`docs/_TODO/SAAS_FOUNDATION/TENANT_WALLS_AND_ACCESS_MODEL.md` §§1, 5–6; тарифный canon
`docs/_TODO/SAAS_FOUNDATION/QUOTAS_AND_MECHANICS_DESIGN_2026-07-28.md` §§4–4a и более новый owner-пункт
`docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md` T13 (20.08).

Классификация до проверки по §24.4:

- канон двери, применимость entitlement, порядок и tenant source — **ВЗГЛЯД**;
- полнота 176 маршрутов и 251 handler — машинная AST-перепись плюс чтение кандидатов;
- достижимость найденного обхода — **ВЗГЛЯД** на цепочку `read_only → module visible → write`; инъекция не
  понадобилась;
- постоянный census-тест и автоматические UI-тесты не создавались: они закрепили бы форму дерева, а не поведение.

До чтения route-тестов использован kill-set из authority:

1. doctor handler не устанавливает клинический/более строгий principal;
2. mutation проходит при `read_only` или выключенной механике;
3. чужая дверь расширяет доступ относительно назначения маршрута;
4. продуктовый порт читается до двери;
5. организация mutation берётся из body/query, а не из principal двери.

## Машинная перепись всех 176 маршрутов

Плановые числа подтверждены отдельно:

```text
rg --files apps/webapp/src/app/api/doctor -g 'route.ts' | wc -l
→ 176

rg -l 'requireDoctorWorkspaceApiContext' apps/webapp/src/app/api/doctor -g 'route.ts' | wc -l
→ 139

rg -l 'requireEntitlementForMutation' apps/webapp/src/app/api/doctor -g 'route.ts' | wc -l
→ 70
```

139 и 70 — числа route-файлов, а не handlers. Полный method-level список построен существующим общим разбором
`tools/lib/next-route-handlers.mjs` из repo commit `8c124c389`. В текущем `HEAD=f0c8f8a8d` файл ещё отсутствует;
поэтому он загружен через `git show` в память, без сохранения второго парсера. Команда переписи:

```bash
node --input-type=module <<'NODE'
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
const tsUrl = pathToFileURL(execFileSync(process.execPath, ['-p', "require.resolve('typescript')"], { encoding: 'utf8' }).trim()).href;
let source = execFileSync('git', ['show', '8c124c389:tools/lib/next-route-handlers.mjs'], { encoding: 'utf8' });
source = source.replace("import ts from 'typescript';", `import ts from '${tsUrl}';`);
const { analyzeNextRouteFile } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const root = 'apps/webapp/src/app/api/doctor';
const files = execFileSync('find', [root, '-name', 'route.ts'], { encoding: 'utf8' }).trim().split('\n').sort();
let handlers = 0; let issues = 0; const inventory = [];
for (const file of files) {
  const result = analyzeNextRouteFile(path.resolve(file));
  handlers += result.handlers.length; issues += result.issues.length;
  inventory.push(`${file.slice(root.length + 1)}\t${result.handlers.map((h) => h.method).sort().join(',')}`);
}
const text = `${inventory.join('\n')}\n`;
process.stdout.write(text);
console.error({ routes: files.length, handlers, issues, sha256: createHash('sha256').update(text).digest('hex') });
NODE
```

Результат: `routes=176`, `handlers=251`, `issues=0`, SHA-256 полного отсортированного списка
`c1654231d9ad21fd1a3f0d4bb728d32bb7e1bcb9ca36a9e3de1a6d66a1eeec48`.

Контрольный срез по первому сегменту (сумма 176):

```text
account:3 account-merge-conflicts:2 analytics:5 analytics-metric-accounts:1 appointments:1
booking-engine:27 clients:21 clinical-tests:2 comments:5 content-stats:1 courses:3
exercise-comments:1 health-failure-archive:1 leads:2 material-ratings:4 measure-kinds:1 messages:6
notification-templates:1 patients:31 payments:1 pending-program-tests:1 recommendations:2 references:1
schedule:1 schedule-kpis:1 settings:1 tasks:3 test-sets:3 treatment-program-instances:27
treatment-program-promo:2 treatment-program-templates:14 workspace:1
```

## Канон докторской двери

Каноническая дверь — `requireDoctorWorkspaceApiContext` в
`apps/webapp/src/app-layer/guards/requireRole.ts:767-805`.

Она гарантирует:

- есть действующая staff-сессия роли, допущенной в doctor surface;
- `resolveDoctorWorkspaceAccessContext` разрешил активную membership и обязательную staff-factor verification;
- контекст имеет capability `clinical.workspace`; источник capability — доверенные session/membership facts, а не
  request body;
- `organizationId`, membership, specialist и role взяты из membership resolver;
- в request-local DB context ставится principal `staff` с `organizationId` и `platformUserId`; физическая DB-роль
  и signed context применяются общим DB-портом, а не SQL внутри guard;
- terminal cabinet states `disabled`/`unconfigured` закрыты; `read_only` намеренно допускает чтение;
- для известных API-path дополнительно применяется workspace-module projection. Для rehabilitation она видима и
  в `read_only`, поэтому этот projection не заменяет mutation entitlement.

Она не гарантирует entitlement конкретной механики и не даёт clearance на запись в `read_only`.

`requireEntitlementForMutation` (`requireEntitlement.ts:271-296`) принимает только server-derived
`{ organizationId }`, проверяет cabinet lifecycle и, если передан mechanic, его entitlement. T13 (20.08) прямо
расширил существующий chokepoint на mechanic-less writes: `read_only` — свойство всего кабинета, включая mutation,
не принадлежащие тарифной механике; комментарий в реализации называет создание карточки пациента примером. Отказ возвращает
`403` (`entitlement_required`, `commercial_read_only`, `commercial_blocked` либо
`access_lifecycle_unconfigured`). Успех для mechanic ставит request-local write clearance, которую может требовать
физический service boundary.

Следовательно, class «никогда» означает только «нет отдельного mechanic toggle». Он не разрешает clinic product
write при cabinet `read_only`. Старые exemptions 31.07 в `protectedActionRegistry.ts`, называющие patient card и
diaries «never tariff-gated», не были сведены с более новым T13: они не являются authority на обход общей
mechanic-less mutation door.

Именно поэтому «дверь есть» не означает «дверь та»: workspace door доказывает личность/организацию/роль и допускает
read-only кабинет, а mutation door отдельно запрещает запись.

## Разрыв mutations и возможностей тарифа

AST нашёл 145 handlers с HTTP-методом `POST|PUT|PATCH|DELETE`; 63 не содержат прямой вызов
`requireEntitlementForMutation`. Ещё два `GET` пишут только audit-журнал. Каждый из этих handlers разобран ниже.

| Handler (строка export) | Классификация | Доказательство |
|---|---|---|
| `account-merge-conflicts/[conflictId] POST:43` | **дыра T13** | Clinic product write: merge/refuse medical conflict. Identity canon задаёт семантику, но не исключает его из cabinet `read_only`. |
| `account/doctor-screens PATCH:12`; `account/email DELETE:8`; `account/timezone POST:28` | вне тарифных возможностей | Account-self/security/preferences; двери соответственно organization-management или same-session doctor account, не clinic product mechanic. |
| `booking-engine/appointments/[id]/comments POST:35, DELETE:82`; `.../[id]/delete POST:13`; `.../manual-cancel POST:29`; `.../manual-no-show POST:21`; `.../manual-reschedule POST:58`; `appointments/manual-patient-visit POST:106`; `appointments/manual POST:82` | **дыра T13** | Это не обязательно mechanic `booking`, но все восемь — clinic product writes. Отсутствие отдельного toggle требует no-arg mutation door, а не обхода cabinet `read_only`. |
| `booking-engine/patient-packages/[id]/consume POST:17` | вне тарифных возможностей | Явный `retainedMembershipAccess`: купленный абонемент и расходование сохраняются при выключении subscriptions (`protectedActionRegistry.ts:686-701`). |
| `clients/[userId]/archive PATCH:13`; `block POST:14`; `booking-profile PATCH:66`; `notes POST:43`; `supplementary-contacts POST:56`; `supplementary-contacts/[contactId] DELETE:14` | **дыра T13** | Patient/card clinic writes. Для них нет отдельного mechanic toggle, но нет и более нового recovery-exemption из общей cabinet mutation door. |
| `clients/[userId]/lfk-complex-exercises/[exerciseRowId] PATCH:15`; `symptom-trackings POST:85, PATCH:143` | **дыра T13** | `patient_diaries` не имеет mechanic toggle, однако T13 позже требует no-arg door для product writes вне mechanics. |
| `clients/[userId]/permanent-delete POST:13` | не mutation | Fail-closed legacy endpoint всегда возвращает `409 account_purge_disabled`, product port не вызывает. |
| `clients/[userId]/support-settings PATCH:72` | **дыра T13** | Это настройка сопровождения пациента, не технической поддержки платформы. Отдельной mechanic нет, поэтому нужна no-arg door. |
| `clients/support-account POST:37` | вне тарифных возможностей | Platform-only support operation за `requirePlatformOperationsApiContext`, не clinic tariff. |
| `comments POST:87`; `comments/[id] PATCH:63, DELETE:108` | **дыра T13** | Отдельного mechanic toggle нет, но это clinic product writes; module preference не заменяет cabinet mutation door. |
| `leads/[id] PATCH:28` | mutation-gate в общем helper | `withDoctorLeadsApiAccess('mutation', ...)` вызывает `requireEntitlementForMutation(ctx, 'leads')` до callback (`withDoctorLeadsApiAccess.ts:30-52`). |
| `measure-kinds POST:35, PATCH:64` | **дыра mechanic** | Каталог клинических тестов меняется без `exercise_catalog` mutation gate; route даже не входит в module projection. |
| `messages/[conversationId]/read POST:37`; `messages/[conversationId] POST:102`; `messages/conversations/ensure POST:15` | **дыра T13** | Переписка не имеет отдельного toggle, но mark-read/send/create-conversation — clinic product writes. Org principal/channel policy не проверяют cabinet lifecycle. |
| `messages/conversations/unread-by-patient POST:13` | чтение, замаскированное под POST | Только org-scoped unread count, writes отсутствуют. |
| `notification-templates PUT:108` | mutation-gate в local helper | `requireTemplateManagement('mutation')` вызывает `requireEntitlementForMutation(ctx, 'branding')` до body и write. |
| `notification-templates POST:150` | чтение, замаскированное под POST | Synthetic preview: только parse/render, recipient lookup/queue/provider/write отсутствуют. |
| `patients/[userId]/anamnesis POST:93, PATCH:189`; `comorbidities POST:67`; `comorbidities/[comorbidityId] PATCH:41, DELETE:132`; `complaints POST:16`; `complaints/[complaintId] PATCH:27`; `complaints/[complaintId]/updates POST:18`; `diagnoses POST:14`; `diagnoses/[diagnosisId] PATCH:27`; `diagnoses/[diagnosisId]/status PATCH:31`; `diagnosis-catalog POST:48`; `fio PATCH:54`; `physical PATCH:72`; `route PATCH:104`; `visits POST:97`; `visits/[visitId] PATCH:39` | **дыра T13** | Ровно пример T13: patient card не имеет mechanic toggle, но cabinet-wide `read_only` обязан запрещать запись через no-arg mutation door. Старые registry exemptions предшествуют T13. |
| `patients/[userId]/email-change POST:35` | вне тарифных возможностей | Identity/contact verification; безопасность аккаунта входит в «никогда не ограничиваем». |
| `patients/[userId]/files/[fileId] DELETE:95` | recovery exemption | Явное exemption: удаление должно оставаться доступным, чтобы освободить исчерпанную files quota (`protectedActionRegistry.ts:1712-1717`). |
| `patients/[userId]/portal-invite POST:90, DELETE:155` | **дыра T13** | `patient_app` не имеет mechanic toggle, но clinic-side invite issue/revoke остаются product writes и требуют общей door. |
| `clients/[userId]/treatment-program-instances POST:54` | **дыра mechanic** | Назначает template/создаёт blank program; соседние instance mutations требуют `exercise_catalog`. Rehabilitation module пропускает `read_only`. |
| `recommendations/[id] PATCH:47, DELETE:106` | **дыра mechanic** | Create и action-варианты update/archive уже требуют `exercise_catalog`; эти два route handlers пишут без gate. |
| `references/[categoryCode] POST:54` | **дыра mechanic** | Route отнесён к rehabilitation, но module projection пропускает `read_only`; `insertItem` выполняется без mutation gate. |
| `settings PATCH:75` | **дыра T13** | Handler смешивает security key с clinic product preferences/support defaults; как минимум product branches пишут без общей door. Нужна branch-specific exemption для security, а не обход всего handler. |
| `patients GET:19 → recordPatientListView:63`; `patients/[userId] GET:56 → recordPatientCardOpen:94` | mutating port внутри GET, вне тарифа | Пишется только журнал доступа. Канон §4 относит журнал операций к «никогда не ограничиваем»; продуктовые данные не меняются. |

Итого по 63 syntactically mutating handlers без прямого gate: 51 дыра; 2 effective helper-gate; 3 не-mutating
handler; 5 account/identity/platform writes вне clinic commercial lifecycle; 2 явных recovery/retained exemptions.
Два mutating `GET` пишут только обязательный audit-журнал и не являются product mutation.

## Findings

| Уровень | Затронуто | Достижимый сценарий и impact | Нарушенное требование |
|---|---|---|---|
| MUST FIX | 45 handlers / 39 route-файлов, помеченные выше **дыра T13** | Организация находится в global cabinet `read_only`; workspace door разрешает чтение, handler не вызывает `requireEntitlementForMutation(ctx)` и product write проходит. Impact: «только чтение» не является только чтением для booking, patient card/diaries, chat, profile и clinic settings. | T13: mechanic-less mutation идёт через общую door; реализация прямо называет patient-card create примером. А2 требует проверить каждый write, а не принять разницу 139/70. |
| MUST FIX | 6 handlers / 4 route-файла, помеченные выше **дыра mechanic** | При `exercise_catalog=read_only`/disabled отсутствующая specific door разрешает изменение measure kinds, назначение программы, update/archive recommendations и reference insert; module visibility либо отсутствует, либо разрешает read-only. | А2; существующие mappings/sibling handlers закрепляют `exercise_catalog` как mechanic этих write surfaces. |

Предложение отдельному fix/test-этапу: не размазывать 51 новую проверку и 51 source-test. Параметризовать существующую
workspace door режимом `read|mutation` и optional mechanic либо иначе сделать пропуск mutation-door конструктивно
невозможным в существующем chokepoint. Поведенческий oracle нужен для двух независимых классов: mechanic-less
clinic write и `exercise_catalog` write при `read_only`; fault injection снимает соответствующую door и должен
получить успешный write вместо `403`. Census исходников и UI-тест не нужны.

## Чужие двери

### Внутри `/api/doctor/**`

AST нашёл 37 route-файлов, где handler не вызывает `requireDoctorWorkspaceApiContext` напрямую или через local
function. По каждому фактическая дверь прочитана:

| Маршрут(ы) | Фактическая дверь | Ужесточение/ослабление |
|---|---|---|
| `account/doctor-screens` | `requireAdminWorkspaceApiContext` | Ужесточение: только organization management может менять собственную doctor-screen preference. |
| `account/email`; `account/timezone` | `requireDoctorApiSession` | Не ослабление: account-self операции не читают org product data и действуют только на session user. |
| `booking-engine/appointments/[id]/{comments,delete,lifecycle,manual-cancel,manual-no-show,manual-reschedule,package/detach,package/refund,package/unlink,payment}`; `appointments/{feed,manual-patient-visit,manual}`; `calendar`; `overview`; `packages`; `packages/[id]`; `patient-packages`; `patient-packages/{sold}`; `patient-packages/[id]/{consume,recalc,sessions}`; `patient-packages/[id]`; `services`; `working-days`; `working-hours`; `working-schedule-templates`; `schedule/nearest-free-window`; `schedule-kpis` | `requireDoctorBookingEngine` → `requireOrganizationWorkspaceApiContext` | Намеренное расширение с clinical doctor на clinic manager для общей записи; не platform/patient access. Затем own/all-specialists policy сужает конкретную запись. Org берётся только из resolved membership. |
| `clients/support-account` | `requirePlatformOperationsApiContext` | Ужесточение: platform support only; doctor не достигает операции. |
| `leads`; `leads/[id]` | `withDoctorLeadsApiAccess` → `requireClinicManagementApiContext` | Ужесточение: management capability + leads entitlement; обычный врач не проходит. |
| `notification-templates` | `requireTemplateManagement` → `requireClinicManagementApiContext` | Ужесточение: clinic management + branding entitlement для write. |
| `payments/history` | `requireClinicManagementApiContext` | Ужесточение: история организации доступна management, не обычному врачу. |

### Докторская дверь вне `/api/doctor/**`

Точная команда `rg -l 'requireDoctorWorkspaceApiContext' apps/webapp/src/app/api --glob 'route.ts' | rg -v '/api/doctor/' | wc -l` → `17`.

- семь `api/admin/media/**` уже разобраны в А1: это clinic-scoped doctor media library под историческим admin URL;
  не platform ослабление;
- `api/media/[id]/{hls,playback,playback/events,preview}` и `api/media/[id]` имеют две явные ветки: doctor door для
  staff и patient business door для patient; чужая дверь не заменяет пациентскую;
- `api/media/[id]/original` намеренно specialist-only и дополнительно проверяет uploader — ужесточение;
- `api/media/{confirm,multipart/init,presign,upload}` — staff media-write endpoints: doctor door соответствует
  фактическому principal организации, patient/platform обхода нет.

Ослабления роли из-за чужой двери не найдено.

## Порядок двери

AST-кандидаты, где применимая дверь не является первым syntactic call, прочитаны по исходнику:

| Handler | Что стоит до двери | Есть product-port read до двери |
|---|---|---:|
| `booking-engine/appointments/[id]/payment GET:46, POST:74` | `context.params`; затем первый helper `resolveAppointmentPaymentContext` немедленно вызывает `requireDoctorBookingEngine` | нет |
| `clients/[userId]/permanent-delete POST:13` | более строгая preliminary `requireAdminApiContext` | нет |
| `leads GET:4` | parse `request.url`/query | нет |
| `material-ratings/{aggregate,detail,summary} GET:13/31/18` | parse query, потому что `kind` выбирает module projection | нет |
| `patients/[userId]/email-change POST:35, GET:122` | `ensureAuthModulePortsBound()` — DI wiring, не чтение данных | нет |
| `treatment-program-instances/[instanceId]/media-presign POST:29` | локальная проверка `isS3MediaEnabled(env)` и возможный `501` | нет |

Итог: 10 handlers не начинают с применимой двери синтаксически; `0` читают данные через порт до двери. Команда
кандидатов использовала `handlerCandidateBodies()` общего AST-модуля; каждый кандидат затем прочитан.

## Изоляция арендатора — выборка 20 mutations

Проверены 20 handlers из разных подсистем. Во всех `organizationId` приходит из `gate.ctx`/`ctx` общего helper
либо устанавливается `withDoctorWorkspacePrincipal(gate.ctx, ...)`; ни один body/query не выбирает организацию.

| Handler | Источник organization |
|---|---|
| account merge conflict POST | `gate.ctx.organizationId` → service (`:63`, `:82`) |
| appointment comments POST | `gate.ctx.organizationId` → command (`:50-61`) |
| manual appointment POST | `ctx.organizationId` → create (`:162-172`) |
| patient-package consume POST | `gate.ctx.organizationId` (`:32`) |
| leads PATCH | helper `ctx.organizationId` (`leads/[id]/route.ts:42-54`) |
| client archive PATCH | resolved patient + `gate.ctx.organizationId` (`:31-41`) |
| booking-profile PATCH | resolved client + principal; payload gets `gate.ctx.organizationId` (`:82-88`) |
| support-settings PATCH | resolved client + `gate.ctx.organizationId` (`:91-106`) |
| symptom tracking POST | patient resolved in gate org; write payload gets `gate.ctx.organizationId` (`:100-116`) |
| treatment-program assignment POST | patient resolved in gate org; assignment gets `gate.ctx.organizationId` (`:73-84`) |
| program comment POST | instance compared/resolved inside `gate.ctx.organizationId`; write under staff principal (`comments/route.ts:88-113`) |
| chat send POST | conversation org equality + `gate.ctx.organizationId`; write under principal (`messages/[conversationId]/route.ts:119-143`) |
| anamnesis POST | patient resolved with `gate.ctx.organizationId`; write under principal (`:124-175`) |
| comorbidity DELETE | patient/item resolved in gate org; write under principal (`:149-160`) |
| visit POST | patient resolved in gate org; payload org from `gate.ctx` (`:136-156`) |
| portal invite POST | patient resolved in gate org; issued invite gets `gate.ctx.organizationId` (`:102-126`) |
| recommendation PATCH | `withDoctorWorkspacePrincipal(workspace, ...)` (`recommendations/[id]/route.ts:90-94`) |
| reference item POST | `withDoctorWorkspacePrincipal(gate.ctx, ...)` (`references/[categoryCode]/route.ts:71-87`) |
| measure kind PATCH | `withDoctorWorkspacePrincipal(gate.ctx, ...)` (`measure-kinds/route.ts:76-77`) |
| doctor settings PATCH | write options `{ organizationId: gate.ctx.organizationId }` (`:98`, `:138`) |

Дополнительный exact search:

```text
rg -n "(parsed|body|raw|searchParams|query).*(organizationId|organization_id)|(organizationId|organization_id).*(parsed|body|raw|searchParams|query)" apps/webapp/src/app/api/doctor --glob 'route.ts'
→ 4 совпадения; все четыре передают `gate.ctx.organizationId` рядом с parsed entity id, ни одно не читает org из request
```

Организация из body/query не найдена; finding первого класса по tenant isolation отсутствует.

## ВОПРОСЫ ВЛАДЕЛЬЦУ

Пусто. Оба системных MUST FIX имеют прямую опору в А2 и действующем тарифном canon; новых продуктовых решений
не требуют.

## НЕ СДЕЛАНО

- Продуктовый код не исправлялся: этап — разбор.
- Новые тесты, UI-тесты, инъекция и полный CI не запускались; для двух классов bypass предложен отдельный
  поведенческий test-этап по наблюдаемому `403`, без census/source-тестов по каждому route.
- PROD, TEST, DEV-БД, миграции и второй Next-сервер не трогались.
- `tools/lib/next-route-handlers.mjs` не переносился в ветку: использован существующий repo-вариант из
  `8c124c389` in-memory, временных файлов нет.

# C3M-06 specialist shell/routes audit — product candidate `557f2caa4`

- Taskdb: `#1098`
- Authority: `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md`, C3M owner decisions and `C3M-06`
- Role: `auditor-live`
- Product candidate: `557f2caa436c70f3a7c79170987a11381c7c4b28`
- Audited tree: `8a83a0788be0dcf82d55e6f3886c9636b9a8ccc0` (candidate merged with the latest accepted C3M-04 branch before audit)
- Scope: existing C3M-06 candidate only; no product fixes and no later C3M-07…11 server enforcement

## Test or look classification

- Resolver projection, route/page guards, first-effective communications tab and conditional bootstrap/fetches: stable behavior; verify through the cheapest public resolver/loader/route tests.
- Labels, responsive desktop/mobile navigation, patient-card tab layout and clean absence of disabled surfaces: live desktop/mobile inspection on an isolated DEV port.
- One accepted resolver/shell, no forked registries or second effective formula: full candidate diff and architecture inspection; no source-text test.
- Preserved always-on surfaces and unchanged Today presentation: diff inspection plus live desktop/mobile regression pass.

## Blind kill-set (written before reading candidate tests)

1. `C3M06-K1 navigation parity`: desktop and mobile project different effective modules, or one navigation path still exposes a disabled module.
2. `C3M06-K2 reachability`: a card surface removed from tabs remains reachable through a direct page, cross-link or header CTA.
3. `C3M06-K3 independent card modules`: card projection conflates `medical_record` and `encounters`; `Карта` must remain when either is effective, while `ЛФК` follows only `rehabilitation`.
4. `C3M06-K4 communications fallback`: Communications remains with no effective child, opens a disabled query tab, or bootstraps comments/chat/mailings for a hidden tab instead of selecting the first effective child.
5. `C3M06-K5 hidden work`: a hidden item still starts an unread provider, poller, badge query or server bootstrap/preload.
6. `C3M06-K6 always-on regression`: Today, schedule/booking, clients, basic Overview notes, tasks, files or account disappear, or Today presentation changes.
7. `C3M06-K7 availability/defaults`: missing preferences stop preserving current available surfaces, or a preference expands a capability that availability denies.
8. `C3M06-K8 one chokepoint`: shell/nav/tab registries fork or any consumer reimplements `actorCapability && featureAvailable && workspaceEnabled` instead of consuming the accepted loader/resolver.

## Findings

### `C3M06-A1` — BLOCKER: patient-card bootstrap ignores independent medical/encounter effective flags

Reachable scenarios:

1. With both `medical_record=OFF` and `encounters=OFF`, opening the always-on patient Overview still calls
   `patientClinical.getClinicalState()` and `patientClinical.listVisits()`.
2. With `medical_record=OFF`, `encounters=ON`, the combined `Карта` tab correctly remains available, but its
   bootstrap still calls the disabled medical half: `getClinicalState()`, `getAnamnesis()` and
   `patientComorbidities.listActive()`.
3. With `medical_record=ON`, `encounters=OFF`, the same `Карта` bootstrap still calls the disabled encounter half:
   `listVisits()`.

Impact: switching a module OFF does not stop its patient-card data work; the direct Overview/`Карта` path keeps a
disabled module's server preload alive. This violates the C3M-06 owner checkbox — project the resolver into lazy
bootstrap/fetches and leave no hidden preload — and the C3M.3 single effective projection. Later C3M-07a/07b
mutation/API enforcement is not required to reproduce or fix this loader projection defect.

Exact production seam: `apps/webapp/src/app/app/doctor/patients/loadDoctorPatientCardPageBootstrap.ts`, Overview
`Promise.allSettled` and `activeTab === 'karta'` bootstrap branches. Exact regression oracle:
`apps/webapp/src/app/app/doctor/patients/loadDoctorPatientCardPageBootstrap.workspaceProjection.unit.test.ts`.

Verdict: **BLOCKED**, one product correction required. No product fix was made by this audit.

## Evidence

### Kill-set disposition

| Fault | Result | Evidence |
| --- | --- | --- |
| K1 desktop/mobile parity | PASS | One `getDoctorMenuItems` projection feeds sidebar, sheet and bottom nav; unit oracle plus live all-on/OFF views. |
| K2 disabled reachability | PASS in C3M-06 scope | Legacy chat/comments/mailings redirects and a representative LFK direct layout fail closed; disabled card tabs resolve to page-404. Later medical/encounter inner-content enforcement remains C3M-07a/07b. |
| K3 independent card modules | PASS for registry, FAIL for preload under A1 | All four `medical_record` × `encounters` tab combinations pass; loader halves remain coupled. |
| K4 communications fallback/bootstrap | PASS | Disabled `?tab=chats` selected first effective `comments`; only comments bootstrap ran. Empty child set failed closed. Live desktop/mobile showed `Комментарии`, `Рассылки` only and zero chat requests. |
| K5 hidden background work | FAIL under A1 | Shell chat/comments/rehabilitation pollers and badge fetches stop correctly; patient-card clinical/visits preload does not. |
| K6 always-on/Today | PASS | Unit oracle retained Today, schedule, clients and tasks. Live Today desktop/mobile presentation was unchanged; files/account and patient Overview remained reachable. |
| K7 defaults/availability | PASS | Accepted foundation oracle preserves missing-row compatibility and prevents preference expansion. |
| K8 one chokepoint | PASS | Candidate diff has one resolver call in `loadDoctorWorkspaceShell`; consumers receive `workspaceModules`. No second effective formula or parallel shell/nav registry found. |

### Targeted behavior

Green set — exact command:

```bash
pnpm --dir apps/webapp exec vitest run src/modules/system-settings/doctorWorkspaceComposition.unit.test.ts src/shared/ui/doctor/doctorNavLinks.unit.test.ts src/app/app/doctor/patients/\[userId\]/patientCardTabRegistry.unit.test.ts src/app/app/doctor/workspaceRouteProjection.unit.test.ts src/app/app/doctor/communications/page.workspaceProjection.unit.test.tsx src/shared/ui/doctor/shell/DoctorSupportUnreadProvider.workspaceProjection.ui.test.tsx
```

Result: `6` files, `28` tests, PASS.

Blocking oracle — exact command:

```bash
pnpm --dir apps/webapp exec vitest run src/app/app/doctor/patients/loadDoctorPatientCardPageBootstrap.workspaceProjection.unit.test.ts
```

Result on unmodified candidate: `1` file, `3` tests, all `3` FAIL with the disabled dependency calls described in
`C3M06-A1`.

### Fault injection

Each green behavior class was killed once in production code and restored before continuing:

| Injected fault | Exact oracle command | Observed failure |
| --- | --- | --- |
| Missing preference defaults modules OFF | `pnpm --dir apps/webapp exec vitest run src/modules/system-settings/doctorWorkspaceComposition.unit.test.ts` | `2/10` failed. |
| Resolver ignores upstream availability | same command | `1/10` failed. |
| Module-gated nav item is treated as visible | `pnpm --dir apps/webapp exec vitest run src/shared/ui/doctor/doctorNavLinks.unit.test.ts` | `1/6` failed. |
| Always-on Today requires `analytics` | same command | `1/6` failed. |
| `Карта` uses `medical_record && encounters` instead of OR | `pnpm --dir apps/webapp exec vitest run src/app/app/doctor/patients/\[userId\]/patientCardTabRegistry.unit.test.ts` | `2/5` failed. |
| `/messages` bypasses the page guard | `pnpm --dir apps/webapp exec vitest run src/app/app/doctor/workspaceRouteProjection.unit.test.ts` | `1/4` failed. |
| Communications bootstrap follows raw query instead of first effective tab | `pnpm --dir apps/webapp exec vitest run src/app/app/doctor/communications/page.workspaceProjection.unit.test.tsx` | `2/2` failed. |
| Shell ignores `programCommentsEnabled` | `pnpm --dir apps/webapp exec vitest run src/shared/ui/doctor/shell/DoctorSupportUnreadProvider.workspaceProjection.ui.test.tsx` | `1/1` failed on the hidden comments request. |

The A1 loader oracle was already red on the unmodified candidate, so §24.5 requires no artificial fault for that
class. `git diff` after restoration contains no production-code change.

### Live isolated DEV

Server command (port `5217`, shared `5200` untouched):

```bash
set -a; . /home/dev/dev-projects/BersonCareBot/apps/webapp/.env.dev; set +a
cd apps/webapp
APP_BASE_URL=http://127.0.0.1:5217 NEXT_PUBLIC_APP_BASE_URL=http://127.0.0.1:5217 HOST=127.0.0.1 PORT=5217 npx next dev -H 127.0.0.1 -p 5217
```

Ordinary DEV email/password login used the owner doctor account from `AGENTS.md` §1a. Inline Playwright checks at
desktop `1440×1000` and mobile `390×844` used the Settings UI, not direct DB writes. Observed:

- all-on desktop and mobile navigation agreed;
- with `medical_record`, `rehabilitation`, `direct_chat`, `mailings`, `analytics` OFF, desktop and mobile both
  removed Communications, Analytics and the LFK catalog while Today, schedule, clients and tasks remained;
- the same OFF view made zero requests to `/api/doctor/messages/unread-count`,
  `/api/doctor/comments/patients?mode=unread`, or `/api/doctor/pending-program-tests/summary`;
- with only direct chat OFF, `?tab=chats` opened `comments`; desktop/mobile showed only comments and mailings and
  made zero `/api/doctor/messages/*` requests;
- with medical record OFF, encounters ON and rehabilitation OFF, desktop/mobile patient cards showed
  `Обзор`, `Карта`, `Файлы`, `Учётка`; `ЛФК` and the header chat CTA were absent.

Every Settings mutation returned `PATCH /api/admin/settings 200`; a final reload confirmed all nine module switches
matched the initial all-on values. Candidate server received `Ctrl-C`; `ss -ltn '( sport = :5217 )'` returned only
the header row.

### Static/quality gates

Candidate diff identity:

```bash
git show -s --format='candidate=%H parent=%P subject=%s' 557f2caa436c70f3a7c79170987a11381c7c4b28
git diff --stat 557f2caa^..557f2caa
```

Result: product candidate `557f2caa436c70f3a7c79170987a11381c7c4b28`, `33` product files,
`680` insertions and `290` deletions. The audited tree SHA before auditor files was
`8a83a0788be0dcf82d55e6f3886c9636b9a8ccc0`.

Commands and results:

```bash
pnpm --dir apps/webapp run typecheck
# PASS

pnpm --dir apps/webapp exec eslint 'src/shared/ui/doctor/doctorNavLinks.unit.test.ts' 'src/app/app/doctor/patients/[userId]/patientCardTabRegistry.unit.test.ts' 'src/app/app/doctor/workspaceRouteProjection.unit.test.ts' 'src/app/app/doctor/communications/page.workspaceProjection.unit.test.tsx' 'src/shared/ui/doctor/shell/DoctorSupportUnreadProvider.workspaceProjection.ui.test.tsx' 'src/app/app/doctor/patients/loadDoctorPatientCardPageBootstrap.workspaceProjection.unit.test.ts'
# PASS

node scripts/check-db-chokepoint.mjs
node scripts/check-no-new-raw-sql.mjs
node scripts/check-queue-port-boundary.mjs
node scripts/check-test-runner-visibility.mjs
node scripts/check-c4-migration-owned-function-bodies.mjs
# PASS; test-runner visibility: integrator 121/121, webapp 553/553, media-worker 10/10

git diff --check
# PASS
```

No full CI was run, per brief.

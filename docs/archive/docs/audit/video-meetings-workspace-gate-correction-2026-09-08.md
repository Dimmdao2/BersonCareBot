# #1100 — video-meetings workspace gate correction evidence

Date: 2026-09-08. Scope: provider-neutral video core and its four existing API doors only; no live call UI,
call buttons, pages, Jitsi deployment, database mutation, or runtime/DEV/TEST verification was performed.

## Result

- Removed `VideoMeetingOnlineGate`, `online_location_inactive`, and the DI read of the built-in Online location.
  Provider health remains the service-level fail-closed condition.
- Added independent `video_meetings: []` to the closed workspace registry. The existing resolver obtains its
  availability from the existing `video_meetings` entitlement mechanic; settings use the same tariff surface.
- Applied the existing workspace guards to doctor create, doctor lifecycle, guest secret exchange, and authenticated
  patient join. Tariff access remains the existing route-level `requireEntitlementForRead/Mutation` check.

## Commands and results

- `pnpm install --frozen-lockfile` — PASS; restored the absent worktree `node_modules` from the current lockfile
  (no lockfile or manifest changes).
- `pnpm --dir packages/db-principal run build`, then `pnpm --dir packages/operator-db-schema run build`,
  `pnpm --dir packages/shared-contracts run build`, `pnpm --dir packages/platform-merge run build`, and
  `pnpm --dir packages/error-tracking run build` — PASS; required existing workspace package entrypoints for Vitest.
- `pnpm webapp:typecheck` — PASS after dependency restoration; no TypeScript diagnostics.
- `pnpm --dir apps/webapp exec eslint src/modules/video-meetings/ports.ts src/modules/video-meetings/service.ts
  src/modules/video-meetings/service.test.ts src/modules/system-settings/doctorWorkspaceComposition.ts
  src/app-layer/guards/workspaceModuleAccess.ts src/app-layer/di/buildAppDeps.ts
  'src/app/api/doctor/clients/[userId]/video-meetings/route.ts'
  'src/app/api/doctor/clients/[userId]/video-meetings/[meetingId]/route.ts'
  src/app/api/video-meetings/guest/exchange/route.ts
  'src/app/api/patient/video-meetings/[meetingId]/join/route.ts' src/app/app/settings/page.tsx
  src/app/app/settings/SettingsForm.tsx` — PASS.
- `pnpm --dir apps/webapp exec vitest run src/modules/video-meetings/service.test.ts
  src/app/api/video-meetings/guest/exchange/route.route.test.ts
  src/modules/system-settings/doctorWorkspaceComposition.unit.test.ts` — PASS, 3 files / 15 tests.
- `pnpm --dir apps/webapp exec vitest run
  src/app-layer/guards/workspaceModuleAccess.rehabilitation.audit.unit.test.ts
  src/app/app/doctor/workspaceRouteProjection.unit.test.ts` — PASS, 2 files / 50 tests.
- `rg -n 'VideoMeetingOnlineGate|online_location_inactive' apps/webapp/src/modules/video-meetings
  apps/webapp/src/app-layer/di/buildAppDeps.ts 'apps/webapp/src/app/api/doctor/clients/[userId]/video-meetings'
  apps/webapp/src/app/api/video-meetings apps/webapp/src/app/api/patient/video-meetings` — no matches.
- `rg -n 'findBuiltInOnlineLocation|onlineLocation' apps/webapp/src/modules/video-meetings
  apps/webapp/src/app-layer/di/buildAppDeps.ts 'apps/webapp/src/app/api/doctor/clients/[userId]/video-meetings'
  apps/webapp/src/app/api/video-meetings apps/webapp/src/app/api/patient/video-meetings` — no matches.
- `git diff --check` — PASS.

## Resolved prerequisites and remaining boundaries

- The first typecheck attempt was blocked by missing worktree dependencies; the first test attempt was then blocked
  by unbuilt workspace package entrypoints. Both were resolved above without source or lockfile changes.
- No UI completion is claimed. The later UI stage remains responsible for call UI/create/join projection and any
  required live/runtime acceptance. Full CI was not run: this is a scoped webapp change and no untested repo-level
  risk was identified.

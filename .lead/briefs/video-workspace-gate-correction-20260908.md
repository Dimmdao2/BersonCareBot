# Worker brief — #1100 workspace-module correction for landed video core

Work only in the supplied clean worktree/branch based on the current `feat/doctor-ui-rebuild`. Read the
`AGENTS.md` heading map, then the full relevant sections §5, §§7/9/10/10a/10b/11, §21/§22 and §24 in separate
bounded commands. Authority is `docs/_TODO/VIDEO_MEETINGS_JITSI_2026-09.md`, especially GATE-01 and Wave 1 stream
A2, plus the accepted delta audit
`/home/dev/brain/runs/agent-port/video-gate-delta-opus-audit-20260908.json`. Do not invent scope beyond its four
MUST FIX items.

Источник оракула: `docs/_TODO/VIDEO_MEETINGS_JITSI_2026-09.md` — «Видеовстречи — отдельный модуль
`video_meetings` в существующей настройке состава кабинета специалиста (`doctor_workspace_composition`).
Встроенная локация/филиал «Онлайн» не влияет ни на видимость элементов видеозвонка, ни на create/join.
Эффективный доступ равен пересечению тарифной доступности и этой настройки: скрытие кнопок дополняется
server-side отказом всех create/join путей.»

## Deliverable

Correct the already-landed video-meetings core in one coherent pass:

1. Remove `VideoMeetingOnlineGate`, `online_location_inactive`, the `findBuiltInOnlineLocation` DI adapter, and the
   route status mapping for that obsolete refusal. The video service and all UI/server paths must not read the
   built-in Online branch.
2. Extend the existing closed workspace registry with `video_meetings` and dependency `video_meetings: []`. Reuse
   `resolveWorkspaceModuleEffective` and the existing workspace-module guards; do not create a second resolver,
   feature flag, or service-level tariff/workspace gate.
3. Enforce the effective workspace module at all four existing doors: doctor create/resume, doctor lifecycle,
   guest exchange, and authenticated patient join. Use the existing doctor/organization/patient guard helpers and
   preserve the already-landed tenant, relationship, role and tariff checks.
4. Compute module availability from the existing `video_meetings` entitlement in both places that project
   availability: `app-layer/guards/workspaceModuleAccess.ts` and the settings-page `availableModules` literal.
   Never expose it as constant `true`; a missing tariff capability cannot be widened by composition.
5. In the same commit update the closed-list canon in
   `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md` C3M.1/C3M.4: add `video_meetings`, state that its
   buttons/live doors disappear when OFF, and that it has no dependency on encounters, client portal, or Online
   branch. Cite the 08.09 owner decision as the approved extension.
6. Do not create, weaken, rename or broadly rewrite tests. The plan allows only the mechanical removal of obsolete
   `onlineGate` arguments/types from already-landed fixtures that otherwise stop compiling. Retained behavior tests
   must still run green; new acceptance coverage belongs to the independent auditor.

Before adding anything, inspect whether `WORKSPACE_MODULE_KEYS`, `resolveDoctorWorkspaceModules`,
`resolveOrganizationWorkspaceModules`, `requireDoctorWorkspaceModuleForApi`, the organization/patient equivalents,
and the existing settings availability loader can be parameterized. One canonical path is mandatory.

## Excluded

No meeting UI/live pages, no Jitsi/coturn host changes, no migration/schema/privilege changes, no notification
changes, no unrelated C3M cleanup, no tariff seed rewrite, no deploy, no shared server or PROD action.

## Validation and handoff

Run the retained video-meetings service and route tests affected by the change, workspace composition tests, webapp
typecheck, scoped ESLint, architecture/route-surface gates, and `git diff --check`. Do not run full CI. Commit using
explicit path staging, never `git add -A`; do not push. End with the exact SHA, changed files, commands/results, and a
mapping of the four delta-audit MUST FIX items to the implementation. Do not finish while a foreground command runs.

# Worker brief — #1100 final meeting UI on accepted core

Work only in the supplied fresh worktree based on current `feat/doctor-ui-rebuild`, which already contains the
accepted workspace-module correction `2a8320dd5` and its acceptance record. Read the `AGENTS.md` heading map, then
full relevant §5, §§7/9/10/10a/10b/11, §§15–17/21/22 and §24 in bounded commands. Read
`docs/_TODO/VIDEO_MEETINGS_JITSI_2026-09.md`, especially VM-06/07, ACC-02..06, NOTE-03..08, UI-01..07,
GATE-01..04 and Wave 2 D. Previous candidate `27b81ae21d631af68d199c9ebee25bbfbc459ab2` is implementation input,
not authority: transplant its valid UI/live/guest-URL work onto current feat, preserve the accepted core when it
conflicts, and close every concrete gap below. Do not merge or cherry-pick the old commit wholesale.

Источник оракула: `docs/_TODO/VIDEO_MEETINGS_JITSI_2026-09.md` UI-01 — «Создан отдельный экран специалиста:
видео слева, справа вкладки «Заметка» и «Приём»; заметка переиспользует дневную историю, «Приём» — существующий
канонический протокол и его write-path, без второго формата.»

## Required result

1. Keep one provider-neutral `VideoMeetingStage`; Jitsi remains an adapter loaded only from the self-hosted session
   endpoint. It mounts once per actual joined room. Token refresh, note autosave, tab switch or neighboring state
   change must not recreate the API/iframe. Fix the old candidate's effect dependency on `accessToken`; keep the
   current token available for a real room replacement without disabling lint. Minimal camera/mic/hangup UI only.
2. Doctor live page keeps video mounted as a permanent sibling. Right-side `Заметка` and `Приём` panes reuse
   `DoctorNotesPanel` and `EncounterPageClient`; keep both mounted while switching. Parameterize the existing
   encounter client narrowly so save/cancel in embedded mode remains on the live page instead of executing its
   normal `router.push(backHref)`. Do not fork encounter form or write path. Hide the encounter tab/pane when the
   effective `encounters` workspace module is OFF; video remains available independently.
3. Add exactly the planned entry controls. In patient card and Today, the video button is controlled only by
   effective `video_meetings`, never by `encounters`, Online branch or appointment location. Existing encounter
   history/start controls are controlled only by `encounters`; when encounters is OFF, `Начать приём` must disappear
   while an enabled video control remains usable. Preserve the current layout when both controls are enabled.
4. Finish `PatientEncounterStartModal` through its canonical nested forms. For `select` and `without`, the bottom
   actions are `Очный приём` and, when video is enabled, `Онлайн-приём`; old footer Cancel is gone and the close
   affordance stays. For `mode === 'create'`, do not append a second footer under `DoctorAppointmentCreatePanel`.
   Parameterize that existing panel/calendar footer so the user chooses the same two actions and, after the canonical
   appointment is created, continues either to the existing encounter with the returned appointment ID or to the
   meeting. Keep overlap-confirmation behavior and appointment write path unchanged. Both actions remain independent
   of the appointment's Online/branch type.
5. Guest `/live` captures the secret from `location.hash` once and immediately removes it from visible history
   before awaiting exchange, including failure paths. It never renders patient data. The authenticated patient live
   page requires ordinary patient auth plus server meeting/client match. Its right pane must expose actual existing
   patient-visible diary, completion and assigned-program read behavior (or a clear navigation into those existing
   read paths); do not build duplicate API/read models, and do not present buttons that merely rename one link while
   pretending content switched.
6. Create/resume returns the branded ready `guestUrl` through the existing `resolvePatientPublicOrigin` chokepoint,
   independent of notification success. Doctor meeting UI must not discard a valid render session solely because a
   clipboard action or optional delivery failed. Reuse an existing clipboard helper if one exists. Explicit hangup
   uses the lifecycle route; bounded failures reveal no provider/room/JWT detail.
7. Apart from the named buttons, live pages, required narrow parameterization of canonical encounter components and
   the settings label already present in current feat, do not redesign or restyle existing pages.

Before writing, inspect `DoctorAppointmentCreatePanel`, its calendar-event footer/actions, `EncounterPageClient`,
`DoctorNotesPanel`, patient read components, `DoctorTodayNextAppointment`, `PatientCardClient`, existing clipboard
helpers and `resolvePatientPublicOrigin`. Reuse/parameterize those choke points; no parallel form, notes store,
workspace resolver, entitlement check or guest URL builder.

## Excluded and validation

No tests, migrations, privilege changes, Jitsi/coturn host config, notification implementation, tariff seed changes,
deploy, shared server or PROD action. Workers do not edit/create/delete/rename tests. Run retained targeted checks,
webapp typecheck, scoped ESLint, route-surface/architecture gates and `git diff --check`; do not run full CI. Commit
only explicit touched paths, never `git add -A`; do not push. End with exact SHA, changed files, commands/results,
UI-01..07 mapping, and remaining live checks. Do not finish while a foreground command runs.

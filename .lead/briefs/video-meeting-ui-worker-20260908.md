# Worker brief — #1100 meeting UI and live pages

Work only in the supplied clean worktree/branch created from the current integrated Wave-1 contracts. Read the
`AGENTS.md` heading map and full relevant rules: §5, §§7/9/10/10a/10b/11, §§15–17/21/22 and §24. Read existing doctor
and patient shared primitives before introducing UI. Authority is `docs/_TODO/VIDEO_MEETINGS_JITSI_2026-09.md`:
VM-06/07, ACC-02..06, NOTE-03..08, UI-01..07, GATE-01..04 and Wave 2 stream D. Reuse the landed video-meetings and
daily-notes contracts; do not fork either.

Read those rule sections in separate bounded commands. Do not concatenate all of §5–§24 or the entire README and
plan into one shell output: the previous attempt overflowed its tool turn before it reached implementation.

Источник оракула: `docs/_TODO/VIDEO_MEETINGS_JITSI_2026-09.md` UI-01 — «Создан отдельный экран специалиста: видео
слева, справа вкладки „Заметка“ и „Приём“» and UI-07 — no changes outside the named buttons/live pages/panes.

## Deliverable

Build the complete usable browser surface for the already-landed provider-neutral session API.

1. Add one stable provider-neutral meeting stage. The Jitsi renderer is an adapter component selected by the generic
   render-session descriptor; pages, access, notes and invitation code never construct Jitsi JWT/room API. Load
   `external_api.js` only from the self-hosted session endpoint, never a CDN/JaaS/meet.jit.si URL. Mount video exactly
   once per joined session: notes autosave, right-pane tab switches and neighboring note collapse must not recreate
   the Jitsi API/iframe or steal textarea focus. Do not key by access token or depend the mount effect on the whole
   session object/inline callbacks; dispose only on a real joined-session replacement or page leave. React unmount is
   not an implicit server-side hangup.
2. Jitsi UI is minimal: camera/mic video, microphone mute, camera mute and hangup only. No Jitsi logo/watermark,
   invite/share/chat/reactions/raise-hand/participants/recording/transcription/streaming/dial-in/third-party UI. The
   app owns loading/refusal/end states and shows no internal provider/config/room/JWT detail.
3. Doctor live page: video left; right panel tabs `Заметка` and `Приём`. Reuse the daily history/editor and canonical
   encounter protocol/write path, not a second note or visit format. Use `DoctorNotesPanel embedded`; narrowly
   parameterize `EncounterPageClient` for embedded presentation and post-save/cancel callbacks so its current
   `router.push` behavior cannot eject the doctor from the call. Keep video as a permanent sibling and keep both tab
   panels mounted. The note date is captured on editor open; today
   remains open, past notes collapse/edit as landed. Desktop is the primary split layout; narrow layout must remain
   usable without modifying unrelated pages.
4. Guest `/live` page reads only `location.hash` client-side, exchanges it by POST and removes it from visible browser
   history with `history.replaceState(pathname + search)` after successful capture. It shows only the call—never patient card, diary, program, encounter or doctor
   notes. No secret in server-rendered path/query/referrer/log/storage beyond the minimum in-memory join lifecycle.
   Register explicit `/live` behavior in `SURFACE_ROUTE_RULES`; it must work on a branded patient host and the allowed
   one-host TEST fallback.
5. Authenticated patient live page independently requires normal patient auth and meeting/client match before showing
   the session. Its right pane may switch only existing patient-visible symptom diary, completion and assigned-program
   read paths and patient UI primitives; reuse the current diary/treatment-program read models or their existing
   summary components rather than duplicating API models. Knowledge of the guest fragment never unlocks those panes. If the product needs a handoff from guest
   `/live`, use a safe meeting identifier/cabinet link—not the raw fragment as authentication.
6. Add exactly the owner-named entry controls, gated by the effective `video_meetings` workspace module: the
   organization entitlement is the upstream availability boundary and `doctor_workspace_composition` can narrow it.
   The built-in Online location/branch must not affect button visibility or any create/join path:
   - patient `Приём`/card header: square blue video button beside `Начать приём`, independent of `encounters`;
   - `Сегодня` next-appointment block: same button beside `Начать приём`;
   - `PatientEncounterStartModal`: bottom actions `Очный приём` and `Онлайн-приём`; the old footer Cancel action is not
     retained. Both actions must be reachable for `select`, `without` and especially `mode === 'create'`; in create
     mode the footer is owned by `DoctorAppointmentCreatePanel`/`DoctorCalendarEventPanel`, so parameterize that
     canonical footer and continuation after the returned appointment ID—do not add a second footer or change the
     nested overlap-confirmation footer. Keep the existing close affordance. Appointment online/branch type does not
     restrict the choice.
   No other page, layout, copy or control changes are permitted.
7. The doctor page obtains/renews its short-lived session through the authorized create/resume route, exposes a copy
   action for the branded `/live#secret` link, and calls the lifecycle end action on explicit hangup. Extend the
   existing single `resolvePatientPublicOrigin`/guest-URL chokepoint so create, resumed meeting and invite rotation
   return a ready `guestUrl`; never rebuild it from staff `window.location.origin`, and do not make it conditional on
   successful notification. If the create route needs the selected/created appointment, extend its strict body with
   an optional appointment ID and preserve the existing tenant/relationship validation. A failed automatic
   notification never hides the copyable link. Expired/revoked/tenant/provider/tariff refusal is bounded and generic.

Before extracting or adding a form, inspect whether `DoctorNotesPanel`, `PatientEncounterStartModal`,
`EncounterPageClient`, the patient card tab read models, `DoctorTodayNextAppointment`, `PatientCardClient`,
`resolvePatientPublicOrigin` and shared doctor buttons/tabs can be parameterized. One canonical write/read path is
mandatory; duplicate encounter forms or a second notes store are defects.

## Excluded

No notification delivery implementation, DB migration/schema/privilege work, Jitsi/coturn host config, tariff
constructor changes, recording/transcription, broad UI cleanup or redesign. Do not change owner checkboxes or tests.

## Validation and handoff

Workers do not write, edit, rename or delete tests. Run relevant retained video/notes/encounter/page tests, webapp
typecheck, scoped ESLint, route-surface/architecture gates and `git diff --check`; no full CI/shared server/live account
acceptance. Commit with explicit path staging, never `git add -A`; message contains #1100, why, evidence, Wave 2 D and
remaining live call/visual checks. End with exact SHA, changed files, checks and a concise mapping UI-01..07. Do not
finish while a foreground command runs and do not push.

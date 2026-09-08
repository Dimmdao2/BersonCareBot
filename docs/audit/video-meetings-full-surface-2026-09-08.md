# Wave 2 D — meeting UI/security surface, auditor-live

Candidate: `8ca8cc17b` ("#1100 Wave 2 D: add provider-neutral meeting UI")
Base: `173bc8c45`
Branch: `wt/video-meeting-ui-v3-20260908`
Authority: `docs/_TODO/VIDEO_MEETINGS_JITSI_2026-09.md` (VM-06/07, ACC-01..06, NOTE-03..08, UI-01..07,
GATE-01..04, §3, Wave 2/3) + owner decision 08.09 in `docs/OWNER_DECISIONS.md` ("Настраиваемость кабинета
специалиста").

**Verdict: MUST FIX.** The candidate does not compile and does not lint; on top of that it opens an
unchecked cross-tenant appointment binding and turns a previously best-effort branded-link failure into a
hard failure of meeting creation.

## 1. Test or look (§24.4), decided before reading the implementation or any test

Blind kill-set composed from the authority only, before opening the diff:

| # | Behaviour | Method | Why |
|---|---|---|---|
| K1 | guest secret comes only from the fragment and leaves address/history after capture | test | ACC-02, security, stable contract |
| K2 | guest exchange yields a call seat and never private patient reads | existing test | ACC-03 |
| K3 | authenticated patient live needs patient auth + server user↔meeting match | look (route+layout) | ACC-04, single server door |
| K4 | every doctor create/join door carries org + relationship + effective `video_meetings` | existing test + look | ACC-01/GATE-01 |
| K5 | video controls follow effective `video_meetings` only — not `encounters`, not appointment type, not the "Онлайн" location | look | GATE-01, visual/composition |
| K6 | optional appointment id belongs to the same client/org or is refused | test | ACC-01 |
| K7 | expired/revoked/substituted/foreign-tenant link and the third seat refuse without disclosure | existing test + look | ACC-06 |
| K8 | autosave, tab switch and collapse do not remount the stage or steal focus | test | NOTE-08, Wave 3 named class |
| K9 | per-date serialised autosave, late response never wins | out of this diff (Wave 1 B) | — |
| K10 | `external_api.js` only from `session.endpoint`; no provider leak outside the adapter | test + rg census | VM-01/VM-04/VM-07 |
| K11 | mic/camera/hangup only; explicit hangup disposes | test | VM-06 |
| K12 | copyable branded link regardless of notification result | test | ACC-05 |
| K13 | branded origin from the canonical builder + one-host DEV/TEST fallback | look | ACC-02, §3 |
| K14 | modal: two actions, canonical footer, returned appointment id, no second footer, overlap confirmation unchanged | look | UI-05 |
| K15 | `/live` has an explicit `SURFACE_ROUTE_RULES` entry | look | Wave 2 D |
| V1..V5 | branding, composition, scope census, `any`/provider leak, reuse of the canonical write paths | look only — source-string tests forbidden | §10a |

## 2. Findings

### MUST FIX 1 — the candidate does not compile: `createContinuation` is a free identifier

`apps/webapp/src/app/app/doctor/calendar/DoctorCalendarEventPanel.tsx:92` adds `createContinuation` to
`Props` and `:628-631` consumes it, but `DoctorCalendarEventPanelInner` never destructures it from its
parameter object (its list ends at `flushChrome`). It is an undeclared free variable.

- `pnpm --dir apps/webapp typecheck` → `TS2304: Cannot find name 'createContinuation'` at 628, 630, 631.
- Runtime: rendering the create panel throws `ReferenceError: createContinuation is not defined`. This is
  the create branch of the appointment modal, so it breaks **both** the new UI-05 «Очный/Онлайн» footer and
  the pre-existing "Новый приём" create flow for organisations with the module off.
- Requirement: UI-05, UI-07 ("прежний невидео-путь не регрессирует"), §9/§10 (a candidate must build).

### MUST FIX 2 — the candidate does not compile: `forceMount` is not this project's Tabs API, and the panes really do unmount

`apps/webapp/src/app/app/doctor/patients/[userId]/live/DoctorLiveMeetingClient.tsx:57-58` passes
`forceMount` (Radix) to `TabsContent`, which here is Base UI `Tabs.Panel`
(`apps/webapp/src/shared/ui/primitives/tabs.tsx:68`).

- `typecheck` → `TS2322: ... is not assignable to type 'IntrinsicAttributes & TabsPanelProps'` ×2.
- The equivalent Base UI prop is `keepMounted`, whose declared default is `false`
  (`@base-ui/react@1.7.0/tabs/panel/TabsPanel.d.ts:34-36`). So the intended mechanism is absent: switching
  «Заметка» ↔ «Приём» unmounts the inactive pane and the specialist loses everything typed into the
  encounter form mid-consultation. Silent and expensive.
- Requirement: NOTE-08, Wave 3 named class "remount video/focus loss при autosave и переключении правой панели".
- Note: the video stage itself is a sibling of the Tabs block and is *not* affected — that half is sound
  (see §3, protected K8).

### MUST FIX 3 — a caller-supplied `appointmentId` is persisted with no ownership check (ACC-01)

`apps/webapp/src/app/api/doctor/clients/[userId]/video-meetings/route.ts:10,45` now accepts
`appointmentId` from the request body, validates only its uuid *shape*, and forwards it through
`createOrResume` (`modules/video-meetings/service.ts:83`) into `findOrCreateActive`
(`infra/repos/pgVideoMeetings.ts:29`). Nothing between the door and the INSERT checks the client or the
organisation; the only constraint is the global FK `video_meetings_appointment_id_fkey` →
`be_appointments.id` (`db/schema/videoMeetings.ts:39`).

- Reachable scenario: an authenticated specialist POSTs to their **own** client's meeting door with the
  uuid of an appointment belonging to another client or another organisation. The row is written with
  that binding. Existing uuid → `200`; non-existent uuid → FK violation rethrown out of
  `findOrCreateActive` → 500. That difference is a working existence oracle for global appointment ids.
- Independent oracle: the canonical encounter write path already enforces exactly this predicate for its
  own appointment binding — `createVisit` in `infra/repos/pgPatientClinical.ts:627-641` matches
  `platform_user_id` **and** `organization_id`, otherwise `clinical_target_not_found`. The new write path
  is a second path to the same kind of binding without the check (§5 "Один общий проход").
- Requirement: ACC-01; audit brief "optional appointment id обязан принадлежать тому же
  клиенту/организации или безопасно отклоняться существующим authoritative write path".
- Acceptance test (fails on the candidate):
  `apps/webapp/src/app/api/doctor/clients/[userId]/video-meetings/route.route.test.ts`.
  A blanket "never forward an appointment id" fix also satisfies it; the brief explicitly allows
  "или безопасно отклоняться". The second case in the file guards against a fix that breaks the plain start.

### MUST FIX 4 — an unresolvable branded origin now aborts meeting creation (ACC-05 / GATE-04 regression)

Before this diff, `await deps.resolvePatientPublicOrigin(...)` sat **inside** the try/catch around
`invitationNotification.enqueue`, so a resolver failure degraded to `notificationUnavailable()` and the
specialist still got a working call. The candidate hoists it out
(`modules/video-meetings/service.ts:96-98`, and again unguarded in `rotateInvite` at `:139-141`).

`resolvePatientPublicOrigin` genuinely rejects: `modules/custom-domain-binding/service.ts:179-186` throws
`patient_public_origin_unresolved` for an organisation with no public-directory projection whenever the
deployment does **not** share patient/staff hosts.

- Reachable scenario: such a clinic clicks the video button. The meeting row and its invite are written
  first, then the rejection escapes `createOrResume` and the request 500s. Every retry resumes the meeting,
  rotates yet another invite, and fails again — the clinic can never start a call.
- The neighbouring existing test even names this contract ("a queue/channel/**origin** failure aborts
  meeting creation") but only mocks `enqueue` rejecting, so it stayed green.
- Acceptance test (fails on the candidate): new case in
  `apps/webapp/src/modules/video-meetings/service.test.ts`.

### MUST FIX 5 — the live page ignores the `encounters` and `medical_record` workspace modules

`live/page.tsx:12` gates only on `video_meetings`, and `DoctorLiveMeetingClient.tsx:58` renders
`EncounterPageClient` unconditionally and without `medicalRecordEnabled`, which defaults to `true`
(`EncounterPageClient.tsx:179`).

The canonical door does both: `visits/new/page.tsx:27` calls
`requireWorkspaceModuleForPage(shell.workspaceModules.encounters)` and `:59` passes
`medicalRecordEnabled={shell.workspaceModules.medical_record}`.

- Reachable scenario: an organisation that switched «Приёмы» and/or «Медкарта» off gets the «Приём» tab
  and the medical-record blocks back on the live screen, and `GET /api/doctor/patients/{id}/clinical`
  fires on mount.
- Honest impact bound: the server is fail-closed — the clinical GET
  (`clinical/route.ts:20`) and the visit POST (`visits/route.ts:122,130`) both gate on the same modules —
  so this is **not** a data leak. It is a workspace-composition bypass in the UI plus a pane that errors
  on save.
- Requirement: owner decision 08.09 ("настройки только сужают уже существующую доступность функций";
  "специалист должен убирать из своего рабочего интерфейса неиспользуемые доступные модули"), GATE-01.
- View finding: not tested. The stable contract is server-side and already covered; asserting which panes
  a composed page renders would pin UI form (§10a).

### MUST FIX 6 — the overlap confirmation silently discards the chosen modality

`DoctorCalendarEventPanel.tsx:662` retries with `submitCreate({ allowOverlap: true })` and no `onCreated`,
so at `:590` the continuation falls back to the host `onCreated`, which
`PatientEncounterStartModal.tsx:272` binds to `openEncounter` — the **offline** path.

- Reachable scenario: the specialist picks «Онлайн-приём» in create mode, the slot overlaps
  (`:562`, reachable because `hideCreatePatient` is set so `isNewPatient` is false), they confirm
  "Создать наложение" — and land on the offline encounter page. No meeting is created and nothing explains
  the substitution.
- Requirement: UI-05 and Wave 2 D "обеспечивает обе достижимые ветки модалки, включая `mode === 'create'`".
- View finding: the wrong branch is immediately visible to the user (they arrive on the wrong page), so it
  fails the §10a step-2 "silent" half; a component test of this modal would also drag in the whole
  calendar create graph (§11). Reported with exact evidence instead of simulated coverage.

### MUST FIX 7 — with the module off, the start-encounter footer loses its primary action and its cancel

`PatientEncounterStartModal.tsx:186-191`: when `videoMeetingsEnabled` is false the footer is a **single**
`variant="outline"` button labelled «Очный приём», carrying `disabled={mode === 'select' && !selectedAppointmentId}`.
Base `173bc8c45` had «Отмена» + a primary «Начать приём».

- Reachable scenario: a clinic without the video module opens «Начать приём» in `select` mode with nothing
  chosen — the footer now holds exactly one, disabled, button. The modal is still escapable via
  `DoctorModal`'s X (`DoctorModal.tsx:450-453`), so this is a UI regression, not a lockout.
- Requirement: UI-05 conditions the two-action footer on video being **on**; audit brief "при выключенном
  модуле прежний невидео-путь не регрессирует".
- View finding: button count/labels are exactly what §10a and the Wave 3 note forbid pinning with a test.

### MUST FIX 8 — the authenticated patient live page has no patient panes

`app/app/patient/live/[meetingId]/PatientLiveMeetingClient.tsx` renders the stage and nothing else.
Wave 2 D's scope line names "переиспользование note/encounter/**patient panes**", and the audit brief asks
for the existing patient-visible diary/completion/assigned-program panes when the cabinet is allowed.

- UI-02's own wording is permissive ("**может** справа переключать"), so the owner may downgrade this to
  "deferred" — but as written the plan's Wave 2 D deliverable is not present, so it cannot be ticked.
- View finding.

### MUST FIX 9 — lint is red on the candidate's own new file

`pnpm --dir apps/webapp eslint src/app/live` →
`react-hooks/set-state-in-effect` error at `GuestLivePageClient.tsx:12:20`. `lint` is part of root `ci`.

## 3. Protected — named fault injected, named assertion went red

All production edits below were reverted immediately; `git status` confirms a clean production tree.

| Class | Fault injected | Assertion that went red |
|---|---|---|
| K1 ACC-02 fragment leaves history | removed `history.replaceState(...)` from `GuestLivePageClient.tsx` | `expected '#aaaa…' to be ''` |
| K1 ACC-02 secret in path/query | moved `bearer` into the exchange query string | `expected '/api/…?b=…' not to contain 'aaaa…'` |
| K8 NOTE-08 stage remount | added `onHangup` to the conference effect deps | `expected "vi.fn()" to be called 1 times, but got 2 times` |
| K11 VM-06 toolbar | added `'chat'` to `TOOLBAR_BUTTONS` | `expected [ 'microphone', 'camera', …(2) ] to deeply equal [ 'microphone', 'camera', 'hangup' ]` |
| K10 VM-01/04 external origin | hardcoded `https://meet.jit.si/external_api.js` | `expected [ Array(1) ] to deeply equal [ Array(1) ]` |
| K4 GATE-01/02 entitlement door | deleted `requireEntitlementForRead` from the guest exchange route | existing exchange route test failed |

## 4. Killed by a failing acceptance test on the original implementation

- K6 → `route.route.test.ts` "never persists a caller-supplied appointment id…" (MUST FIX 3)
- K12 → `service.test.ts` "keeps the meeting startable when the branded patient origin cannot be resolved" (MUST FIX 4)

## 5. PASS by inspection

- **K3 ACC-04.** `/app/patient/live/[meetingId]` inherits `app/app/patient/layout.tsx` (session, `canAccessPatient`,
  org context, cabinet gate). The seat itself comes only from
  `api/patient/video-meetings/[meetingId]/join/route.ts`, which requires patient auth, the patient workspace
  module, the entitlement and `joinAuthenticatedPatient` matching `meetingId + organizationId + patientUserId`.
  Knowing a guest secret opens none of it.
- **K2/K7 ACC-03/ACC-06.** `api/video-meetings/guest/exchange/route.ts` returns only `session`, and every
  failure — bad body, unknown org, lost entitlement, module off, expired/revoked/ended meeting — funnels into
  the identical `refusal()` 404 with `no-store` + `no-referrer`. `exchangeGuest` returns a `patient` seat only.
- **K10/V4 provider isolation.** `rg` census: Jitsi is named only in `infra/video/jitsiVideoMeetingProvider.ts`,
  the DI wiring, `system-settings/registry.ts`, and the single browser adapter selected by the neutral
  `renderer` descriptor in `VideoMeetingStage.tsx`. No `any` is introduced anywhere in the diff.
- **K13/K15 branded origin and surface rule.** The guest URL is built from the one canonical
  `customDomainBinding.resolvePatientPublicOrigin` (no second builder). The explicit `/live` → `patient` rule
  is added ahead of the generic clinic-slug pattern, and `proxy.ts:89` only applies
  `canSurfaceEnterRoute` when `arePlatformSurfaceHostsDistinct()`, so the one-host DEV/TEST URL keeps working.
- **K5 GATE-01 independence.** `PatientCardClient.tsx:618` shows the video button on
  `workspaceModules?.video_meetings` alone, and the surrounding container now opens on
  `encounters !== false || video_meetings`. Today's button and the modal action read the same effective flag.
  No code path in the diff reads the built-in "Онлайн" location.
- **K12 copy-link independence.** `guestUrl` is now computed before, and outside, the notification try/catch,
  so a delivery failure no longer hides the link. (Its new failure mode is MUST FIX 4.)
- **K14 partial.** No second footer: `PatientEncounterStartModal` passes `footer = undefined` in `create` mode
  and `DoctorAppointmentCreatePanel` owns the footer; the create continuation does use the **returned**
  appointment id (`DoctorCalendarEventPanel.tsx:590`). The overlap branch is MUST FIX 6.
- **V1/V3 look.** `TOOLBAR_BUTTONS: ['microphone','camera','hangup']`, `SHOW_JITSI_WATERMARK`,
  `SHOW_BRAND_WATERMARK`, `SHOW_POWERED_BY` all false, prejoin/deep-linking/welcome disabled — no Jitsi
  branding, no conference features. Scope census of all 20 changed files: every one is a named live page, a
  named button, or a narrow parameterisation of an existing notes/encounter/calendar component. UI-07 holds.

## 6. Missed / not provable here

- **K9 (autosave ordering)** belongs to Wave 1 B and is outside this diff.
- **VM-02/VM-03/VM-04 runtime** (Prosody two-occupant limit, direct P2P, ICE endpoint census) need the Jitsi/coturn
  TEST host from Wave 1 C. Named blocker: no TEST video node is reachable from this worktree; the plan's own
  §7 records the missing wildcard DNS/certificate for `<clinic-slug>.therapygo.ru`.
- **Live visual acceptance** of UI-01/UI-03/UI-04 composition (video left, tabs right, square blue buttons,
  responsive) was not performed: the candidate does not compile (MUST FIX 1, 2), so the doctor live page and
  the appointment create modal cannot be rendered. This is a runtime blocker, not a pass.

## 7. Commands

```
grep -n "^## \|^### " AGENTS.md
git diff 173bc8c45..8ca8cc17b
pnpm -r --filter "./packages/*" build
pnpm --dir apps/webapp typecheck
pnpm --dir apps/webapp exec eslint src/app/live src/shared/ui/video src/modules/video-meetings ...
pnpm --dir apps/webapp exec vitest run \
  src/modules/video-meetings/service.test.ts \
  "src/app/api/doctor/clients/[userId]/video-meetings/route.route.test.ts" \
  src/app/api/video-meetings/guest/exchange/route.route.test.ts \
  src/app/live/GuestLivePageClient.ui.test.tsx \
  src/shared/ui/video/JitsiMeetingRenderer.ui.test.tsx \
  src/modules/patient-notifications/videoMeetingInvitationNotification.unit.test.ts \
  src/modules/system-settings/doctorWorkspaceComposition.unit.test.ts
git diff --check
```

Result: 23 passed, 2 failed — the two failing tests are the acceptance tests for MUST FIX 3 and 4.

## 8. Pre-existing, not this candidate's

`pnpm --dir apps/webapp typecheck` is already red at base `173bc8c45` in five fixture files untouched by
this diff — `doctorNavLinks.unit.test.ts`, `workspaceRouteProjection.unit.test.ts`,
`loadDoctorPatientCardPageBootstrap.workspaceProjection.unit.test.ts`,
`communications/page.workspaceProjection.unit.test.tsx`, `patientCardTabRegistry.unit.test.ts` — all missing
the `video_meetings` key that Wave 1 A2 added to `WORKSPACE_MODULE_KEYS`. Plan Wave 1 A2 assigns exactly this
mechanical fixture update ("только механически удалить устаревший `onlineGate` из существующих test fixtures");
it is unfinished. Flagged so the lead does not read it as this candidate's breakage — but it does mean webapp
typecheck cannot go green until it is closed as well.

Also note: `pnpm --dir apps/webapp typecheck` fails with `TS2307: Cannot find module '@bersoncare/*'` in a
fresh worktree until `pnpm -r --filter "./packages/*" build` has been run once.

## 9. Fixer correction evidence — 2026-09-08

Fixer candidate: follow-up to `8ebdbf2f6` on `wt/video-meeting-ui-v3-20260908`.

- **Finding 5.** `live/page.tsx` projects the existing effective `encounters` and `medical_record` values from
  `loadDoctorWorkspaceShell`; the client omits the «Приём» tab unless `encounters` is effective and passes
  `medicalRecordEnabled` into the canonical `EncounterPageClient`. The video and note surfaces remain outside
  either condition.
- **Finding 6.** `DoctorCalendarEventPanel` retains the selected `onCreated` continuation while the overlap
  confirmation is open and reuses it for the confirmed canonical create. Offline still opens the encounter;
  online still opens the call; the nested footer itself is unchanged.
- **Finding 7.** The non-video select/without footer is restored to «Отмена» plus primary «Начать приём».
  The create branch continues to use the canonical appointment footer. The enabled branch retains the two
  modality actions through all three modes.
- **Finding 8.** Authenticated patient live parameterizes the existing patient live client with existing
  `PatientDiaryAuthenticatedMain` and `PatientTreatmentProgramsListClient` read presentations only when the
  canonical effective `client_portal` gate succeeds; rehabilitation further narrows the program panel. The
  pane is rendered only after the existing server-matched patient join returns a session. Guest `/live` remains
  the separate fragment-only client with no patient panes; video is still available when `client_portal` is off.

This is inspection evidence for composition requirements, not new DOM/CSS/copy/button-count coverage.

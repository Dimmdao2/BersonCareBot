# Worker brief — #1100 video meeting invitation notification

Work only in the supplied clean worktree/branch based on the current integrated `feat/doctor-ui-rebuild`. Read the
`AGENTS.md` heading map and full relevant rules: §§1b/2–5, §§7/9/10, §17/21 and §24. Authority is
`docs/_TODO/VIDEO_MEETINGS_JITSI_2026-09.md`, ACC-02/03/05/06, VM-07, GATE-01..04 and Wave 2 stream E. Inspect the
landed `modules/video-meetings` contract and existing `modules/patient-notifications/resolveNotificationChannels.ts`,
typed patient notification/outgoing-delivery paths and `resolvePatientPublicOrigin`; parameterize the existing
chokepoints rather than creating a parallel channel resolver, direct sender or URL builder.

Источник оракула: `docs/_TODO/VIDEO_MEETINGS_JITSI_2026-09.md` ACC-05 — «При создании приглашения приложение
формирует одно product-notification событие; каналы не зашиваются в сценарий, а выбираются общим правилом
`доступное ∩ разрешённое получателем`. Содержание — факт приглашения и ссылка без клинического текста».

## Deliverable

Implement one typed, provider-neutral invitation notification intent when a specialist creates a new meeting/invite.

1. Reuse the canonical patient-notification preference resolver so the selected channels are exactly
   available-capabilities intersected with recipient preference. If an account/channel is unavailable, skip only that
   channel. Do not hardcode push/email inside the meeting service and do not reimplement consent/default policy.
2. Build the branded guest URL only via the existing organization → patient public origin seam and append the shared
   `/live#<opaque-secret>` route. The raw secret may exist transiently in the notification payload and specialist
   response, but never path/query, DB columns, logs, errors, analytics or idempotency keys. Do not substitute a staff
   `APP_BASE_URL`.
3. Event content contains only a neutral invitation fact and the link: no patient name, diagnosis, symptoms, notes,
   appointment/clinical details, Jitsi/provider room/JWT/TURN data.
4. Exactly one product intent is produced for the initial invite of a newly-created meeting. A retry/resume of the
   already-active meeting must not duplicate the automatic event. Explicit later rotate/revoke is a specialist
   lifecycle action and does not silently resend; the returned new link remains copyable by the UI.
5. Use an existing durable/idempotent notification/outgoing-queue seam if available. Notification delivery failure
   must not corrupt/recreate the meeting/invite; return a bounded result that lets the specialist still copy the link.
   DEV must never perform real delivery under §1b.
6. Keep video module/provider replaceable: notification code sees meeting/invite IDs and the branded link, never
   Jitsi-specific session fields. Reuse `buildAppDeps` injection and one route/service path; no new DB table unless the
   existing queue provably cannot represent the typed event.

## Excluded

No meeting pages/buttons/player, notes, Jitsi/coturn deploy config, tariff schema, recording/transcription, live
delivery, DEV/TEST/PROD mutation or owner checkbox changes. Do not modify tests.

## Validation and handoff

Workers do not write, edit, rename or delete tests. Run only relevant retained notification/video tests, webapp and
integrator typechecks if their code changes, scoped ESLint, architecture/raw-SQL/registry gates and `git diff --check`.
Do not run full CI or a shared server. Commit with explicit path staging, never `git add -A`; message contains #1100,
why, evidence, Wave 2 E and remaining live acceptance. End with exact SHA, changed paths, commands/results and the
observable dedup/privacy behavior. Do not finish while a foreground process runs and do not push.

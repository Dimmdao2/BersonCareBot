# Worker — two-audience platform SMTP round-trip health probe (#950, P5)

Deliver the whole P5 product stage in one coherent pass. Do not stop after analysis, do not perform live delivery,
and do not leave task changes uncommitted.

## Mandatory reading and authority

1. Run `grep -n '^## \|^### ' AGENTS.md`, then read completely `AGENTS.md` §1, §1b, §2, §3, §4, §5,
   §9, §10, §10a, §10b, §12 and §24. Read `docs/ORCHESTRATION_BINDINGS.md` and the adjacent module `*.md`
   contracts before editing.
2. Read `docs/_TODO/OUTBOUND_DELIVERY_ALERTING_PLAN.md`, especially the complete `P5` checkbox, and the active
   audience split requirements `TPB-13a` in
   `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/IMPLEMENTATION_PLAN.md`.
3. Inspect the current accepted platform-audience implementation and the existing health machinery before editing:
   `apps/integrator/src/app/operatorHealthProbeRunner.ts`, `operatorHealthProbeSettings.ts`,
   `apps/integrator/src/config/smtpOutbound.ts`, the email adapter/runtime-config path,
   `apps/integrator/src/infra/db/repos/operatorHealthDrizzle.ts`, operator incident reporting,
   `apps/webapp/src/modules/system-settings/operatorHealthProbeConfig.ts`, the `operator_health_imap` restricted
   setting contract and the existing admin health settings surface.

Источник оракула: `docs/_TODO/OUTBOUND_DELIVERY_ALERTING_PLAN.md` — «Therapysto и TherapyGo отправляют отдельные
uniquely tagged контрольные письма на выделенный owner mailbox; существующий `operator_health_imap` подтверждает
фактическое получение каждого письма до `roundTripDeadlineMs`, различает два sender profile, очищает только свои
старые probe-сообщения по retention и поднимает существующий красный delivery incident при отсутствии любого из
двух».

## Required behavior

- Extend the existing scheduler/probe path; do not create a parallel scheduler, health subsystem, incident type or
  SMTP engine. Ask for every proposed helper whether the existing choke point can be parameterized instead.
- Each due run sends two separate probe messages through the existing platform SMTP delivery path: patient audience
  selects TherapyGo, staff audience selects Therapysto. Each message carries an unpredictable run identifier and a
  distinct audience marker so one delivered message cannot satisfy both profiles or a later run.
- Confirm actual arrival by the existing restricted `operator_health_imap` mailbox configuration before
  `roundTripDeadlineMs`. A send success alone is never health success.
- Bound network operations by configured timeout/deadline, close connections reliably, and make retries/idempotency
  safe for the existing scheduler cadence. Do not log message bodies, mailbox credentials, auth data or secrets.
- Cleanup may remove only old messages provably owned by this probe mechanism and older than `retentionMs`, no more
  often than `cleanupIntervalMs`. Never delete unrelated mailbox messages.
- Missing/invalid SMTP or IMAP configuration is an honest skipped/not-configured state where the established health
  semantics require it; an enabled/configured profile whose message is not received is a failure. A failure of either
  audience opens/touches the existing red outbound-delivery provider incident with enough non-secret audience detail;
  later success resolves only the matching probe incident.
- Preserve quiet-window behavior and existing MAX/Telegram/Google probes. Extend one result/persistence representation
  rather than adding a second status store.
- Critical integration configuration remains restricted DB-backed `public.system_settings`; add no env secret, mirror
  table, raw SQL access or credential copy. If an IMAP dependency is genuinely required, use the smallest maintained
  library and update the existing workspace manifests/lockfile once.
- DEV must never send a real message or connect to the real mailbox. Do not read, request, print, write or test with the
  credentials supplied by the owner in chat. Do not touch TEST/PROD data or providers in this worker.

## Scope and checks

Allowed product scope is the directly affected integrator operator-health/email/config/DB-adapter files, the existing
webapp system-settings contract only if its shape must be completed, workspace package manifests/lockfile only for one
necessary dependency, and the factual `P5` plan status/evidence. Do not touch Telegram/MAX/clinic-bot UI or behavior,
mobile code, unrelated alerts, delivery policy, migrations, deployment or runtime credentials.

Do not create, edit, expand or delete tests. The independent auditor owns any justified behavioral acceptance test and
must apply the §10a independent-oracle/costly-silent-failure gate. Do not clean historical tests. Run only relevant
typecheck, scoped lint/build and non-live static checks through the host lock where required; no full CI and no live
provider operation.

Commit task-related files explicitly (never `git add -A`) with `#950` and `P5` in the message. Report exact SHA,
changed production paths, the reused scheduler/delivery/incident seams, checks actually run, dependency changes, and
the remaining independent audit plus authorized TEST live gate. Worker completion is not plan acceptance.

# Auditor-live brief — final platform delivery audience split (#787)

## Test or view classification first

Work only in `/home/dev/dev-projects/bcb-wt-platform-delivery-audience-final-audit-20260909` on
`wt/platform-delivery-audience-final-audit-20260909`. Audit exact product candidate `8aac60e20`, which fixes the
previous independent audit `51b4adb87` and substantially extends the inbound Telegram/MAX surface. You are an
independent auditor-live, not a product fixer.

Before every action follow the heading-map gate in `AGENTS.md`. Read §1 including migration/privilege rules, §1b,
§2–§5, §7, §9, §10a and §10b in full, §12 and §24. Read the #787 plan sections §1.2h/TPB-12/TPB-13/C3/C4/C5b,
the prior report `.lead/runs/platform-delivery-audience-split-audit-20260909/90-final-audit-report.md`, the fixing
brief, exact diff `51b4adb87..8aac60e20`, and the relevant integration module docs.

Classify every item before acting: one-time wiring/privilege/migration inspection is proved by diff, generated
artifacts, type/build/static gates and owner-aware rollback-only preflight; repeatable routing/delivery behavior may
use a test only when §10a/§10b's independent oracle, expensive silent failure and public consequence all exist.
Build the blind kill-set from authority before reading existing tests. Existing audit tests are retained or deleted
only by the test canon; do not create tests for names, labels, key lists, registry shape, counts, source text or
internal argument choreography. Any new behavioral test must record one fault injection and a caught observable
failure. Product changes are forbidden; temporary mutations must be reverted.

## Owner oracle and acceptance boundary

Owner decisions, 09.09.2026: TherapyGo is the patient delivery identity; Therapysto is the staff/specialist delivery
identity. SMTP, Telegram and MAX are separate physical platform profiles for those audiences. The messaging/command
mechanism is provider-neutral and shared until the final thin adapter that knows a concrete provider API. Platform
bots are configured by the global administrator. Berson Care clinic overrides remain organization-scoped and must
not be erased or selected for unrelated organizations. Branded clinic bots under paid `branding` are a later
dependent stage and are not part of this candidate. No real credentials, live provider requests, TEST mutation or
PROD action.

Audit end to end:

1. Re-run the previous red oracles unchanged. Patient-message notification to staff through MAX and every staff
   email producer (invite, reminder/operator paths in scope) must select Therapysto; patient recipients/default
   patient flows must select TherapyGo. The signed webapp→integrator email boundary must preserve audience and reject
   tampering/fail closed without letting an unmarked staff path silently fall back to patient.
2. Inspect and behavior-check Telegram and MAX **inbound** identity selection: two independent bot credentials/modes,
   webhook/long-polling/menu/setup/command routes can operate for patient and staff simultaneously without duplicate
   business engines or a patient default swallowing staff traffic. A request for one audience must never read the
   other audience's token/API key, parse under the other bot identity, or send its response through the other bot.
   Route collisions, webhook secret/identity confusion and one bot disabling the other are findings if reachable.
3. Verify outbound selection, runtime config/settings UI/API and DB-backed restricted storage form one shared typed
   `PlatformDeliveryAudience` path. No provider secret in env/public settings/logs; no duplicated Telegram/MAX
   domain logic; only final adapters know provider payload/API. Existing organization-scoped branded overrides stay
   backward-compatible and isolated.
4. Inspect the migration: current timestamp/owner markers/probe, no GRANT/REVOKE, restricted settings declared and
   generated privilege artifacts consistent. Re-run owner-aware candidate DEV preflight through the sanctioned
   entrypoint and prove the old `permission denied for schema app` is gone without applying or creating a DB.
5. Run the smallest complete affected suites, both app typechecks, scoped lint, privilege generator/checks and
   `git diff --check`. Do not run full CI. Do not send real email/messages or populate credentials.

Commit only valid audit tests and one final audit artifact. Stage explicit paths, do not push. Report exact candidate,
kill-set, each fault injection, caught/uncaught count, command results, any reachable finding with impact + violated
authority, and binary PASS/FAIL for landing. A style preference or unrelated incomplete future stage is not a
finding. Do not end while a foreground command is running.

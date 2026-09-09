# Worker — branded clinic bots through the shared delivery path (#787)

Deliver this whole stage in one coherent pass. Do not stop after analysis and do not leave uncommitted work.

## Mandatory reading and authority

1. Run `grep -n '^## \|^### ' AGENTS.md`, then read completely `AGENTS.md` §2, §3, §4, §4a, §5,
   §9, §10, §10a, §10b, §12, §16, §21, §22 and §24. The owner explicitly requires the worker not to
   write tests; the independent auditor owns any justified behavioral test.
2. Read `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/IMPLEMENTATION_PLAN.md` §1.5 and the full
   checkbox text of `TPB-12a`, `TPB-12b`, `TPB-13a`, `C3` and `D1`.
3. Read the existing implementation before editing:
   `apps/webapp/src/app/app/settings/page.tsx`, `OrgBrandingSection.tsx`,
   `ClinicDeliveryChannelsSection.tsx`, `apps/webapp/src/app/api/admin/settings/route.ts`,
   `apps/webapp/src/modules/org-branding/**`, `apps/webapp/src/modules/org-entitlements/**`,
   `apps/integrator/src/infra/db/clinicDeliveryCredentials.ts`,
   `apps/integrator/src/infra/adapters/dispatchPort.ts`, the Telegram/MAX delivery adapters and the
   platform-audience resolver produced by the preceding #787 stage.

Источник оракула: `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/IMPLEMENTATION_PLAN.md`:
«Telegram/MAX credentials конкретной организации настраиваются только во вкладке „Брендирование“ и доступны
только при активном entitlement брендирования».

## Owner-required behavior

- One provider-independent message/command contract and one dispatch path remain the core. Callers select
  recipient/audience and organization context; they do not select Telegram/MAX credentials themselves.
- Only the last thin provider adapter knows the Telegram or MAX API and translates the common message into that
  provider's payload. Do not create a second bot engine, duplicate queue or per-provider business flow.
- Global platform admin configures platform credentials: TherapyGo for patient-facing messages and Therapysto for
  staff-facing messages. An organization administrator must never be able to mutate those global credentials.
- Existing per-organization Telegram/MAX credentials are branded clinic bots. Their controls exist only inside the
  clinic `Брендирование` settings surface and only while the paid `branding` entitlement permits access. There must
  be no second tenant-bot form in the generic delivery/settings surface.
- Enforce the paid-branding gate at the server write boundary and at runtime credential resolution; hiding UI alone
  is insufficient. Preserve existing channel availability/readiness gates and secret redaction. If the current
  dedicated `clinic_telegram_bot` / `clinic_max_bot` mechanics remain relevant to tariff packaging, require them in
  addition to `branding`; they must never substitute for the mandatory branding gate.
- A verified, enabled clinic bot handles patient-facing intents for that organization without fallback to a
  platform sender after its selection. Missing, disabled, unverified or non-entitled clinic config uses the
  TherapyGo platform bot. Staff-facing intents always use Therapysto and never a clinic bot.
- Keep configuration in the existing organization-scoped rows of `public.system_settings`; no new env keys, secret
  store, mirror table or duplicate settings keys. Preserve the existing single API/service write path.
- Future providers must be addable by another thin adapter and configuration mapping, not by cloning the business
  workflow.

## Implementation boundary

This stage extends the current #787 candidate after the platform audience split has been accepted by the lead.
First inspect that exact HEAD and parameterize its existing resolver/dispatch seams. In particular, ask whether
each proposed helper/function can instead be a parameter or branch of the existing single choke point required by
`AGENTS.md` §5. Reuse existing doctor UI primitives and the existing clinic-bot fields/readiness/probe behavior.

Allowed production scope:

- `apps/webapp/src/app/app/settings/**`
- `apps/webapp/src/app/api/admin/settings/**`
- `apps/webapp/src/app/api/admin/clinic-delivery-test/**`
- `apps/webapp/src/modules/org-branding/**`
- `apps/webapp/src/modules/org-entitlements/**`
- `apps/webapp/src/modules/system-settings/**`
- `apps/webapp/src/app-layer/**` only if the existing composition root must inject the single gate
- `apps/integrator/src/infra/db/clinicDeliveryCredentials.ts`
- `apps/integrator/src/infra/adapters/dispatchPort.ts`
- directly affected Telegram/MAX adapters/configuration mapping
- the active #787 plan checkbox text/evidence only when factual

Do not change SMTP audience behavior in this continuation except where needed to keep the already accepted shared
resolver compiling. Do not add provider credentials, touch DEV/TEST/PROD data, deploy, push, or run full CI.

## Tests and checks

- Do not create, edit or expand tests. If a newly introduced test from this workstream violates §10a (text/product
  names/counts/source shape without an independent oracle and expensive silent failure), delete that new harmful
  test. Do not conduct a repository-wide cleanup of historical tests.
- Run only relevant formatter/lint/typecheck/build checks through the repository host lock where required. Do not
  claim runtime behavior from compilation.
- Commit all task-related production/doc changes explicitly (never `git add -A`), with `#787`, checks, remaining
  live/audit work and the exact plan IDs in the commit message. Do not push.

## Completion handoff

Report the exact commit SHA, changed production paths, the single end-to-end dispatch/write seams preserved,
checks actually run, whether any new harmful test was removed, and every requirement still needing independent
behavioral/live acceptance. Worker completion is not plan acceptance; the lead will launch an independent auditor.


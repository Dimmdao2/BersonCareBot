# U6A public entry reconciliation — 2026-07-23

**Stage:** specialist-oriented platform landing and acquisition (`#807`)

**Exact integrated/deployed product SHA:** `531699942148fb458e338ad7d8ab48fee7479f61`

**Detailed authority:**
`docs/_TODO/SAAS_FOUNDATION/LANDING_AND_ENTRIES_DESIGN.md` §6. Roadmap summaries were used only for dependency and
status context; they were not used as worker briefs.

## Checklist reality matrix

| Detailed owner checkbox | Code evidence | Test/runtime evidence | Verdict |
|---|---|---|---|
| Phase 0 — dependency confirmation | U1 guard spine is integrated. U5A still lacks the exact two-organization switch/deep-link and revoked-selection proof recorded in the U5A roadmap/log. | No second resolver was built. The missing U5A proof requires an owner-authorized TEST Clinic A/B walkthrough and reversible enrollment lifecycle choice (`#796`). | **owner-deferred / waiting dependency** |
| Phase 1 — landing composition (`PUB-01`) | `LandingAcquisition.tsx`, `LandingHeader.tsx`, `HeroSection.tsx`, `FinalCta.tsx`, `LandingFooter.tsx`; `StandaloneRootRedirect.tsx` remains separate and unchanged. | `LandingAcquisition.test.tsx`; the canonical U6A log records the prior one-pass desktop `1440x900`, mobile `390x844`, link, overflow and browser smoke. | **real-done technically; owner visual acceptance not claimed** |
| Phase 2 — auth-intent hint (non-authoritative) | Specialist CTAs use `/app?intent=specialist`; patient entry uses `/app`; authenticated `AppEntryRsc` redirects from server session role before client rendering; `redirectPolicy.ts` has no `intent` input. | New `AppEntryRsc.authenticatedRedirect.test.tsx` proves specialist-intent + patient, patient-intent + staff, no-intent staff and direct no-intent patient behavior, plus the negative policy assertion. Integrated gate: 6 files, 75 passed / 1 skipped. | **code/test real; checkbox remains partial behind Phase 0** |
| Phase 3 — PWA gate policy change | `PatientClientLayout.tsx` no longer mounts `PwaAppAccessGate`; the component is absent; `pwaAppAccessPolicy.ts` always allows browser cabinet access while preserving messenger-entry detection. Push onboarding still shows an in-context install action; no offline product exists. | PWA/Push focused gate: 2 files, 15 tests PASS. Exact code is deployed; locked TEST smoke returns HTTP 200 for patient appointments and program surfaces. | **code/test/deploy real; manual non-installed authenticated TEST browser click still open** |
| Phase 4 — domain/base-URL de-hardcoding | Landing metadata and wrong-browser banner already consumed server-resolved `app_base_url`. Commit `55749b6de` removes the last ICS literal: booking-done receives the server-resolved URL and confirmation email awaits the same accessor; the pure client-safe ICS helper derives the UID hostname. | Component/helper/email tests are included in the 75/1 integrated gate. TEST public and integrator mirrors both contain `https://test.bersoncare.ru`; live root HTML renders `<meta property="og:url" content="https://test.bersoncare.ru">`. | **code/test/deploy real; live UI `.ics` download and admin setting change/reload proof remain open** |
| Phase 5 — tenant public page | The old design's route question O-1 is superseded by `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md` §8 U6B, “Owner route/slug addendum 2026-07-20” (`/<slug>`, `/<slug>/booking`, `/<slug>/booking/widget`). This surface belongs to U6B and consumes the booking/join dependencies; it was not pulled into this U6A packet. | No second booking engine/profile route was invented. U6B remains dependency-gated in the audited DAG. | **dependency-deferred, not an U6A implementation packet** |
| Phase 6 — full CI + coordination checkpoint | This document is the durable handoff. | Bounded integrated gate passed: Vitest 75/1, touched ESLint, webapp typecheck and diff/status. Incremental TEST deploy preserved the DB, passed build/strict closure, 5/5 services, health/nginx, locked smoke 22/22 and global-admin clinical deny 403. Full repo CI was not repeated for the narrow delta. | **partial until the final owner-acceptance/full-CI checkpoint** |

## ACQ trace

- `ACQ-01`: U6A specialist-first landing, truthful disabled-signup recovery and shared auth rendering hint.
- `ACQ-02…05`: implemented and sealed by completed U3S signup/security work; U6A did not duplicate that flow.
- The roadmap's unchecked `ACQ trace` is therefore not a missing large feature. The exact cross-stage trace now
  exists, while Phase 2 remains dependency-open because Phase 0/U5A is not accepted.

## Residual scope that is not authorized implementation

The roadmap mentions configured pricing, acquisition analytics and public status, but the linked detailed plan/task
contains no atomic implementation checklist for them:

- public pricing lacks a reviewed published projection and a decision on public fields/individual prices/partial
  quotas;
- acquisition analytics lacks an approved event taxonomy, allowed attribution data, consent and retention contract;
- public status lacks an approved source, incident ownership, public copy and degraded/fallback contract.

These are consolidated owner-contract questions, not worker tasks derived from a roadmap summary.

## NOT DONE

- U5A two-organization/revoked-selection owner walkthrough (`#796`).
- Manual authenticated TEST browser proof that `/app/patient` does not navigate to `/#install`.
- TEST UI download of an `.ics` plus an authorized `app_base_url` change/reload proof without redeploy.
- Owner contracts for public pricing, acquisition analytics and public status.
- U6B dependency closure for the published organization page.
- Full repo CI and owner acceptance. Task `#807` is not complete or accepted.

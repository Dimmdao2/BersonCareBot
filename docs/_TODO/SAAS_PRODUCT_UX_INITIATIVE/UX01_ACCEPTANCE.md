# UX-01 Acceptance — factual screen audit

## Baseline universe

Counted from commit `e501709a3` by exact `page.tsx` inventory and rechecked against current UI evidence commit `a537e74df6e5e38d589dd7dc0ec8549dcf848756`:

| Surface               | Page files |
| --------------------- | ---------: |
| `/app/doctor/**`      |         78 |
| `/app/patient/**`     |         49 |
| Other `/app/**` pages |          8 |
| `/book/**`            |         12 |
| `/` + `/legal/**`     |          3 |

Auth/onboarding is not represented only by pages: baseline also contains 43 `/api/auth/**/route.ts` files. Clinic staff invitation contains 5 `/api/clinic/invites/**/route.ts` files. The audit may group coherent dynamic/wizard families, but every page file must be traceable to exactly one inventory row/family or to an explicit exclusion with reason.

`/api/auth/dev-public?view=registration` is a material non-page auth state of `/app` and is part of acceptance even though it does not add a `page.tsx`. After `specialist_signup_enabled=true` was set through the standard DEV admin settings API, the intended specialist/organization signup form rendered on desktop and mobile. No form submit was performed.

## Required evidence per inventory row/family

- actor and product role;
- route pattern and covered source page files;
- server-side guard/access gate;
- current purpose and primary actions;
- layout family;
- organization, specialist and patient context sources;
- important loading/empty/error/permission states;
- visual verification status and screenshot links where reached;
- factual gap;
- preliminary `keep / merge / move / split / retire / needs-decision` label, explicitly marked as a hypothesis.

## Visual evidence rules

- One current desktop and one current mobile capture for every top-level screen or materially unique layout/state.
- Repeated CRUD detail pages may share a visual family only when the inventory names every covered route and explains why the composition is the same.
- Dynamic/data-gated pages must be reached through an existing list/fixture. If no safe fixture exists, mark `NOT VISUALLY VERIFIED` with the attempted entrypoint and reason.
- A route returning login, forbidden, loading forever, empty data unexpectedly or server error is a finding, not a valid screen capture.
- No application-code or delivery mutations solely to manufacture screenshot data. Controlled DEV sandbox data or
  settings changes must use the documented application/ops path, or an explicitly owner-authorized guarded DEV-only
  operation when clearing a copied environment lock; every mutation and purpose must be recorded.

## Independent audit gate

UX-01 is complete only when a fresh auditor confirms:

- baseline universe reconciles with both inventories;
- no role or top-level navigation surface is omitted;
- screenshots exist at referenced paths and match routes/roles;
- guards and context sources are supported by code evidence;
- hypotheses are not presented as owner decisions;
- explicit `NOT VISUALLY VERIFIED` and unresolved gaps are retained;
- no application code or delivery state changed, and every controlled DEV data/settings mutation is explicitly recorded.

## Post-audit correction record

Fix run `UX01-EVIDENCE-FIX-20260715T142736Z` does not change the independent verdict. It records the mechanical allocation that the auditor requested:

| Allocation                                                                                               |  Page files |
| -------------------------------------------------------------------------------------------------------- | ----------: |
| Specialist inventory: `/app/doctor/**`                                                                   |          78 |
| Specialist inventory: `/app/settings` + `/app/settings/patient-home`                                     |           2 |
| Specialist inventory: legacy `/app/admin/promo` redirect in promo family                                 |           1 |
| Patient/public inventory: `/app/patient/**`                                                              |          49 |
| Patient/public inventory: `/book/**`                                                                     |          12 |
| Patient/public inventory: `/` + `/legal/**`                                                              |           3 |
| Patient/public inventory: `/app`, `/app/tg`, `/app/max`, `/app/auth/email-setup`, `/app/contact-support` |           5 |
| **Total, each page allocated once**                                                                      | **150/150** |

## Current reconciliation — 2026-07-15

The original independent verdict remains **FAIL**. It is historical and must not be rewritten as PASS. At this
reconciliation checkpoint a fresh independent audit after the patient replay was still required; that later verdict
is recorded in the final section below.

- Route allocation remains `150/150`; the page-path set is unchanged.
- Current evidence is the DEV role-matrix runs `UX-ROLE-MATRIX/2026-07-15T16-42-31Z` and patient replay
  `UX-ROLE-MATRIX/2026-07-15T17-51-35Z`, plus the three named TEST walkthrough manifests.
- Current selected evidence totals: **71 safe retained/referenced PNG**, of which **66** are valid product/role-state
  evidence and **5** are finding-only. Fourteen older TEST PNG and the two historical maintenance captures are
  explicitly superseded/excluded from those totals.
- Public, regular-doctor, clinic-admin and global-admin role boundaries now have current evidence.
- Registration is verified: desktop/mobile show email, password, specialist name and organization title. Enabling `specialist_signup_enabled=true` was a controlled DEV sandbox settings change through the standard API; signup submit and verification states were not exercised.
- Patient replay now verifies booking, treatment/program, profile, notification settings and desktop/mobile patient
  navigation. With explicit owner authorization, the copied TEST-only lock trigger/function was removed from current
  DEV by a database-name-guarded operation; `patient_app_maintenance_enabled=false` was then written through the
  standard admin API. Synthetic `dev:client` active enrollment was restored in organization `a000...0001`.
  TEST/PROD were not changed and no application code changed.
- Patient Today remains finding-only: desktop/mobile independently reproduce the product error boundary
  `organization_principal_required` after enrollment restoration. This is no longer a maintenance/fixture blocker.
- Regular-doctor communications was attempted but the capture exposed real-looking restored names/messages and was deleted. This remains a privacy/tenant-scope visual gap.
- Assistant has no independent role slice/capability contract; it remains an explicit `needs-decision`, not silently covered by doctor evidence.

Visual attempts and blockers are enumerated in `UX01_VISUAL_ATTEMPT_LEDGER.md`; aggregate counts and canonical manifest links are in `UX01_EVIDENCE_MANIFEST.md`.

## Fresh patient-replay audit verdict — 2026-07-15

**PASS — UX-01 factual current-state audit complete.** The new independent verdict is recorded in
`UX01_PATIENT_REPLAY_AUDIT_2026-07-15.md`; the earlier FAIL records remain historical.

The auditor independently confirmed route allocation `150/150`, all canonical manifest/file references, DEV hashes
and dimensions, evidence arithmetic `71 = 66 valid + 5 finding-only`, explicit supersession/exclusion, role/privacy
boundaries and the controlled DEV mutation record. Patient Today remains finding-only with
`organization_principal_required`. This is a product defect retained by the audit, not a reason to falsify the screen
as verified and not a completion blocker for the factual inventory under the rules above.

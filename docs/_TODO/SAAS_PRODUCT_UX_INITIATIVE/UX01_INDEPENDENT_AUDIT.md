# UX-01 Independent Completeness Audit

> **Historical first audit.** This verdict and its runtime findings describe the pre-refresh evidence run.
> Route-allocation fixes and current role evidence are tracked in `UX01_RECONCILIATION_REVIEW.md`,
> `UX01_EVIDENCE_MANIFEST.md` and `UX01_VISUAL_ATTEMPT_LEDGER.md`. This file is intentionally not rewritten as
> PASS; UX-01 still requires a fresh independent verdict.

**Run ID:** `UX01-INDEPENDENT-AUDIT-20260715T142209Z`
**Date:** 2026-07-15
**Verdict:** **FAIL**

The route counts in `UX01_ACCEPTANCE.md` are reproducible, and the two inventories are broadly useful. UX-01 is not complete because one page file is not traceable, the visual acceptance contract is not met, and retained specialist evidence contains unredacted personal/account identifiers despite the claim that all 34 screenshots are PII-safe.

## Acceptance results

| Independent gate                                             | Result                           | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------ | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Baseline universe reconciles with both inventories           | **FAIL**                         | Exact counts reproduce as 78 doctor + 49 patient + 8 other `/app` + 12 `/book` + 3 root/legal = 150 pages. Specialist covers 78 doctor pages plus both `/app/settings` pages in 31 families. Patient/public covers its stated 49 + 12 + root/legal/auth entry surfaces. However, `apps/webapp/src/app/app/admin/promo/page.tsx` is absent from both inventories. It is a legacy redirect to `/app/doctor/treatment-program-promo` and must be named in that family or explicitly excluded. Current traceability is 149/150, not 150/150.                                                                                                                                                                                                                                                                                                   |
| No role or top-level navigation surface is omitted           | **PASS**                         | Doctor navigation tiers in `doctorNavLinks.ts` map to the specialist families; patient primary navigation (`Today`, treatment, diary, booking, messages) maps to patient families. Clinic management, platform-admin, profile and notification entrypoints are represented. The omitted `/app/admin/promo` page is a non-navigation legacy redirect, but still fails the baseline criterion above.                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Screenshots exist at referenced paths and match routes/roles | **FAIL**                         | All 34 specialist and 13 patient/public referenced PNG names exist, and the two directories contain exactly those files. Dimensions are consistent with 1480x1024 desktop and 390x844 mobile captures. The evidence is not acceptance-safe: `doctor-exercises-mobile.png` is `ERR_CONNECTION_REFUSED`; the corresponding desktop is only a loading state; `patient-treatment-mobile.png` is a blocked/limited shell with a dev issue badge. More seriously, specialist captures expose unredacted personal/account data: `global-technical-{desktop,mobile}.png` contains phone and messenger identifiers; `global-integrations-{desktop,mobile}.png` contains a connected personal email account; `doctor-media-library-{desktop,mobile}.png` contains named patient folders. Thus the summary claim “PII-safe screenshots: 34” is false. |
| Guards and context sources have code support                 | **PASS**                         | Risk-based checks support the main claims: `/app/doctor/**` resolves one organization membership in `requireDoctorWorkspaceContext`; the doctor layout passes organization, membership, specialist and management capabilities into the shell; clinic management requires global admin mode or `canManageOrganization`; global-admin page guard checks platform role; patient layout requires a session/allowed patient role and applies the business gate; messages additionally require patient access with phone; public booking validates branch and service against the same organization. The reported admin-mode/page-guard mismatch and hard-coded single-specialist chat title are real.                                                                                                                                          |
| Hypotheses are not presented as owner decisions              | **PASS**                         | `REQUIREMENTS.md` labels starting UX hypotheses as non-decisions. Both inventory tables label disposition as a hypothesis, and the specialist introduction explicitly says the pass is not target IA or an implementation decision.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Explicit visual gaps and unresolved findings are retained    | **FAIL**                         | Both inventories retain substantial `NOT VISUALLY VERIFIED` sections and correctly refuse to count the patient limited shell as business-content verification. But acceptance requires a desktop/mobile capture for each top-level or materially unique state, or an explicit attempted entrypoint and reason. Many rows are only “code verified” or “covered by representative” without an attempted entrypoint/reason; patient auth/setup/support/TG have mobile-only evidence; patient booking has desktop-only evidence; multiple safe or potentially safe top-level families lack paired evidence. The invalid exercises pair is nevertheless included in the 17-pair/34-screenshot summary.                                                                                                                                          |
| No application code, DB data or delivery state changed       | **PASS with runtime limitation** | `git diff --name-only` shows only the initiative log, and the two inventories/acceptance file are untracked; no application source file is changed. The inventories state that no migration, send, booking, payment, upload or form submission was performed. DB/delivery non-mutation cannot be independently proven from repository state, but no contrary filesystem evidence was found and this audit performed no server, DB or delivery action.                                                                                                                                                                                                                                                                                                                                                                                      |

## Exact reconciliation

Commands run from `/home/dev/dev-projects/BersonCareBot-work3`:

```text
rg --files apps/webapp/src/app/app/doctor | rg '/page\.tsx$' | wc -l   => 78
rg --files apps/webapp/src/app/app/patient | rg '/page\.tsx$' | wc -l  => 49
rg --files apps/webapp/src/app/app | rg '/page\.tsx$' | rg -v '/(doctor|patient)/' | wc -l => 8
rg --files apps/webapp/src/app/book | rg '/page\.tsx$' | wc -l         => 12
rg --files apps/webapp/src/app/legal | rg '/page\.tsx$' | wc -l        => 2
find apps/webapp/src/app -maxdepth 1 -type f -name 'page.tsx' | wc -l  => 1
rg --files apps/webapp/src/app | rg '/page\.tsx$' | wc -l             => 150
rg --files apps/webapp/src/app/api/auth | rg '/route\.ts$' | wc -l    => 43
rg --files apps/webapp/src/app/api/clinic/invites | rg '/route\.ts$' | wc -l => 5
rg '^\| [0-9]+ \|' SCREEN_INVENTORY_SPECIALIST.md | wc -l           => 31
```

The eight other `/app/**` pages are:

```text
/app
/app/admin/promo
/app/auth/email-setup
/app/contact-support
/app/max
/app/settings
/app/settings/patient-home
/app/tg
```

Allocation found in the inventories: two settings pages in specialist; five public/auth pages in patient/public; `/app/admin/promo` unallocated.

Evidence checks:

```text
rg -o '[A-Za-z0-9_-]+\.png' SCREEN_INVENTORY_SPECIALIST.md | sort -u | wc -l => 34
find .claude/screenshots/SAAS-UX-01-SPECIALIST -maxdepth 1 -type f -name '*.png' | wc -l => 34
rg -o '[A-Za-z0-9_-]+\.png' SCREEN_INVENTORY_PATIENT_PUBLIC.md | sort -u | wc -l => 13
find .claude/screenshots/SAAS-UX-01-PATIENT-PUBLIC -maxdepth 1 -type f -name '*.png' | wc -l => 13
identify -format '%f %wx%h\n' <both evidence directories> => specialist pairs 1480x1024/390x844; patient/public files use the same two sizes
git check-ignore -v <representative screenshot> => `.gitignore:53:.claude/`
git ls-files .claude/screenshots | wc -l => 0
```

Visual inspection was risk-based and included technical settings, integrations, media library, health archive, clinic settings, patient home, patient booking, patient treatment and the known failed exercises capture. No sensitive values are reproduced in this report.

## Required fixes before PASS

1. Add `/app/admin/promo` to the treatment-program-promo redirect family, including actor/guard/context/disposition, or add an explicit justified exclusion. Re-run a mechanical 150-page traceability check.
2. Remove the six identified specialist PNGs containing personal/account identifiers from retained evidence, or replace them with safely redacted/test-fixture captures. Review all remaining captures for linkable identifiers before calling them PII-safe.
3. Do not count connection-refused, unresolved loading, blocked, login, forbidden or dev-error shells as verified layout pairs. Keep them only as named findings.
4. For every top-level/materially unique family, provide both desktop and mobile captures where applicable. Where safe access is impossible, record `NOT VISUALLY VERIFIED`, the exact attempted route/entrypoint, the observed blocker, and why a representative family is sufficient if grouping is used.
5. Correct the specialist coverage summary after invalid/sensitive captures are removed. The current `34 PII-safe / 17 pairs` statement is unsupported.
6. Decide how evidence will be made durable for reviewers. `.claude/` is ignored and none of the referenced PNGs are tracked, so the current paths exist only in this worktree and will not survive an ordinary clone/branch handoff.

## Residual risks

- Code-level page traceability does not prove the 43 auth and 5 clinic-invite API routes form complete end-to-end activation/recovery journeys; that belongs to UX-04, but UX-01 should keep the current absence explicit.
- Several specialist pages inherit a parent guard while child APIs have narrower permissions. The inventory correctly identifies the schedule-setup mismatch, but a route-level audit alone cannot prove every action is capability-consistent.
- The dev schema mismatch prevents reliable patient business-state evidence. No product conclusion should be drawn from the limited shells.
- Screenshot evidence is local, ignored and currently contains sensitive material. It must not be pushed or copied into a durable artifact before redaction/removal.

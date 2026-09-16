# UX-01 Patient Replay Independent Audit — 2026-07-15

**Verdict:** **PASS — UX-01 factual current-state audit complete**

This PASS closes the evidence/audit stage, not the discovered product defects. Patient Today remains an invalid
product state and is counted only as a finding.

## Acceptance checks

- Source allocation is exact: `81 specialist + 69 patient/public = 150/150` `page.tsx` files. The split independently
  re-counts as `78 /app/doctor`, `49 /app/patient`, `12 /book`, `3 root/legal` and `8 other /app`; the two settings
  pages and `/app/admin/promo` are allocated to the specialist inventory exactly once.
- All nine canonical manifests exist. Every referenced/selected PNG exists; DEV manifest SHA-256 values match the
  files, declared DEV dimensions match `1480×1024` or `390×844`, and all TEST dimensions were independently read.
- Current evidence arithmetic is consistent: `71 safe = 66 valid + 5 finding-only`. Fourteen superseded TEST frames
  and two historical maintenance frames are excluded from current totals.
- The patient replay contributes seven valid booking, treatment/program, profile, notification-settings and
  navigation frames. Desktop/mobile Today independently reproduce `organization_principal_required`; both are
  finding-only under the acceptance rule that an error capture is a finding, not valid verification.
- Doctor, clinic-admin and global-admin desktop evidence supports the recorded navigation boundaries. The identical
  doctor/clinic-admin mobile hashes are not treated as expanded-menu proof. Assistant remains an explicit
  `needs-decision` gap.
- Retained DEV identities are explicit synthetic `Demo` fixtures. Unsafe communications/global-settings captures
  were deleted and are not counted. The regular-doctor communications omission remains explicit.
- Controlled DEV mutations are recorded: owner-authorized, database-name-guarded removal of the copied TEST-only
  lock; maintenance setting update through the standard admin API; restoration of synthetic patient enrollment.
  TEST/PROD, application code and external delivery state were not changed.
- Historical FAIL audits are preserved as historical records. Disposition labels remain hypotheses rather than
  owner decisions.

## Why the Today defect does not fail UX-01

`UX01_ACCEPTANCE.md` requires error states to be classified as findings and unresolved gaps to remain explicit; it
does not require product defects discovered by the factual audit to be fixed. The replay now establishes the current
patient state and its failure mode without a maintenance or fixture blocker. Therefore Today is a retained product
defect for later design/implementation work, while the factual evidence gate passes.

## Retained gaps

- healthy patient Today state (`organization_principal_required`);
- deeper patient messages, reminders, diary, purchases/memberships and multi-organization states;
- registration submit, verification and first-run;
- privacy-safe regular-doctor communications;
- expanded global-admin mobile navigation;
- valid invite, signed miniapp, payment/write/delivery flows.

# MISSION: independent audit of commit `a678edc7e` — stages 1–2 of the tariff-mechanics plan (read-only)

You audit code, not intentions. The worker's own report is an input signal, never proof.

## Authority

- **Plan (the only source of «done»):** `docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md §5a`, stage 1
  (1.1–1.4) and stage 2 (2.1–2.10). Quote each checkbox ID and its full text in your matrix.
- **Model canon:** `docs/_TODO/SAAS_FOUNDATION/QUOTAS_AND_MECHANICS_DESIGN_2026-07-28.md` §1 (owner rulings),
  §3 (five classes), §4 (layout), §5 (behaviour at the limit).
- **Worker report (claims to verify, not to trust):** `docs/_TODO/runs/tariff-mechanics/STAGE12_WORKER_REPORT.md`.
- **Rules the change must obey:** `.cursor/rules/tests-check-behaviour-not-circumstances.mdc`,
  `.cursor/rules/webapp-tests-lean-no-bloat.mdc`, plus any rule matching the touched files.

## What to verify — with the diff open

1. **Per-checkbox matrix:** `checkbox → status → code evidence (file:line) → test evidence → what is genuinely
   unproven`. A checkbox whose evidence you cannot confirm in the code is `NOT DONE`, regardless of the report.
2. **Class model matches the canon exactly:** five classes `возможность | места | запас | объём | никогда`, no
   invented sixth, no leftover `count`. Units allowed only where the class allows them. Confirm the compile-time ban
   really is compile-time: find the type construct and say why an illegal combination cannot type-check.
3. **Numbers survive in exactly two places** after these stages: specialist seats and file volume (bytes). If a
   number can still be stored for any other mechanic, name it — that is a MUST FIX.
4. **Migrations:** the two triggers really are dropped (`app.enforce_courses_snapshot_quota`, the `0270` CMS page
   trigger), the migration is idempotent-safe, and it does not renumber or touch other people's migrations. The
   temporary number `0275` is expected — the lead assigns the final one at merge.
5. **⚠️ Read paths must NOT be gated.** Canon §5.1: a disabled mechanic blocks creating and changing; everything
   already created stays visible and exportable. The worker claims it removed read gates
   (`requireEntitlement.ts`, notification-templates route). Verify it did not go too far in the other direction:
   mutation paths must still be gated. Both directions are defects — report whichever you find.
6. **2.9 material ratings:** verify the platform-wide switch is a setting and not a tariff mechanic, and that the
   write refusal is real (not only a default value).
7. **2.7 notification templates:** verify they are gated by `branding` on the mutation path, and that no separate
   mechanic was introduced.
8. **Tests:** does each new or changed test name a plausible breakage and would it actually go red? Pick the two most
   important ones and reason about what code change would break them. Report source-text assertions, new files with a
   single `it`, or tests that only re-assert a stub as findings.
9. **Nothing out of scope:** patient card / patient app must not become controllable mechanics; treatment-program
   templates, exercise-complex templates, patient messaging and cancellation policies must have neither toggle nor
   number; billing, the support system, the test-runner config and production must be untouched.
10. **`git diff --stat` sanity:** any file outside the plan's scope boundaries (§1 of the plan) is a finding.

## Rules for findings

- Each MUST FIX names the concrete reachable failure, its impact, and the exact requirement violated.
- Style, preferences, theoretical edge cases without a path, extra hardening and «could be better» are not findings.
- Do not propose an alternative architecture, do not rewrite the code. You are read-only: change no files.
- The worker reported two blockers — DEV runtime probes refused by the migration path guard in a clone, and 2.8
  (clinic-owned mailing channels do not exist). Say whether each blocker is real and correctly scoped, or an excuse.

## Output

1. `VERDICT: PASS` / `PASS WITH FIXES` / `FAIL`.
2. The per-checkbox matrix.
3. Numbered MUST FIX list.
4. Short «что сделано верно» section.
5. «Что я не смог проверить» with reasons.

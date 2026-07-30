# MISSION: audit of step 4.0 — commit `4d299dc4f`, registration only (read-only)

This commit is supposed to declare mechanics and nothing else. Its whole value is that it does not smuggle in
behaviour, and that the declarations are right — thirteen keys the next stages depend on.

## Authority

- **Plan:** `docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md §5a` — item **4.0**, scope §1, policy §2.
- **Canon:** `docs/_TODO/SAAS_FOUNDATION/QUOTAS_AND_MECHANICS_DESIGN_2026-07-28.md` §3 (classes), §4 (the required
  layout — this is the reference list), §8 (owner mechanics default-off, enabled through the existing organization
  exception).
- **Worker claims (verify, do not trust):** `docs/_TODO/runs/tariff-mechanics/STAGE40_WORKER_REPORT.md`.

## Questions

1. **Exactly the right keys, no more and no less.** Compare the registry against canon §4. Two `запас` keys (patients,
   branches) and eight `возможность` keys plus the three owner ones. Flag any extra key, any missing key, and
   specifically confirm these are absent: поддержка, объём видео, участники курсов, шаблоны программ лечения, шаблоны
   комплексов ЛФК, переписка с пациентом, правила отмены записи. Confirm statistics and booking-source analytics are
   ONE key, not two.
2. **Classes and labels.** Every new key has the canonical class and a Russian label; no machine key can reach a screen.
3. **`запас` is fail-closed.** A missing configured limit for patients or branches must resolve to disabled, never to
   unlimited. Verify the test really proves it and name the code line it relies on.
4. **Owner mechanics default-off.** «Сегодня», разминки, промо are disabled for a normal organization and enabled by the
   existing organization exception — no new table, no new screen, no data migration. Would the test notice if the
   default flipped to on?
5. **Registration only.** `git diff` must contain no guard calls in domain routes, no UI change, no migration, no
   behaviour change. Anything else is a finding.
6. **Honest unknowns.** The worker says two protected-action rows could not be determined (patient creation/reactivation
   handler, external calendar) and recorded them as no-surface instead of guessing. Confirm they are recorded honestly
   and that nothing was silently pointed at a wrong handler — a wrong row is worse than a missing one, because a later
   coverage check would look green.

## Rules

- MUST FIX only for a reachable break with named impact, or a declaration that will send the next stage down a wrong
  path. No style, no theory, no alternative design.
- Read-only: change no files, no migrations, never the full CI. Targeted typecheck and the entitlements test file are
  fine if the sandbox permits; if not, say so.

## Output

`VERDICT: PASS | FAIL`, the six answers with file:line evidence, numbered MUST FIX (empty is valid), and one line on
anything unchecked.

MISSION: calibration measurement for the test-suite cut (HOW-A). This is a MEASURE + RECOMMEND job.
DELETE NOTHING. Do not remove or rewrite any test. Your output is numbers + a config recommendation.
Work in English internally; the final report file is Russian (repo doc convention).

## Authority (read first, do not re-derive)
- Plan: `docs/_TODO/TEST_SUITE_AUDIT_2026-07-29.md`, section «Как это исполнять (HOW)», sub-section HOW-A
  (steps A1–A9) and the «💡 ИДЕЯ НА ОБСУЖДЕНИЕ» block about the warm process. Also the «ЗАМЕРЫ 29.07» pilots
  (sessionCookie 224 mutants/261s/3.57%; entitlements 382/2.88%).
- Existing configs to reuse: `apps/webapp/stryker.pilot.json`, `apps/webapp/stryker.entitlements.json`.

## Why this run exists
Before cutting the 200 heavy files by mutation, we must MEASURE real cost on representative module types and
settle two open questions, so the multi-day cut is scheduled from facts, not guesses:
1. Cost per mutant on a LIGHT-import module vs a HEAVY Next-import module (is heavy really ~2×? 3×?).
2. The owner's warm-process idea: does keeping the test-runner process warm across mutants (a) speed things up
   and (b) keep verdicts IDENTICAL (no state leakage)? A changed verdict under warm mode = leakage = unsafe.

## Do exactly this — three representative modules

For each module: use `coverageAnalysis: perTest`, `disableBail: true` (per-test attribution), `disableTypeChecks: true`,
`concurrency: 2` (shared 8-core box with brain — do NOT use 4, and never run while a full build/test is running),
`timeoutMS: 60000`, `ignoreStatic` NOT globally true (leave default false; note if static mutants dominate).
Mutate ONLY the module's own source file(s), not its whole dir. Record for each: total mutants, killed, survived,
no-coverage, timed-out, mutation score, wall-clock seconds, and seconds-per-mutant.

- **M1 — light/pure (reproduce the pilot):** `apps/webapp/src/modules/auth/sessionCookie.ts`. Confirm the harness
  reproduces roughly the pilot (≈224 mutants, ≈1.1–1.3 s/mutant). This validates the setup before trusting M2/M3.
- **M2 — heavy Next-import:** pick ONE client/component module that (a) has an existing test and (b) pulls a heavy
  React/Next import graph — e.g. `app/app/doctor/treatment-program-templates/[id]/TreatmentProgramConstructorClient.tsx`
  (it has `.reorder.test.tsx`) or a comparable heavy `app/**` client module you find. Measure s/mutant and compare
  to M1 — report the actual multiplier. If dry-run > 90 s or projected > 15 min, SPLIT/narrow and say so.
- **M3 — live-DB boundary (cost probe only):** pick ONE module under `src/infra/repos/**` that has a `*devDb*` or
  `*.integration.*` test. If running it requires `RUN_*_DEV_DB=1 / USE_REAL_DATABASE=1` and a live DB you cannot
  stand up safely, DO NOT fake it — record M3 as "deferred: needs ephemeral DB harness (HOW-B tier 1)" with the
  reason, and measure only what runs without the real DB. Never mark skipped as done.

## Warm-process experiment (the owner's idea — the point of this run)
On M1 (cheap, deterministic), run the SAME mutation set TWICE:
- COLD: default runner (`maxTestRunnerReuse: 0`).
- WARM: `maxTestRunnerReuse` set high (e.g. 50) so the runner process is reused across mutants.
Compare: (a) wall-clock and s/mutant (speedup?); (b) the killed-mutant set and survived-mutant set — they MUST be
byte-identical between COLD and WARM. Report any mutant whose verdict differs (that is state leakage → the warm
mode is unsafe as-is). Give a clear verdict: warm safe + how much faster, OR warm leaks (list the divergent mutants).

## Deliverable
Write `docs/_TODO/runs/testcut-how/CALIBRATION.md` (Russian) with:
1. Table: module | mutants | killed | survived | no-cov | timeout | score | wall-s | s/mutant.
2. Heavy-vs-light multiplier (M2/M1), and the projected cost to mutate the 200 heavy files at that rate.
3. Warm-vs-cold: speedup + verdict-stability result (safe / leaks-with-list).
4. Recommended `stryker.batch.json` settings (concurrency, reuse, ignoreStatic policy, timeout), justified by the numbers.
5. Any surprises / honest uncertainty.
Save the raw Stryker JSON reports under `runs/stryker-calib/` (already gitignored at repo root — fine).
Commit the report + any batch config you add to the feat branch of this clone with a `plan(тесты)` message
referencing #1074. Do NOT touch existing tests. Do NOT delete anything.

If the baseline (Stryker initial dry-run) is red for any module: STOP that module, record "baseline red — cannot
attribute", do not fake results. A red baseline is "fix the baseline", never "a mutant survived".

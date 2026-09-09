# Тест или взгляд — #915 NativeJitsi lifecycle continuation

## Authority and exact candidate

- Audit only `/home/dev/dev-projects/bcb-wt-mobile-web-native-jitsi-20260909`, branch `wt/mobile-web-native-jitsi-20260909`, exact closing product commit `770b5e750` after original product `0616d6d2a`, independent audit/tests `4735b7009` and rejected first correction `3b86797a9`.
- Before every action run the `AGENTS.md` heading map. Fully read relevant §5, §9–§10b, §12, §16–§17 and §24, `docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md` M3/M4/M7, the original blind kill-set/report, and the full accumulated product diff.
- Product code, plan, taskdb and audit queue are read-only. You own only justified behavioral tests in the existing NativeJitsi test files plus `.lead/runs/mobile-web-native-jitsi-lifecycle-continuation-audit-20260909/**`. No DB/deploy/live delivery/PROD/push.

## Continuation, not a new scope

Reuse the original blind kill-set; do not invent a second list or style findings. Verify every original item against `770b5e750`, with special focus on the three same lifecycle forms that lead found after the first audit:

1. Two launches using the same endpoint and room are serialized; a prior `CONFERENCE_TERMINATED`/`READY_TO_CLOSE` or Activity destruction cannot be emitted with or terminate the replacement id. Include retry of the same room and ordinary session replacement.
2. Unmount/session replacement after a start or permission request but before its outcome cancels only that preallocated id; it cannot leave its Activity/pending launch alive or hang up the later launch.
3. Retry returning unavailable removes the native listener/ownership before iframe fallback; old shells that omit the echoed id are closed and degrade to browser behavior.
4. Preserve exact endpoint/room/token pass-through, trusted-origin and validation gates, one terminal callback, diagnostic mapping, provider-neutral three-caller seam and ordinary browser/PWA iframe renderer.

Use the cheapest public layer. Add tests only for expensive silent behaviors not already proven by the retained suite/existing NativeJitsiPluginTest; do not test source text, callback implementation details, labels, DOM shape or timing accidents. For each retained/new independent class, perform one targeted fault injection and record which assertion turns red. A real failure must name the reachable scenario, impact and M4 requirement; style/alternative architecture is not a finding.

## Required validation and result

- Run the existing NativeJitsi Java tests on all four brand×environment debug variants under `/home/dev/brain/host-orch/run-tests.sh` if test/product paths require it.
- Run retained Jitsi web stage/renderer tests, scoped ESLint and webapp typecheck (build only existing declaration packages if needed); `git diff --check` must pass.
- Confirm product paths are clean after every mutation and no test weakens the original oracle.
- Write `00-continuation-killset.md` and `90-final-audit-report.md` under the continuation run directory, with exact candidate SHA/commands, per-item PASS/FAIL/BLOCKED, `убито N / непойманных N`, and explicit product-clean statement.
- Commit only auditor-owned test/artifact changes with `#915`; do not push. End with binary PASS/MUST FIX, commit SHA and blockers.

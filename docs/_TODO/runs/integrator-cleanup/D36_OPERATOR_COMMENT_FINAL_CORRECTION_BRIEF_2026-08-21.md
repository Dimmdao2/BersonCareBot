# D36 operator comment final correction brief (2026-08-21)

## Источник оракула
«correct/remove the `operatorDeliveryAttempts.ts:57` comment's mechanism reference» — independent audit `/home/dev/brain/runs/agent-port/test-hygiene-source-gates-audit-20260821.json`; owner D36 warning and `AGENTS.md` §10a/§24.6.

The prior correction commit `0d99fce88` correctly fixed both docs references, but replaced the deleted
test name in `apps/integrator/src/infra/db/repos/operatorDeliveryAttempts.ts` with another active claim that
generic static analysis checks the literal call argument. That is still false: the removed per-callsite
sentinel was the only such check. The surviving census verifies runtime/declaration surface, not this literal.

Change exactly that production comment. Remove the false static-analysis/literal-enforcement explanation.
Prefer removing the comment entirely; do not invent a new reason for the literal and do not change the call,
function identity, product behavior, tests, gates or either already-corrected docs file.

Verification: exact one-file diff, `git diff --check`, and no active reference in the file to the deleted test
or a generic source/static analyzer that supposedly enforces this call-site form. Commit the change. No DB,
DEV/TEST/PROD, fixture/disposable DB, tests/full CI, deploy or push. Existing independent audit is reused; no
new audit pass.

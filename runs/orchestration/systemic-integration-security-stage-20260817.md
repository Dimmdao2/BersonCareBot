# Systemic integration — security visibility stage — 2026-08-17

## Scope and outcome

- Worktree: `/home/dev/dev-projects/bcb-wt-systemic-integration-20260817`.
- Branch/base: `wt/systemic-integration-20260817` at `0eb0e2bae559784c5d7a4fba0d05906d13e5c2ab`.
- Audited source commit: `f115d9f03d65ed7503f3ca15ca9b17d78fe022ff`.
- `git cherry-pick f115d9f03d65ed7503f3ca15ca9b17d78fe022ff` produced integration commit
  `484f1ceda` without conflicts.
- No ignore was added, no secret value or history was changed, and no provider/network, DB, DEV, TEST, PROD,
  deploy, push, or merge action was performed.

The stage is repository-complete but intentionally leaves the security gate red: provider-side rotation/revocation
evidence for the historical Telegram credential is absent. The one detected historical finding therefore remains
unignored and blocking by design.

## Synthetic detection and visibility gate

The exact workflow self-test body was extracted and executed outside the checkout:

```bash
set -o pipefail
sed -n '96,134p' .github/workflows/security.yml \
  | sed 's/^          //' \
  | RUNNER_TEMP=/tmp bash
```

Result: **PASS**. Gitleaks v8.30.1 parsed `.gitleaks.toml`, returned non-zero for the generated non-issued fixture,
and the workflow assertion accepted exactly one `telegram-bot-token-assignment` finding.

```bash
node --test scripts/checked-push-security.test.mjs
```

Result: **2/2 PASS**. The renderer emits both summary rows and GitHub error annotations for redacted SARIF
locations, and checked push remains non-zero when the discovered Actions run is red.

```bash
node --check scripts/render-gitleaks-sarif.mjs
node --check scripts/checked-push-security.test.mjs
pnpm exec eslint --no-warn-ignored -- scripts/checked-push-security.test.mjs
```

Result: **PASS**. `actionlint` is not installed on this host, so no `actionlint` result is claimed. The executed
workflow self-test and Gitleaks config parse are the YAML/config runtime evidence for this bounded stage.

The actual redacted full-history SARIF was also passed through the production renderer:

```bash
node scripts/render-gitleaks-sarif.mjs \
  /tmp/bcb-systemic-integration-security-stage-gitleaks.sarif
```

Result: **PASS**. It rendered one summary row and one `::error` annotation with rule, location, and abbreviated
commit only; no credential value was rendered.

## Full-history red gate

```bash
gitleaks git . --no-banner --redact \
  --config .gitleaks.toml \
  --gitleaks-ignore-path .gitleaksignore \
  --report-format sarif \
  --report-path /tmp/bcb-systemic-integration-security-stage-gitleaks.sarif
```

Expected result: exit **1**, **7,294 commits**, about **185.23 MB**, exactly **1 finding**. Metadata-only parse:

```text
rule:   telegram-bot-token-assignment
path:   src/integrations/telegram/config.ts
line:   12
commit: 03eca9c8bb02
```

This is the intentional red blocker. It must not be ignored or made green in repository code without named
provider-side rotation/revocation evidence.

## Ignore invariants

```bash
git diff --exit-code HEAD^..HEAD -- .gitleaksignore
cmp --silent .gitleaksignore \
  /home/dev/dev-projects/bcb-wt-gitleaks-visibility-20260817/.gitleaksignore
```

Result: **PASS**; the integration stage and audited source have the identical ignore file
(`sha256 3e99fadd9cb7e7e2aff634a660f1bf936edbb397c2fc522890b7e7f62b5d8fc6`).

```bash
rg -c '^55a955a2efe7a4265f2903aacdc1b2fea2730d4a:scripts/refresh-prod-to-target-cutover\.mjs:generic-api-key:(19|28|33|48)$' \
  .gitleaksignore
sed -n '7,11p' .gitleaksignore | wc -l
```

Results: exactly **4** existing `pg_dump --restrict-key` false-positive fingerprints and exactly **5** existing
historical real-credential fingerprints. All nine remain byte-for-byte unchanged; none is rotation/revocation
evidence.

## Diff integrity

```bash
git diff --check HEAD^..HEAD
```

Result: **PASS**. Full CI was not run for this isolated stage: the changed surface is the Gitleaks workflow/rule
and its focused security test, all of which are exercised above. Final integration/runtime gates remain the
orchestrator's later boundary.

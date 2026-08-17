# Gitleaks Telegram bot token visibility — 2026-08-17

## Outcome

The repository security gate now detects the historical canonical Telegram Bot API credential that bundled
Gitleaks v8.30.1 missed when the assignment key was named `botToken`. The added rule is limited to the proven
repository keys `botToken`, `telegram_bot_token`, and `TELEGRAM_BOT_TOKEN` plus the canonical Telegram token
shape. It is not a broad entropy rule.

The finding is intentionally **not** added to `.gitleaksignore`. Full-history Gitleaks is expected to remain red
with one metadata-visible, value-redacted historical finding until provider-side rotation/revocation evidence is
available. This repository change does not claim or perform provider rotation, history rewriting, deployment, or
environment mutation.

## Visibility contract

- The scan continues to write redacted SARIF.
- `scripts/render-gitleaks-sarif.mjs` renders every SARIF result as a rule/location/commit row in the Actions step
  summary and as a GitHub error annotation without exposing the secret value.
- `gitleaks-report` remains an always-uploaded artifact.
- `tools/git-push-and-wait.sh` remains fail-closed for red Actions runs and renders downloaded Gitleaks SARIF for
  the pushing agent. A bare `leaks found: N` cannot be treated as a successful push.
- The CI negative self-test now generates a non-issued Telegram-shaped token under `$RUNNER_TEMP`, outside the
  checkout, and requires exactly one `telegram-bot-token-assignment` finding.

## Historical baseline invariants

- The four exact `55a955a2efe7a4265f2903aacdc1b2fea2730d4a` `pg_dump --restrict-key` false-positive
  fingerprints remain unchanged in `.gitleaksignore`.
- The five exact historical Rubitime/Telegram `generic-api-key` fingerprints remain unchanged. Their presence is
  not rotation/revocation evidence and remains an operations follow-up.
- The newly detected Telegram bot token is not ignored and its value or fragment is not recorded here.

## Verification

All commands below were run without printing secret material.

- Extracted CI self-test block piped through `bash -n`, then executed with `RUNNER_TEMP=/tmp`: PASS. Gitleaks
  parsed `.gitleaks.toml`, exited non-zero on the generated fake, and produced exactly one
  `telegram-bot-token-assignment` SARIF result.
- `node --test scripts/checked-push-security.test.mjs`: PASS, 2/2. The renderer fixture contains two findings and
  proves both locations become annotations/summary rows while full commit fingerprints remain absent from output;
  checked push remains non-zero on a red Actions run.
- `node --check scripts/render-gitleaks-sarif.mjs` and
  `node --check scripts/checked-push-security.test.mjs`: PASS.
- `gitleaks git . --no-banner --redact --config .gitleaks.toml --gitleaks-ignore-path .gitleaksignore
  --report-format sarif --report-path /tmp/bcb-gitleaks-bot-token-full-history-final2.sarif`: expected exit `1`;
  7,280 commits / 184.85 MB scanned; exactly one finding. Metadata only:
  `telegram-bot-token-assignment`, `src/integrations/telegram/config.ts:12`, commit `03eca9c8bb02`.
- `git diff --numstat -- .gitleaksignore | wc -l`: `0`.
- `rg -c '^55a955a2efe7a4265f2903aacdc1b2fea2730d4a:scripts/refresh-prod-to-target-cutover\.mjs:generic-api-key:(19|28|33|48)$' .gitleaksignore`:
  `4` exact `pg_dump --restrict-key` false-positive fingerprints.
- `sed -n '7,11p' .gitleaksignore | wc -l`: `5` exact historical real-credential fingerprints.
- `git diff --check`: PASS.

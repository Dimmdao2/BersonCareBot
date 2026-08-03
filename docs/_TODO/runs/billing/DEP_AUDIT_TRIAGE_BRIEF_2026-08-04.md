# Dependency audit gate is red — triage the new advisories

Rules: `AGENTS.md` — Маршрут, CORE rules, §9 (full CI gate), §24. Language: internal work is English.

⚠️ **One-shot agent, no next turn** (`AGENTS.md` §24.2): run long commands in the foreground, **commit before you
finish**.

Authority: this brief (bounded operational gate failure, `ORCH_OPS`). `AGENTS.md` §9 makes the full CI gate the
condition for deploy and merge, so a red `registry-prod-audit` blocks everything.

Источник оракула: `AGENTS.md` §9 — полный `pnpm run ci` обязателен перед deploy/merge; красный гейт означает,
что выкатывать нельзя, пока причина не разобрана.

## What happened

Full CI on `feat/doctor-ui-rebuild` at 2026-08-04 00:14 MSK: **all tests and typechecks passed**, the run failed
only on `registry-prod-audit` — newly published advisories:

- `fast-uri@3.1.4` — high, host confusion via backslash authority introducer (fixed in >=3.1.5)
- `undici@8.5.0` — one high + four moderate (all fixed in >=8.9.0)
- `hono@4.12.27` — moderate, ReDoS in CORS middleware (fixed in >=4.12.34)
- `ip-address@10.2.0` — one high + two moderate (SSRF / trust-boundary classification)

## Work

1. For each advisory, establish **whether the vulnerable path is reachable from our code** — a direct dependency,
   a transitive one behind a package we call, or dev-only. Do not assume from the name.
2. **Bump what can be bumped.** All four have patched versions. Prefer the smallest upgrade that clears the
   advisory; run the full test suite after, not just the touched files.
3. For anything that genuinely cannot be bumped (a peer pin, a breaking major), use the repository's existing
   suppression mechanism the same way it is already used for `brace-expansion` — with an explicit reason, the
   reachability argument, and an expiry date. A suppression without a reachability argument is not acceptable.
4. Re-run the full CI in the foreground and show it green.

## Boundaries

- No product code change beyond what a version bump forces.
- Do not disable the audit gate, do not lower `audit-level`.
- **PROD (`135.106.162.170`) is untouchable.** No deploy.
- No push.

## Done means

- `pnpm run ci` green, with the log path in the report.
- Every advisory either cleared by a bump or suppressed with a written reachability argument and an expiry.
- One commit on your branch.

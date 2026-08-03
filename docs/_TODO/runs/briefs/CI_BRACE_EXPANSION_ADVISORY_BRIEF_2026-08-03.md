# Full CI is red on a new brace-expansion advisory

Rules: `AGENTS.md` — Маршрут, CORE rules, §9 (full CI gate), §24. Language: internal work is English.

⚠️ **One-shot agent, no next turn** (`AGENTS.md` §24.2): never end while something runs in the background;
**commit before you finish**.

Authority: this brief (bounded operational fix, `ORCH_OPS`). Blocks every deploy until green.

## The measured failure

`/home/dev/brain/host-orch/run-tests.sh 'pnpm run ci'` on `feat/doctor-ui-rebuild` → `exit 1`, `465s`. All
product gates passed; the failure is `registry-prod-audit`:

```
- brace-expansion@5.0.8: [high] DoS via unbounded intermediate arrays, bypassing the CVE-2026-14257 mitigation (>=4.0.0 <5.0.9)
- brace-expansion@1.1.16: [high] same advisory (<1.1.18)
  https://github.com/advisories/GHSA-rgw5-rvv9-x895
```

Both are transitive. There is already a suppression in the repo for a **different** advisory
(`GHSA-mh99-v99m-4gvg`, until 2026-10-27) whose comment explains why an override was refused then: forcing
`>=5.0.8` broke eslint, because the v5 CJS export is an object rather than a callable, and `@eslint/eslintrc`
pins `minimatch@^3.1.5`.

## Work

1. **Read that existing suppression and its reasoning first** — the previous attempt at an override failed for a
   concrete reason. Check whether the patched versions this advisory names (`>=1.1.18`, `>=5.0.9`) still hit it.
2. **Prefer the real fix**: bump the transitive dependency so both instances land on a patched version, and prove
   `pnpm run ci` goes green **and** lint still runs (the earlier breakage was eslint refusing to load).
3. **If the bump genuinely cannot work**, extend the existing suppression in the same shape and place as the
   current one, with an honest justification: exactly why it is unreachable in production, and an expiry date. Do
   not invent a new suppression mechanism, and do not silence the audit globally.
4. State plainly which of the two routes you took and why.

## Boundaries

- Do not touch product code, migrations, DB, deploy or PROD.
- Do not weaken `registry-prod-audit` itself or lower its audit level.
- No push.

## Done means

- `/home/dev/brain/host-orch/run-tests.sh 'pnpm run ci'` → `exit 0`, with the log path and duration in the report.
- One commit on your branch; lockfile changes included if the bump route was taken.

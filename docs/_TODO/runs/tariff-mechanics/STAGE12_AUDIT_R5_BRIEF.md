# MISSION: narrow audit of commit `c77987aba` (read-only) — one fix, four questions

Scope is deliberately small. The closing audit found that migration `0275` dropped `app.cms_pages_snapshot_usage` while
`getEnforcedQuotaUsage()` still called it, which killed the whole usage projection in the platform console — including
the working specialist-seats counter. This commit claims to fix exactly that.

## Authority

- **Plan:** `docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md §5a`, item 2.3, scope §1, policy §2.
- **Verdict being fixed:** `docs/_TODO/runs/tariff-mechanics/STAGE12_AUDIT_R4_RESULT.md`, MUST FIX 1.
- **Worker claims (verify, do not trust):** `docs/_TODO/runs/tariff-mechanics/STAGE12_FIX4_REPORT.md`.

## Four questions, each answered with evidence

1. **Is the dangling call really gone?** Search all of `apps/webapp` — code, scripts, smoke, tests, SQL — for any
   remaining reference to `app.cms_pages_snapshot_usage` or to the dropped course quota function. For each hit say
   whether it is a live runtime path or a self-contained script that creates the object itself.
2. **Does the seats counter survive?** `getEnforcedQuotaUsage()` must still return specialist-seats usage. Confirm by
   code and by the new test. Would that test notice if seats silently dropped out of the result?
3. **Did the fix delete more than it should?** The worker removed `cmsPagesUsageSql.ts`. Confirm nothing else imported
   it and no other projection lost data.
4. **Is the migration consistent with the code?** After `0275` no code path may reference a dropped object, and nothing
   the code still needs may be dropped. Answer «согласована» or name the mismatch.

## Rules

- MUST FIX only for a reachable break with named impact. No style, no theory, no alternative design.
- Read-only: change no files, run no migrations, never run the full CI. A targeted `typecheck` and the single affected
  test file are fine if your sandbox permits; if it does not, say so instead of guessing.

## Output

`VERDICT: PASS | FAIL`, the four answers with file:line evidence, numbered MUST FIX (an empty list is a valid answer),
and one line on anything you could not check.

# MISSION: correction round 4 — migration `0275` drops a function the runtime still calls

One defect, mechanical, narrow. Do exactly this.

## Authority

- **Plan:** `docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md §5a`, item **2.3** (CMS stops being a numeric
  quota), scope §1, verification policy §2.
- **Canon:** `docs/_TODO/SAAS_FOUNDATION/QUOTAS_AND_MECHANICS_DESIGN_2026-07-28.md` §2 (what the usage projection is
  for), §3, §5.
- **Verdict you are fixing:** `docs/_TODO/runs/tariff-mechanics/STAGE12_AUDIT_R4_RESULT.md`, MUST FIX 1 only.

## The defect

Migration `0275` drops `app.cms_pages_snapshot_usage` (line 10), but the code still calls it:
`pgOrgEntitlements.ts:228` inside `getEnforcedQuotaUsage()`. The platform console route swallows the error
(`api/admin/organizations/route.ts:32`) and returns empty usage for the organization. Consequence after the migration
is applied: every request raises an SQL error and **the working specialist-seats usage counter disappears from the
platform console too** — a live feature breaks because of a CMS-only change.

## What is required

Make the usage projection stop asking for the CMS page count, since CMS is no longer a numeric mechanic, while the
seats counter keeps working exactly as before. Both halves matter: no dangling call to a dropped function, and no loss
of the counter that works today.

Then look once for the same shape elsewhere: any other reference to the dropped CMS usage function or to the dropped
course quota function anywhere in `apps/webapp` (code, scripts, tests, smoke). Report what you found, fix what is a
dangling reference to a now-dropped object. Do not refactor beyond that.

## Acceptance — behaviour

- A test that exercises the usage projection and would go red if a dropped-object call came back. Prove it: re-add the
  CMS usage call by hand, watch the test fail, restore the fix, report what you saw.
- The seats usage counter still returns its number in that same test.
- Targeted runs only: `pnpm --filter webapp typecheck`, `lint`, the affected test files. **No full CI.**

## Not yours

- Item 2.8 (mailings on the clinic's own channels) is blocked on an owner decision — do not touch broadcasting,
  do not build clinic credentials, do not mention it as done.
- Item 4.10 (deleting a file to free volume) belongs to stage 4. Do not implement it.

## Constraints

- Keep migration number `0275`; the lead assigns the final one at merge. Do not renumber others.
- Never `git add -A`. Commit in this clone; no push, no merge.
- No assertions about source text, line order or import presence.

## Report

`what was wrong → what you changed (file:line) → what else you found with the same shape → the test that guards it →
what you saw when you re-broke it by hand`.

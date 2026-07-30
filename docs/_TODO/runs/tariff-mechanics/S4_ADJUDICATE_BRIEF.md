# MISSION: settle six disputed claims by reading the code (read-only, factual only)

Two triages disagreed. Sol: none of the 53 old requirements needs work now — the guards are already in place. Opus: six
of them do, because the protection rests on a single application-level predicate with zero cross-tenant tests. **Do not
re-triage anything.** For each of the six claims answer one factual question: **is the failure reachable in the code as it
stands today?**

## The six claims (from `docs/_TODO/runs/tariff-mechanics/TRIAGE_S4_OPUS_RESULT.md`, section «НУЖНО СЕЙЧАС»)

Items 2, 14, 16, 22, 49, 52. Read Opus's text for each: it names files and lines. Sol's counter-argument is in
`TRIAGE_S4_SOL_RESULT.md` («НУЖНО СЕЙЧАС — Нет», plus its per-item «НЕ НУЖНО» reasoning where it covers the same item).

The two load-bearing ones, verify them first and hardest:

1. **Cross-organization content isolation.** Opus: isolation of exercises, templates and media rests only on an
   application predicate (`pgLfkExercises.ts:544-546,698-703`, `pgLfkTemplates.ts:418-420,611-615`,
   `s3MediaStorage.ts:827-851,919-961`); FORCE RLS for `lfk_*` and `media_files` was removed by
   `0177_phase4_no_force_rls_compat.sql`, the cutover script `deploy/postgres/phase4-force-rls-cutover.sql` was never
   applied, and there is not one automated cross-tenant refusal test on this surface. Question: could clinic B today
   reach clinic A's exercise, template or media — by list, by search, by direct ID, or by media delivery — if one
   predicate were lost? And does any existing test catch it?
2. **Platform analytics returning personal rows.** Opus: `GET /api/admin/product-analytics` is org-blind
   (`pgProductAnalytics.ts:312-346,412-451`) and its contract returns `clientActivity[].userId/displayName`
   (`types.ts:161-171`), with no filter or redaction — the only barrier is that no role holds the grant. Question: is
   that accurate, and does the neighbouring handler
   `/api/admin/doctor-analytics-metric-accounts` really implement the fail-closed contract Opus points to?

## How to answer

For each of the six: `ДОСТИЖИМО СЕГОДНЯ` or `УЖЕ ЗАКРЫТО`, then the evidence — exact file:line for the predicate, the
grant, the RLS state or the test that closes it. If it is closed, name what closes it; if it is reachable, name the
single change that would expose it and say whether any test would go red. Then say, in one line, whether Sol or Opus was
right on that item.

You may read migrations, the deploy scripts and the test tree. You may run targeted tests. Do not change files, do not
run migrations, never the full CI.

## Output

A six-row table `item → ДОСТИЖИМО/ЗАКРЫТО → evidence → who was right`, then one paragraph: which items must become plan
checkboxes, in the words the plan should use. Nothing else — no recommendations beyond that.

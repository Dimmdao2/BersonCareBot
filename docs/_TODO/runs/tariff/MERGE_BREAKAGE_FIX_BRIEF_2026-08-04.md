# Full CI is red after merging the parallel tariff branches

Rules: `AGENTS.md` — Маршрут, CORE rules, §5, §9 (full CI gate), §10/§10a/§10b, §24.
Language: internal work is English.

Authority: this brief (bounded merge breakage, `ORCH_OPS`). `AGENTS.md` §9 makes the full CI gate the condition
for deploy and merge, so this blocks everything downstream.

Источник оракула: `AGENTS.md` — «Полный `pnpm run ci` — только перед deploy/merge/repo-level изменением; между
коммитами — step/phase». Красный гейт означает, что дальше двигаться нельзя, пока причина не разобрана.

## What broke

Each of tonight's tariff branches was green on its own. After they merged into `feat/doctor-ui-rebuild`, full CI at
2026-08-04 05:22 fails in three places — this is integration breakage, not a defect in any single branch.

**1–2. `src/app/api/admin/commercial/route.route.test.ts` — two cases, both `expected 400 to be 200`:**
- «writes mechanic policies through route/service/PG mapping and reads them back»
- «accepts legacy clinical_tests JSON but never serializes it as a configurable tariff mechanic»

The route now rejects a payload it used to accept. The likely cause is the Т3 model change (a notification rule
now carries `templateId` instead of the letter text, plus the new `mailing_templates` column) meeting the Т1/Т2
schema — but **verify it, do not assume**. Decide honestly which side is right: if the new schema is correct, the
tests encode the old contract and must be updated with a stated reason; if the schema over-tightened, fix the
schema. Say which one you concluded and why.

**3. `src/modules/org-entitlements/ladderConstants.test.ts` — a guard test caught two hardcoded fallbacks:**
`CommercialConstructorClient.tsx:290` — `policy.graceDays || 0` and `policy.readOnlyDays || 0`. This guard exists
because ladder constants must come from the owner's data, never from a value an agent picked. `|| 0` is exactly
such a picked value. Remove the fallbacks and take the numbers from where the rest of the screen takes them; do
**not** weaken or skip the guard.

## Boundaries

- Do not revert any of tonight's landed work — fix the integration.
- Do not touch payment capture, the trial/discount model or the RLS work.
- **PROD (`135.106.162.170`) is untouchable.** No deploy, no push.

## Done means

- `/home/dev/brain/host-orch/run-tests.sh 'pnpm run ci'` → **exit 0**, run it in the foreground and put the log
  path in the report.
- For the route cases: a sentence stating which side was wrong and why.
- The ladder guard passes without being weakened.
- One commit on your branch.

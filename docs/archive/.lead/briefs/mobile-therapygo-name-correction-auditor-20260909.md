# Тест или взгляд

The resolved PWA/Android application name is repeatable externally visible behavior, so existing manifest/name
tests are updated and exercised. Final resource values, unchanged technical identifiers and historical-artifact
boundaries are one-time inspection. Product code is read-only; the auditor may change only justified behavior tests
and the two audit artifacts below.

# Auditor-live brief — #915 TherapyGo one-word product name correction

Independently audit the exact committed naming candidate. Do not fix product code. Do not touch Jitsi/media/push
behavior, backend/schema, routes/hosts/app IDs, clinic branding, unrelated tests, completed audit/run artifacts or
PROD.

## Mandatory reading and blind order

Run the `AGENTS.md` heading map; read the global decision method, §1/§1a/§1b, §5, §9–§12, §15–§17, §21 and §24
completely, with §10a/§10b before tests. Read the active mobile plan M1/M2/M7, Android shell/brand docs, accepted PWA
and shell audits, relevant existing tests and exact base→candidate diff. Persist the kill-set below before reading
tests in `.lead/runs/mobile-therapygo-name-correction-audit-20260909/00-blind-killset.md`.

Источник оракула — `docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md`: «Владелец уточнил 2026-09-09: это
одно слово, `G` заглавная».

## Blind behavioral kill-set

1. The default patient name resolves as exact `TherapyGo` in the shared surface identity and patient PWA manifest;
   no active path can still emit the separated spelling.
2. Both therapygo TEST and production APK variants resolve label/title `TherapyGo`; Therapysto stays `Therapysto`.
3. A clinic-owned branded patient surface keeps its configured clinic name/icons and is never overwritten by the
   default `TherapyGo` correction; platform-admin remains non-installable.
4. The change cannot alter application/package IDs, flavor names, routes, hosts, push `therapygo` surface values,
   asset filenames or deep-link ownership.

## Tests, build and inspection

- Update only existing public-behavior expectations made stale by this owner correction; do not add source-string,
  formatting, component-count or implementation tests.
- Run the smallest PWA/surface behavior suite that proves default name, env override, branded preservation and admin
  exclusion, plus webapp typecheck/scoped ESLint.
- Through the host test lock, rebuild the smallest APK matrix that proves the TherapyGo label in both environments
  and Therapysto isolation. Use `aapt dump badging` (or the repository's established equivalent) on the exact built
  APKs and record exact commands/labels/applicationIds. Do not sign or publish.
- Inspect the exact diff/census for unchanged technical identifiers and no completed audit/history rewrite. Run
  `git diff --check`.
- Fault-inject each repeatable class once through the public identity/manifest seam; temporary product mutations must
  be restored. A stale expected string is corrected to owner authority, not treated as a product fix.

Commit only justified tests and
`.lead/runs/mobile-therapygo-name-correction-audit-20260909/{00-blind-killset.md,90-final-audit-report.md}` with
explicit staging, never `git add -A`; do not push. Return binary PASS/MUST FIX, exact candidate SHA, commands/results,
kill tally and real external blockers. Do not finish while a foreground build/check is running.

# C3M auditor-live — specialist shell and route projection

Read the `AGENTS.md` heading map before every action, then §4/§4a, §5, §9, §10/§10a/§10b, §12, §16, §17,
§21, §22 and §24 in full. Read `README.md`, the whole C3M section of the current roadmap, accepted C3M-01/03/04
code, this branch's full product diff and the doctor UI guides before testing.

Taskdb workstream: `#1098`.
Authority/checklist: `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md`, C3M owner decisions and
checkbox `C3M-06`.

Источник оракула: roadmap C3M-06 — project the one accepted resolver into desktop/mobile navigation, direct pages,
patient-card tab registry, header CTA, lazy bootstrap/fetches and cross-links; module OFF must not leave a hidden
poller, badge or preload.

Audit the existing candidate only. Do not implement later medical-record, encounter, rehabilitation or
communications server enforcement; this stage owns the shared projection/chokepoints that those slices consume.

## Тест или взгляд

- Registry filtering, page guards, first-effective communications tab and conditional bootstrap are stable behavior:
  blind resolver/loader/route tests are appropriate.
- Labels, responsive navigation, tab layout and clean absence of disabled items are live desktop/mobile checks. Do
  not test text, DOM shape, item counts, snapshots, CSS or source files.
- Reuse of the one shell/resolver and absence of a second formula is a diff/architecture inspection, not a
  source-text test.

## Blind kill-set

Write named faults before reading existing tests. Cover at minimum:

1. Desktop and mobile disagree about an effective module, or a disabled module still appears through one nav path.
2. A disabled card surface remains reachable through a direct page/cross-link/CTA even when removed from tabs.
3. Card tab projection conflates `medical_record` and `encounters`; `Карта` must remain if either is effective, while
   LFK follows rehabilitation.
4. Communications shows no effective child, opens a disabled query tab, or loads comments/chat/mailings data for a
   hidden tab instead of selecting the first effective child.
5. A hidden item still starts its unread provider, poller, badge query or server bootstrap.
6. Existing always-on Today, schedule/booking, clients, basic Overview notes, tasks, files and account disappear or
   Today's presentation changes.
7. Missing preferences no longer preserve current available surfaces, or a preference expands unavailable
   capability.
8. The implementation forks shell/nav/tab registries or reimplements the effective formula instead of extending the
   accepted loader/resolver.

Inspect the diff, then existing tests. Add only missing durable behavior tests and prove each behavioral class once
with production-code fault injection. Visual items are accepted live on an isolated port with ordinary DEV login;
do not occupy the shared dev server. Run targeted tests, webapp typecheck, scoped ESLint, architecture checks and
`git diff --check`; no full CI.

Findings require a reachable scenario, impact and violated owner requirement/repo rule. Commit only auditor-created
tests and one audit artifact, never product fixes. Use explicit paths, `#1098`, candidate SHA and exact evidence;
never `git add -A`, never push.

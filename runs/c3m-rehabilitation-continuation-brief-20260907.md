# C3M worker continuation — rehabilitation slice

Read the `AGENTS.md` heading map before every action, then §4a, §5, §9, §10/§10a/§10b, §12, §15–§21 and §24
in full. Read `README.md`, the whole C3M section of
`docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md`, the original brief
`runs/c3m-rehabilitation-slice-brief-20260907.md`, candidate commit `ee59db86c`, and the prior run record
`/home/dev/brain/runs/agent-port/c3m-rehabilitation-slice-worker-20260907.json` before editing.

Taskdb workstream: `#1098`.

Источник оракула: `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md`, C3M-08 — «Скрыть/запретить
ЛФК/program/catalog paths и зависимые comment/media surfaces».

Continue the system-interrupted C3M-08 product implementation. This clean continuation branch starts at the current
integration base because the port correctly refuses a new worker on an unaudited ahead branch. As the first product
action, cherry-pick salvage commit `ee59db86c` from `wt/c3m-rehabilitation-slice-20260907`, then continue from that
state. The salvage commit is not an acceptance claim. Preserve its in-scope work only where it satisfies the original
brief; correct or remove partial, duplicated or over-broad changes rather than merely making the compiler green.

Required continuation:

1. Finish the compiler-led cleanup and inspect all 40 changed files against every original C3M-08 requirement.
2. Verify the central resolver/guard remains the one path; parameterize existing points instead of adding a second
   formula, route family, repository or shell.
3. Confirm rehabilitation OFF blocks specialist and patient direct/API/action paths, assignment, dependent program
   comments/media and rehab-owned background work, but preserves medical record, encounters, notes, tasks,
   appointments, files/account, direct chat, mailings and the existing Today presentation.
4. Ensure no stored programs, templates, sessions, comments, media, child preferences or history are mutated by
   OFF/ON. Do not add migrations, tariffs/presets/roles/solo/clinic logic or new UI dependencies.
5. Write no tests. Run only affected existing checks, webapp typecheck, scoped ESLint, architecture guards and
   `git diff --check`; no full CI and no shared dev server.
6. Commit every final in-scope correction with explicit paths and `#1098`, why/evidence/C3M-08/remaining audit.
   Do not push and do not finish before the final commit exists.

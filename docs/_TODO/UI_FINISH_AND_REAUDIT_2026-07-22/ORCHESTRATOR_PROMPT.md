# Orchestrator mission prompt (paste this to Sol / Codex orchestrator)

You are the ORCHESTRATOR for the BersonCare repo, running on the DEV+TEST box. Drive the work in
`docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` to real completion. Your job is to orchestrate and
verify — not to do the content work yourself. Follow this exactly.

## Non-negotiable environment facts
- This box = DEV + TEST ONLY. Production is a different server (IP 135.x), not present here, OUT OF SCOPE.
- On TEST you deliberately cut/break/observe/fix. No prod deploy, no prod migration, no push to `main`/`test`.
- First read: `AGENTS.md`, relevant `.cursor/rules/*.mdc`, `docs/ORCHESTRATION_BINDINGS.md`
  (sections «Универсальный режим исполнения многоэтапного плана» and «Урок 2026-07-22»), and the WORK_ORDER.

## The one rule that was violated before — do NOT repeat it
"Done" is defined ONLY by a stage's **linked detailed plan file**, never by the roadmap's one-line summary.
For every stage you touch:
1. Open the link. Read the entire linked authority.
2. Extract the exact atomic checklist and quote each checkbox verbatim into the worker/auditor mission.
3. Require a per-line evidence matrix back: checkbox → code (path:line) → test → live PNG → verdict
   (real-done / partial / fake-done / owner-deferred). No checkbox closes without cited reality evidence or an
   explicit owner defer. A worker's "done" report and green tests are NOT proof by themselves.

## UI acceptance = live PNG, batched (not per-tweak)
- Acceptance evidence for UI = a screenshot of the LIVE page (`port.sh shot` on :5200 / TEST), taken AFTER all of a
  page's edits are complete, covering the whole page, checked against every checkbox for that page.
- Do NOT screenshot on every micro-change. One page → edits done → one batch screenshot → check all its checkboxes.

## Anti-micro-fussing (this is what made the last run useless — enforce it)
- **Risk-sized audit.** UI / layout / text / presentation = worker + one independent audit per pass. Frontend is
  iterative: a big stage with many items will legitimately need 2–3 rounds of fix + re-check to land all of them —
  that is NORMAL progress, NOT a stop condition. Reserve the full multi-round adversarial cycle for identity / auth
  / tenant-isolation / security / migrations / money / data / irreversible actions.
- **The stop condition is REPEATING THE SAME FAILURE, not the round count.** Every round, classify which case you
  are in: (a) the stage just isn't finished yet — each round CLOSES some checkboxes and the ones left are new/
  different → keep going, this is healthy; (b) the SAME defect at the SAME spot survives across rounds, or a round
  closes ZERO checkboxes → THAT is the real problem: HARD STOP and escalate to the owner as one question (ambiguous
  requirement, a worker that cannot do this spot, or an audit inventing scope). Never stop a healthy multi-item
  stage merely because it took several rounds.
- **For UI, prefer the owner's eyes over grinding internal rounds.** The audit agent can itself be wrong about
  frontend, and perfect internal acceptance is expensive and unreliable. Once a page is in reasonable shape, the
  cheap correct gate is: ship it code-only to TEST and ask the owner to look ("Дим, открой, посмотри — нормально
  или нет?") with the live PNGs. Do not burn many internal audit/fix rounds polishing UI the owner can approve or
  redirect in one glance.
- **Batch fixes, never micro-agents.** When an auditor returns findings, hand the FIXER ONE mission: "fix ALL of
  these findings for this stage and finish the stage to completion" — with the full findings list and the stage's
  quoted checklist. Do NOT spawn a separate agent per one-line fix. A trivial one-liner the auditor spots, the
  auditor fixes inline — do not route it to a new agent.
- **Audit is a GATE against the owner's plan, not a source of new work.** A finding with no matching checkbox in the
  owner's detailed plan is a QUESTION to the owner, never a new task. If two passes in a row add code but close zero
  owner checkboxes, STOP and escalate — that is scope-drift, not progress.

## Parallelism, branch & commit hygiene, CI cadence
- **Parallelize.** Run independent, non-conflicting file-scope stages concurrently in **3–4 streams**, each in its
  OWN git worktree + OWN feature branch. Do not serialize work that does not share a resource. Serialize ONLY
  shared-resource contention: the single DEV server used for live screenshots, and heavy CI (run-tests mutex).
- **Branches.** Each stream works on its own branch, merges back when its stage is really done, then the old branch
  and worktree are DELETED. Keep branches clean — regularly prune merged/stale branches and their worktrees; do not
  let dead branches pile up. Before deleting any branch, verify HEAD is the intended feature branch.
- **Commit & push for backup.** Commit regularly and autonomously (no asking). Push regularly to the FEATURE branch
  for backup — NEVER to `main` or `test`. Backup pushes to the feature branch are mandatory, not optional.
- **CI cadence.** Do NOT run full CI from scratch on every change (waste), and do NOT let it accumulate to 20–40
  commits and then fight to make it pass. Per change: scoped/targeted tests + typecheck. Full CI (lint + typecheck +
  route/integration): at a sensible cadence — roughly every 5–10 commits or at each stage boundary, and once before
  any owner acceptance package. Green full CI is a hard prerequisite for "done".
- **Owner acceptance IN THE MIDDLE, not only at the end.** After each package of user-visible pages, ship code-only
  to TEST and send the owner the batched live PNGs. "audit PASS" is NEVER "done". Done = owner's checkbox + green
  full CI + live PNG accepted by the owner.

## Periodic EXTERNAL process audit (every ~3 hours, independent, Opus)
Your own "everything is fine" is not trusted — the last orchestrator felt fine while shipping fake-done work.
So on a recurring timer (every ~3 hours of active work) spawn an INDEPENDENT external auditor on a DIFFERENT model —
**`claude-opus-4-8`** — whose job is to audit the QUALITY OF YOUR ORCHESTRATION (process, not code correctness):
- Is the plan adequate and are stages actually advancing, or is old failure creeping back — shallow single-pass
  work, checkboxes closed off roadmap summaries instead of the linked detailed plan, missing real verification?
- Are 3–4 independent non-conflicting streams genuinely running in parallel, each in its own branch/worktree, or is
  everything needlessly serialized?
- Branch hygiene: are merged/stale branches being pruned, or piling up? Are backup pushes to feature branches
  happening?
- Commit/CI cadence sane (not per-change-from-scratch, not accumulating 20–40 commits)?
- Anti-pattern check: micro-fussing (endless audit rounds on one stage, a separate agent per one-liner), or an
  audit acting as a scope generator (findings with no owner-plan checkbox becoming new work)?
The external auditor returns a short process-verdict + concrete corrections. You MUST act on it: correct course, and
if it flags scope drift or repeated shallow passes, STOP and escalate to the owner. Mechanism: agent port /
audit-agent with an explicit `--model claude-opus-4-8` and a "process reality-audit" mission — do NOT let the
auditor fall back to your own model or a lane default (that would make it a self-review, not a cross-model check).
Log each process-audit verdict so the owner can see the trail.

## Model tiering (source of truth: docs/MODEL_TIERS.md)
- Executors default to Codex per tier: `terra` (medium) for daily code/tests/refactor; `sol` (high) only for the
  hard reasoning stages. Keep the independent auditor genuinely independent and at an adequate tier — never let it
  silently fall to the lane default.
- Do not burn the top model on mechanical edits; do not put the quality gate on the cheapest model.

## Scope (priority order — details in WORK_ORDER §2)
- **Track A (primary):** finish Doctor/SaaS UI to real PASS — A1 DNA background restore (verify against DNA spec,
  do not guess), A2 remove the reintroduced right-pane client card on Clients, A3 re-verify every "done" UI stage
  against its linked detailed plan and finish what is not really done. Acceptance via batched live PNGs.
- **Track B (do early, small):** email-OTP global-admin login for `dimmdao@gmail.com` on TEST + admin PWA/push;
  send the owner exact login steps.
- **Track C:** finish Rubitime retirement R1–R5 on TEST (stop exchange, drop `branchServiceId`, archive, drop
  rubitime tables on TEST, fix breakage). Coordinates with Track A on booking screens.

## Reporting
- Per stage: `closed X/N against <linked plan path>` + a mandatory `NOT DONE:` section.
- Escalate owner-gated questions as ONE consolidated list (recommendation + safe default each), not one-by-one.
- Do not say "done/finished/100%" until owner checkbox + green full CI + owner-accepted live PNG. Until then:
  "stages X–Y closed, remaining Z".

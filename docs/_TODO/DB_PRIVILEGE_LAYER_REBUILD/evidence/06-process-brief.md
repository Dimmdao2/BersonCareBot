# BRIEF: design the PROCESS, not the system

## What you are asked

Four plans have failed. Six audit rounds have run. Two documents were just written and
both were judged unfit. The owner's conclusion: stop asking "what is the right design"
and start asking **"what sequence of actions and agent runs actually produces a sound
result"**.

Your output is a PROCESS DESIGN: the concrete order of steps and agent invocations that
would get this work to a genuinely good outcome — not another plan that dies on the
seventh audit.

## The history you must account for

| Round | What was produced | How it died |
|---|---|---|
| v1 | "tidy the 61 overlays, one owner per object" | audits: would have prevented 0 of 10 defects; 4 of 7 headline numbers wrong |
| v2 | "make denial loud first" | self-refuted: silent zero produces no error to make loud |
| v3 | 5 mechanisms: loud port, EXPLAIN surface, policy satisfiability, exact ACL, registry authoring | 5 audits: EXPLAIN lies 7 ways; test surface ~0%; M1 unimplementable and already took TEST down; M3 not computable; registry is ~5% of assumed |
| v4 | "authority ledger": Postgres log + catalog probe per (role,object,principal) cell | audit: log does not see silent-zero/partial/excess at all; SET ROLE ≠ login; matrix blind to 6 of 11 roles; verdict "does not close the task" |
| FINDINGS doc | established facts + refutations | audit: internal contradiction (says DB clean while documenting cross-tenant leak); "commands" are fragments; 3 repo-checkable claims WRONG; verdict "not fit as factual foundation" |

## The recurring failure pattern (this is the real subject)

Every single round died the same way: **a load-bearing claim was written down before it
was tested.** Examples, each proven later:
- "EXPLAIN proves authorization" — never tested against a write before being made central.
- "the registry is half-built" — never opened; it is a 2-column table→tier map.
- "the census gate is not in CI" — it IS, via `pnpm run audit`; one grep would have shown it.
- "app_patient has no DML on platform_users" — table-level check said false; column-level
  grants exist. Wrong conclusion from the wrong probe.
- "the log holds the complete inventory" — the grep counts one signature class of several,
  and the visibility classes produce no log line at all.

Author self-assessment: the author is fast at producing plausible structure and slow at
disproving himself. Audits catch it, but only after a full document exists — which costs
a full cycle each time.

## What is now known to be TRUE (verified, survived audits)

- The defect class is two-sided: code cannot see its own data AND code sees other tenants' data.
- Live cross-tenant leak reproduced: `app_staff` reads both organisations' rows in
  `public.be_organization_members` (RLS off). 5 org-bearing tables readable by tenant roles
  have no RLS+FORCE at all, including appointment and booking records.
- Postgres log holds 141248 `permission denied` lines with role and statement — but does NOT
  record visibility failures (silent zero / partial / excess), which are not errors.
- Execution under `SET ROLE` inside BEGIN..ROLLBACK does decide what planning cannot.
- Existing usable assets: `c5a-platform-operations-runtime.sql` (bidirectional EXCEPT over
  table ACL, function ACL, policy inventory), `assert-c4-operational-runtime-ready.sh` (logs in
  as each operational role, probes must-work and must-deny), `a0-greenfield` baseline with
  migration manifest, `check-saas-db-regression.mjs` wired into CI.
- Both independent generators converged on the same END STATE: a capability-only DB API where
  runtime roles hold NO direct table/column/sequence privileges and can only EXECUTE a fixed
  function list. The latest audit says this should be the CURRENT boundary, not a deferred one.

## Tooling facts you must design around

- Opus agents: full DB access, run via the agent tool, ~10-35 min per run, reliable.
- Sol via the brain port (`agent-run.mjs`): sandboxed with kernel `no_new_privileges`, CANNOT
  reach the DB, wastes 30 min spinning its own cluster, then dies with an empty result. Two runs
  lost this way.
- Sol via direct CLI (`codex exec --sandbox danger-full-access`): full DB access, VERIFIED
  working (`postgres | tables=307`). This is the correct way to run Sol.
- The owner reads Russian; internal agent work is English.
- The owner's standing rules: independent adversarial audit before any acceptance; a plan file
  with checkboxes is the only source of "done"; numbers without the command that produced them
  are not numbers; "no" without the list of places searched is not a "no".

## Materials on disk (read them)

- `/tmp/bcb-sol/DOSSIER.md` — problem statement, all failed plans, all five audits with proofs.
- `/tmp/bcb-sol/chk-findings.md` — the audit that just rejected the FINDINGS document.
- `/tmp/bcb-sol/chk-plan.md` — the audit that just rejected PLAN v4.
- `docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/FINDINGS.md` and `PLAN.md` — the rejected documents.
- Repo: /home/dev/dev-projects/BersonCareBot (branch feat/doctor-ui-rebuild).
- Live TEST DB: `sudo -n -u postgres psql -d bersoncarebot_test -Atc "..."` — READ-ONLY, wrap any
  mutation in BEGIN..ROLLBACK, never COMMIT, never restart a service, never edit repo files.

## The questions you must answer

1. **What is the correct SEQUENCE?** Concretely: step 1 does X, verified by Y, then step 2…
   Where in that sequence does a document get written, and where does verification happen
   relative to it? The current process writes first and verifies after; say whether that is the
   bug and what replaces it.
2. **Which agent runs, in what order, with what exact mission?** Who verifies whom. How many
   rounds. What makes a round terminate — the owner's rule is "two consecutive clean audits",
   but four rounds produced zero clean ones; is that rule achievable here, and if not, what is
   the correct termination condition?
3. **How do you prevent the recurring failure** (load-bearing claim written before tested)?
   Design the mechanism, not the intention. It must work for an author who is demonstrably
   prone to this.
4. **Should the work be decomposed differently?** E.g. is "design the system" even the right
   unit of work, or should it be a sequence of small provable increments each landed and
   verified before the next is designed? If so, what is increment #1 and what proves it?
5. **What should be done FIRST, tomorrow morning, concretely?** One action, named.
6. **What is the cheapest way to detect that this process is failing again**, early — a tripwire
   the owner can read without being an expert.

Be concrete and short. Name files, commands, agent missions, and the order. Do not design the
privilege system itself — that is a different question and other agents already did it. Design
the way of working that produces a correct answer to it.

# D31 VK migration result: factual docs correction

Read the `AGENTS.md` heading map and complete migration, documentation, commit, and §24 orchestration sections.

Источник оракула: `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` Р-D31 — «делать API для VK,
инсту удалять»; exact accepted product/static evidence is commits `0a91914d5` and `9f3953ecd` plus the four green
focused suites already recorded on `9f3953ecd`.

This is a one-off documentation correction after lead inspection, not another product audit or test cycle.
Modify only `docs/_TODO/runs/integrator-cleanup/D31_VK_CHANNEL_AUDIT_RESULT_2026-08-21.md`.

Required final state:

1. Preserve the original D31 independent-audit findings and append/preserve two distinct correction records:
   - `0a91914d5`: five owner-execution metadata additions; after stripping only those new metadata comments,
     parent and commit migration bytes are identical (SHA-256
     `37ff083100d7fe581a9c2dfa6d92f4c82baa9de20b5f34118699f999249a4043`);
   - `9f3953ecd`: exactly three `LANGUAGE plpgsql` line splits; migration bytes did change, executable token order and
     PostgreSQL meaning did not. Prove this by the exact commit diff, not by a false byte-identity claim.
2. Remove every statement that `9f3953ecd` made no executable-SQL change or is byte-identical to its parent.
   Do not claim product SHA `e8009c501` was literally untouched by later migration correction commits; call it the
   accepted product base if referenced.
3. Keep the exact green results already obtained on `9f3953ecd`: parser 6/6, migrator 29/29, objects 6/6, order
   22/22, diff-check clean. Do not rerun them.
4. Do not embed a long generated diff or fragile normalization shell pipeline. State exact changed lines and SHAs
   concisely, with no conflicting active narratives and no trailing whitespace.
5. Run only `git diff --check` for this report, stage only this report, commit, and finish with a clean tree.

Forbidden: migration/product/test edits, DB/preflight/execute, fixture, disposable DB, TEST/PROD, landing, deploy,
push, full CI, rewriting historical audit findings, or starting another audit.


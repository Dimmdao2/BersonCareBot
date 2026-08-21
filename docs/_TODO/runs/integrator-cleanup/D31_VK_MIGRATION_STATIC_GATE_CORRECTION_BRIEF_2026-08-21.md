# D31 VK migration: static-gate correction brief (2026-08-21)

Read `AGENTS.md` route and the complete migration, test, commit, and orchestration sections before acting.

Authority:

- `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` decision Р-D31: «делать API для VK, инсту
  удалять»;
- `docs/_TODO/runs/integrator-cleanup/D31_VK_MIGRATION_OWNER_METADATA_FIX_BRIEF_2026-08-21.md`;
- the real pre-landing gate in `deploy/postgres/privileges/migrate-local-parse.test.mjs`.

Источник оракула: `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` Р-D31 — «делать API для VK,
инсту удалять»; executable pre-landing requirement — `AGENTS.md` §1 «Миграции schema B».

The owner-metadata commit `0a91914d5` correctly added the five required capability headers and preserved SQL,
but the candidate is not land-ready: the parser test rejects three function declarations whose `LANGUAGE
plpgsql` shares a line with other clauses. The result artifact also contains whitespace errors and its displayed
byte-identity command compares `HEAD` to the worktree after commit instead of parent to commit.

Bounded scope — modify only:

1. `apps/webapp/db/drizzle-migrations/20260821T050000_add_vk_messenger_settings.sql`;
2. `docs/_TODO/runs/integrator-cleanup/D31_VK_CHANNEL_AUDIT_RESULT_2026-08-21.md`.

Required correction:

1. In exactly the three affected declarations, put `LANGUAGE plpgsql` on its own line and retain the following
   `STABLE` / `SECURITY DEFINER` clauses with identical PostgreSQL meaning. Do not change any function body,
   statement order, owner/capability/verify marker, breakpoint, role, table, or VK behavior.
2. Repair the result artifact's parent-vs-commit byte-identity proof and remove its trailing whitespace. Record
   this correction and the actual final focused results honestly; do not rewrite historical findings.
3. Run and wait for:
   - `node --test deploy/postgres/privileges/migrate-local-parse.test.mjs`;
   - `node --test deploy/postgres/privileges/migrate-local.test.mjs`;
   - `node --test deploy/postgres/privileges/migrate-local-objects.test.mjs`;
   - `node --test deploy/postgres/privileges/migration-order.test.mjs`;
   - `git diff --check` for the two scoped files.
4. Stage only the two scoped files and commit. Do not push, land, access any DB, run preflight/execute/reapply,
   create fixtures or databases, touch TEST/PROD, deploy, or run full CI. Do not finish while a command is still
   running.

Done means the branch is clean, all five focused commands are green, and the final commit SHA is reported.

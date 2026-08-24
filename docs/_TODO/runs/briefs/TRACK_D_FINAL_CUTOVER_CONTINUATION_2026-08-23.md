# Track D final cutover — continuation after interrupted worker

You are one strong `worker-hard` completing one coherent architectural cutover. Read `AGENTS.md` and obey its
header-map-before-every-action rule. Read the full authority brief first:
`docs/_TODO/runs/briefs/TRACK_D_DUPLICATE_STORE_CUTOVER_2026-08-23.md` from the retained worktree
`/home/dev/dev-projects/bcb-wt-track-d-duplicate-store-cutover-20260823`.

Current clean candidate branch is `wt/track-d-final-cutover-20260823` at salvage commit `64726bbba`. The word
`salvage` means persistence only, not acceptance. Preserve and critically inspect its work; repair it in this same
pass. Earlier commit `4d1380339` removes duplicate overlay bodies but is incomplete until a forward migration
restores the canonical gated D17 function on already-overwritten DEV/TEST databases.

Источник оракула: `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` — «generic webhook не создаёт
аккаунт; token-bound webapp flow принимает только self-owned messenger contact, сверяет номер, фиксирует
подтверждение и доставляет код; интегратор не создаёт аккаунт и не решает merge».

## Already closed elsewhere — verify, do not redo

- D25 generic bot lookup-only and token-bound webapp flow are already accepted in the branch ancestry.
- D30 reminder-rule M2M retirement is already accepted in the branch ancestry.
- D15b/7a identity-ref is already accepted in the branch ancestry.
- All Therapysto/branding/night branches and their files are forbidden: do not switch, merge, edit, delete, or
  inspect them as a source of implementation.

## Finish all remaining cutover work in this one pass

1. Validate and finish the salvaged delivery work: one `outgoing_delivery_queue` row is both per-channel job and
   delivery lifecycle; `sent` only follows actual provider success; failed provider calls alone create attempt rows
   with real delivery id and increasing attempt number. Remove both duplicate reminder result journals.
2. Consolidate reminder occurrence into one physical source while preserving rule provenance and unique
   `seen/snoozed/skipped/done` facts. Remove duplicate history/action stores only with a fail-closed forward
   migration.
3. Remove `public.support_delivery_events`; support uses the same delivery/failed-attempt model.
4. Remove copy-healing operations, tick, and `integrator.direct_public_write_retries` if the exact operation census
   still proves it has no independent live purpose.
5. After exact import/call census, remove dead legacy scheduler/job-runner compatibility only where proven unused.
6. Make `user_identity` the sole physical FIO store, including provisioning for every canonical account; migrate
   existing missing rows fail-closed, switch readers/writers, and remove FIO columns from `platform_users`.
7. Remove measured legacy `user_id text` columns where `platform_user_id uuid` is canonical, and measured
   `integrator_user_id` columns where the UUID is canonical. External messenger ids remain only in
   `public.user_channel_bindings`. Do not add compatibility mirrors.
8. Complete D17 with a forward migration containing the canonical accepted-context and typed-args gates, correct
   declaration-generated ownership/ACL, and no second overlay body. Inspect other overlay/migration intersections
   but change only proven reachable defects.

## Acceptance and finish discipline

- Follow the full original brief for architecture, migrations, rights analysis, tests, and evidence.
- Do not mutate named DEV. Prepare exact rollback-only commands for the independent auditor-live.
- Run targeted tests, affected typecheck/lint, migration journal/order/generator checks, and `git diff --check`.
- Update `docs/_TODO/runs/integrator-cleanup/TRACK_D_DUPLICATE_STORE_CUTOVER_2026-08-23.md` with exact commands,
  migration order, rights analysis, test results, and explicit NOT DONE items if any.
- Commit every completed change by explicit paths. Never use `git add -A`. Do not push, land, deploy, touch PROD,
  delete branches/worktrees, or finish with uncommitted files.
- If the entire authority scope cannot safely finish in this single run, still commit coherent progress and report
  the exact remaining owner-impact and blocker. Do not claim candidate-ready.

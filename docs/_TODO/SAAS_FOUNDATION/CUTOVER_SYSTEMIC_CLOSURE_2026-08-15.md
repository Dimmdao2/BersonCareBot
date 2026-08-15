# Cutover systemic closure — repository evidence — 2026-08-15

Scope: tracked workstream #996. The original repository-only closure was followed by the focused F1–F5 repair after
the independent FAIL audit. The schema changes were applied only to the local DEV database through the canonical
`migrate-dev.sh` wrapper so the checked-in A→B target snapshot could be regenerated and verified. No TEST/PROD
database, service, deploy/reset/restart, provider, or external-delivery operation was performed.

## Post-audit status

F1–F5 from `CUTOVER_SYSTEMIC_CLOSURE_INDEPENDENT_AUDIT_2026-08-15.md` are implemented in the one full-reset path.
This is **not** a TEST-readiness claim: the historical independent verdict remains FAIL until a new independent audit
runs the fresh immutable dump through the owner-gated transition and returns PASS. Do not start that reset from this
report alone.

Evidence dump used for read-only aggregate checks:

```text
sha256 2c6bef2636adede0236ce1a93877463268743f15aa4a209a49f446aed5fa83ef
```

| Finding | Closure in the repeatable transition | Fresh-dump disposition |
|---|---|---:|
| F1 | Dynamic specialist-FK inventory; collision-safe scheduling merges; rewrite before delete; source-derived and final reference gates | 7/7 availability rows preserved (4 active scopes); 133/133 appointment attributions, including 5 deleted-history rows |
| F2 | Reminder history maps `integrator_user_id` through the terminal platform-user merge graph; unmappable rows remain honest `NULL` | 2,008 total = 1,760 attributable + 248 honestly unmappable |
| F3 | Dynamic live subject/ownership rewrite plus deterministic preference/first-resolve conflict handling; provenance columns excluded | proven support conversation, 9 preference rows, and 6 first-resolve rows close on canonical users |
| F4 | 19 actionable drafts are attached to canonical support conversations; deterministic holders cover missing legacy conversations; content compared without output | 19/19 `pending_confirmation` rows preserved |
| F5 | Both surviving operational/statistical relations gain tenant shape, copied rows receive canonical organization, RLS/privileges and write functions follow the new keys | 8,082 delivery rows + 581 playback rows = 8,663 attributed rows |

The exact PII-free aggregate command for F2/F5 was:

```bash
sudo -n -u postgres pg_restore --data-only --no-owner --no-privileges -f - /tmp/bcb-prod-fresh.dump | awk 'BEGIN{FS="\t"} /^COPY public\.platform_users /{s="u";next} /^COPY public\.reminder_occurrence_history /{s="r";next} /^COPY integrator\.delivery_attempt_logs /{s="d";next} /^COPY public\.media_playback_stats_hourly /{s="m";next} /^\\\.$/{s="";next} s=="u" && $7!="\\N"{users[$7]=1} s=="r"{reminders++; if ($4!="\\N" && users[$4]) attributable++; else honest_null++} s=="d"{delivery++} s=="m"{playback++} END{printf "reminder_rows=%d mechanically_attributable=%d honestly_unmappable=%d delivery_attempt_logs=%d media_playback_stats_hourly=%d attributed_total=%d\n",reminders,attributable,honest_null,delivery,playback,delivery+playback}'
```

Result:

```text
reminder_rows=2008 mechanically_attributable=1760 honestly_unmappable=248 delivery_attempt_logs=8082 media_playback_stats_hourly=581 attributed_total=8663
```

The exact PII-free F4 relationship command was:

```bash
sudo -n -u postgres pg_restore --data-only --no-owner --no-privileges -f - /tmp/bcb-prod-fresh.dump | awk 'BEGIN{FS="\t"} /^COPY integrator\.conversations /{s="c";next} /^COPY integrator\.message_drafts /{s="d";next} /^\\\.$/{s="";next} s=="c"{conv[$3 SUBSEP $2]=1} s=="d"{d++; state[$7]++; if (conv[$2 SUBSEP $3]) linked++} END{printf "drafts=%d pending_confirmation=%d linked_to_source_conversation=%d unlinked=%d\n",d,state["pending_confirmation"],linked,d-linked}'
```

Result: `drafts=19 pending_confirmation=19 linked_to_source_conversation=1 unlinked=18`. The 18 do not get dropped;
the transition creates deterministic canonical conversation holders before storing their payloads.

## Authority and decisions

- Execution order and no-manual-surgery oracle: `HARD_MIGRATION_PROTOCOL.md`.
- Target privilege/runtime topology: `DB_PRIVILEGE_LAYER_REBUILD/PLAN.md`.
- **OWNER DECISION 2026-08-15 (replaces the original narrower B0):** every active canonical client account must
  enter the canonical clinic and canonical specialist graph, regardless of appointments, Rubitime, chat, clinical
  history, assigned/promotional programs, or any other patient-domain facts. The invariant is dynamic:
  `role='client' AND merged_into_id IS NULL AND is_archived=false` after identity consolidation; the aggregate
  dump count is evidence only and is never hardcoded into migration SQL.
- B1 owner search used code-search first, then exact owner-file search:

```bash
node /home/dev/brain/tools/code-search.mjs "owner decision DEV Trial target tariff catalog TEST" --repo bcb -k 10
rg --files docs | rg '(^|/)(OWNER_DECISIONS|OWNER_RULINGS)' | sort
owner_files=$(rg --files docs | rg '(^|/)(OWNER_DECISIONS|OWNER_RULINGS)' | tr '\n' ' '); \
  rg -n -i "DEV Trial|f0000000-0000-4000-8000-000000000001" $owner_files
```

Result: the semantic search found no owner requirement for `DEV Trial`; the exact search returned zero matches in
the six listed owner-decision/ruling files. The target catalog therefore keeps the four reviewed product IDs and
excludes the four exact environment-owned fixture IDs without changing DEV.

## Implemented closure

- B0: the all-active-canonical-client manifest feeds pre-stage evidence, enrollment/link reconstruction, and the
  final exact-one/wrong-endpoint oracle. The reviewed 18-relation patient-fact set plus live appointments remains an
  additional reference-closure oracle, not a membership filter. Merged/archived/non-client identities are ineligible.
  All 45 observed source-only relation classes have one `transform` / `intentionally_retire` disposition; unknown
  and stale classes fail.
- P1: doctor broadcast phone resolution uses only the terminal canonical `public.platform_users` Drizzle port.
  The legacy SQL reader, setting registry/UI values, generated runtime row, and failure-swallowing catch are gone.
- B2: the public full-reset wrapper invokes the same-checkout snapshot checker before entering its shared reset
  engine. The executable wrapper test proves ordering and propagates the checker exit without invoking the engine.
- B1: generator policy uses exact reviewed/environment-owned ID registries, validates required active tariff
  fields, and renders exactly four target tariffs.
- B3: SMTP snapshot/restore requires a statically valid full config without printing it. Completion wording is
  `DB/schema/runtime ready; external delivery unverified`; the opt-in SMTP route returns a correlation `probeRef`.

## Commands and results

```bash
pnpm run check:cutover-systemic-closure
```

Result: PASS — 13/13 Node tests; legacy census PASS over 7 active roots with 7 exact transition files; census
self-test PASS; SMTP shape self-test PASS.

```bash
node --test scripts/prod-to-target-cutover-contract.test.mjs
git diff --check
```

Result: PASS — 5/5 focused manifest/contract tests, including a canonical client without any patient-domain facts
and missing/duplicate/wrong/extra endpoint failures; whitespace check PASS.

```bash
pnpm --dir apps/integrator exec vitest --run src/infra/runtime/worker/doctorBroadcastIntentMenu.test.ts
```

Result: PASS — 1 file, 3 tests, including DB-failure propagation.

```bash
pnpm --dir packages/operator-db-schema run build && \
pnpm --dir packages/db-principal run build && \
pnpm --dir packages/platform-merge run build && \
pnpm --dir packages/error-tracking run build && \
pnpm --dir apps/integrator run typecheck && \
pnpm --dir apps/integrator run lint
```

Result: PASS — four prerequisite package builds, integrator TypeScript, ESLint, queue boundary, and legacy retry
producer gate.

```bash
pnpm --dir apps/webapp run typecheck
pnpm --dir apps/webapp run lint
```

Result: PASS — webapp TypeScript and its configured lint/static boundary chain.

```bash
pnpm exec eslint scripts/prod-to-target-baseline-policy.mjs \
  scripts/prod-to-target-baseline-policy.test.mjs scripts/prod-to-target-cutover-contract.test.mjs \
  scripts/check-legacy-access-census.mjs scripts/refresh-prod-to-target-cutover.mjs \
  deploy/host/deploy-test-full-reset.test.mjs deploy/host/validate-smtp-outbound-snapshot.mjs
bash -n deploy/host/deploy-test-full-reset.sh deploy/host/deploy-test-saas.sh
node --check scripts/prod-to-target-baseline-policy.mjs
node --check scripts/check-legacy-access-census.mjs
node --check deploy/host/deploy-test-full-reset.test.mjs
node --check deploy/host/validate-smtp-outbound-snapshot.mjs
git diff --check
```

Result: PASS — targeted ESLint plus shell/Node syntax and whitespace checks.

`pnpm run ci` was not run by instruction. `pnpm run check:prod-to-target-cutover` was not run during this
repository pass because it reads the live local DEV database; its same-process invocation and failure propagation
are covered by the executable wrapper test.

## Post-audit focused validation

```bash
node --test scripts/prod-to-target-cutover-contract.test.mjs
```

Result: PASS — 10/10 tests. Each F1–F5 test includes a deliberately broken disposition and proves the corresponding
count, canonical-key, content, or tenant gate distinguishes it; the tests also bind those models to the executable
SQL gate text.

```bash
pnpm --dir apps/integrator exec vitest --run src/infra/db/repos/messageLogs.deliveryAttemptAudit.test.ts
```

Result: PASS — 1 file, 7 tests; clinic organization is passed through the exact delivery-audit capability and the
global/pre-login branch remains an explicit honest-NULL case.

```bash
bash deploy/host/migrate-dev.sh --execute
pnpm run refresh:prod-to-target-cutover
pnpm run check:prod-to-target-cutover
```

Result: PASS — local DEV migration ledger reached 430 entries, declaration/access catalog reconciliation passed,
and all four generated A→B snapshot artifacts matched immediately after refresh. The wrapper was run with the
worktree's ignored DEV env paths temporarily linked to the canonical main-checkout DEV files and removed by an EXIT
trap; no env content was printed or committed.

`pnpm run ci` was not run by instruction.

## Remaining live-only proof

The owner-gated TEST run must still prove the full fresh-dump order, execute the real same-checkout snapshot check,
run the SQL membership/disposition/F1–F5 final oracles, and verify doctor roster plus patient organization resolution.
Only that fresh transition can prove the runtime count/content post-gates against the actual restored dump; this
fixer did not reset TEST and therefore does not claim those live post-transition values.
External delivery remains unverified. A later explicitly authorized SMTP acceptance uses authenticated
`POST /api/admin/smtp-test` to an allowlisted TEST mailbox, then correlates its returned `probeRef` through the
existing delivery-attempt path and provider/mailbox receipt. Telegram/MAX/SMS/webpush require their own acceptance;
this package sends nothing.

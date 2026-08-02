# Track D D5 — forward repair for skipped canonical reminder migration

Authority: `AGENTS.md` §1 «Миграции», §5, §10, §24;
`docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` D5:
«`public.reminder_rules` — единственный бизнес-источник и для CRUD, и для чтения планировщиком».

Источник оракула: D5 owner-checkbox — scheduler and occurrence lifecycle must not depend on
`integrator.user_reminder_rules` as the business-rule parent.

## Confirmed current-state defect (read-only DEV, 03.08)

The repository journal contains:

```text
idx=312 when=1793539230013 tag=0312_reminder_rules_scheduler_canonical_local
```

but `drizzle.__drizzle_migrations` contains no row with the SQL SHA256
`bc62b19e9e5463745e664969257ffcc872d05e216e34f9fdd7afb954dc2c332a`; later migrations are already applied
through `1793539230026`. PostgreSQL introspection proves the live DEV constraint is still:

```text
user_reminder_occurrences_rule_id_fkey|FOREIGN KEY (rule_id)
  REFERENCES integrator.user_reminder_rules(id) ON DELETE CASCADE
```

Therefore D5 code is landed but its data/FK cutover was silently skipped because a late-land journal entry had
an older `when` than the database maximum. Editing frozen 0312 or pretending it applied is forbidden.

## Work

1. Create a **new temporary high-number forward migration** (no journal entry in the worker branch). Root assigns
   the final next sequential filename, idx and monotonically increasing `when` only after syncing current `feat`.
2. Implement only the still-required D5 delta against the current post-0322 schema:
   fail-closed parity/backfill into `public.reminder_rules`, occurrence FK cutover to
   `public.reminder_rules(integrator_rule_id)` with history preserved, and any current function/policy definition
   that still resolves reminder scope through the legacy business-rule table. Do not replay stale definitions that
   would regress 0322 or later behavior.
3. Do not drop `integrator.user_reminder_rules` in this repair. Its removal remains zero-live-consumer cleanup.
4. Add/extend disposable PostgreSQL acceptance proving current-schema replay, non-empty parity, FK target, no history
   loss, mismatch rollback, idempotent re-run, and scheduler read from canonical rules. Fault injection must kill the
   FK/parity requirement.
5. Evidence must include exact journal-vs-DB hash reconciliation and explain why a forward migration is required.

Checks: disposable PostgreSQL test, D5 scheduler/reminder suites, both typecheck, scoped lint, raw-SQL gate,
journal/freeze gate (temporary migration intentionally unregistered), and `git diff --check`. Full CI and shared DEV
apply are root-only after land. Do not touch CMS/tariffs/billing/D30/D19a; TEST/PROD forbidden. Commit product + tests
+ evidence; push forbidden.

# D7 reminder callback — independent live audit

Status: **FAIL — one documentation/reachability finding; product behaviour acceptance is green**  
Scope: Track D / #987 D7 only; audit artifacts and acceptance tests only. Product code, shared DEV/TEST and PROD are out of scope.

## Blind kill-set (written before implementation/tests were read)

| ID | Mandatory fault / invariant | Required oracle |
| --- | --- | --- |
| K1 | Invalid or expired signature, actor mismatch, or organisation mismatch for `done`, `snooze`, `skip`, or `mute` is refused before any canonical state/history change. | Signed callback contract plus canonical-state/history inspection. |
| K2 | `done` changes the canonical reminder occurrence/state and appends the required history exactly once. | Real database product-path assertion. |
| K3 | `snooze` and `skip` change only their intended occurrence/rule semantics; they cannot affect another organisation. | Real database product-path assertion across two organisations. |
| K4 | `mute`, messenger topic, and notification settings update canonical settings rather than an integrator-local mirror. | Product-path state inspection. |
| K5 | Replaying a signed callback is idempotent or has an explicitly safe repeat result, with no duplicate history or cross-tenant mutation. | Repeated real callback assertion. |
| K6 | Integrator calls validated capabilities through its Drizzle port; it neither writes product canon directly nor calls removed webapp HTTP routes. | Contract/diff inspection and targeted executable path. |
| K7 | Migration `0314` applies safely atop the current migration chain; grants, `SECURITY DEFINER`, and effective principals stay least-privilege. | Disposable PostgreSQL migration/introspection proof. |
| K8 | Removing old routes left no live callers, scenario/docs contract, or CSRF-bypass route for the removed behavior. | Three-source reachability inspection: scenarios, both applications, registries/docs. |

Mandatory classes: 8. Killed: 7. Uncaught: 1 (K8; F1 below).

## Evidence

### Behaviour acceptance — PASS

Command:

```bash
pnpm --dir apps/webapp exec vitest run --config vitest.postgres.config.ts src/infra/repos/reminderCallbackCapabilities.postgres.integration.test.ts --reporter verbose
```

Result: 6/6 tests passed. The harness starts a private Unix-socket PostgreSQL cluster, builds a
fresh `pbt_*` database from the committed a0 baseline plus the real migration chain (`[migrate]
Drizzle migrations complete count=318`), and drops it at teardown. No shared DEV/TEST/PROD database
was selected.

- K1: a bad HMAC signature and expired signed context both raised `bad_signature` /
  `expired_context`; the unsigned capability returned no row and the `done` journal count remained 0.
- K2/K5: first `done` inserted one canonical `reminder_journal` row; replay returned
  `first_done_for_occurrence=false` and the count stayed 1.
- K3: exact-org signed actor could snooze and skip only A's occurrences; B returned no row and no
  foreign skip journal entry.
- K4: mute and both topic settings altered `public.platform_users.reminder_muted_until` and
  `public.user_notification_topic_channels`.
- K7: the same disposable build applied migration 0314 atop the full current chain; runtime
  introspection confirmed the D7 functions are `SECURITY DEFINER`, owned by `app_owner`, executable
  by `app_patient`, and not by `PUBLIC`.

### Fault injection — PASS (K2)

Temporary production-source fault: removed the exact-organization predicate from the active
enrollment lookup in `app.patient_done_reminder_occurrence` in migration 0314.

The same PostgreSQL command then failed exactly one assertion:

```text
fails closed for an actor/org mismatch without changing the foreign occurrence
expected []
received one done result (day_done_count=1, first_done_for_occurrence=true)
```

The temporary edit was restored before the green re-run above. `git diff --
apps/webapp/db/drizzle-migrations/0314_reminder_callback_capabilities.sql` is empty.

### Integrator adapter/routing — PASS

Command:

```bash
pnpm --dir apps/integrator exec vitest run src/infra/adapters/remindersWritesPort.test.ts src/kernel/domain/executor/handlers/reminders.skip.d21a.test.ts src/kernel/domain/executor/handlers/reminders.notifSettings.d22.test.ts --reporter verbose
```

Result: 13/13 tests passed. The adapter invokes only `app.patient_*` functions via its Drizzle
port; the callback handler refuses a non-owner before the capability call. Source inspection found
no D7 callback HTTP caller and no D7 direct product-canon write in `apps/integrator/src`.

Inspection command:

```bash
rg -n --glob '!node_modules/**' 'INSERT INTO public\\.(reminder_journal|reminder_occurrence_history|platform_users|user_notification_topic_channels)|UPDATE public\\.(reminder_journal|reminder_occurrence_history|platform_users|user_notification_topic_channels)' apps/integrator/src
```

Result: no D7 reminder/state/settings mutation matched (the two returned `platform_users` identity
write lines belong to `writeIdentityAndPreferencesDirect.ts`, outside D7).

### F1 — stale active documentation advertises deleted D7 HTTP routes

Required behaviour: after the transfer, deleted reminder callback routes have no live callers,
docs, or CSRF-bypass route (WORK_ORDER D7; `apps/webapp/INTEGRATOR_CONTRACT.md` says they are
retired).

Reachable inconsistency:

- `apps/webapp/src/app/api/api.md:55` still advertises live signed `POST`
  `/api/integrator/reminders/occurrences/done` and
  `/api/integrator/reminders/messenger-topic/disable`.
- `docs/_TODO/SAAS_FOUNDATION/T0_DB_ACCESS_SURFACE.md:90-96` lists all seven deleted D7 route
  files as active surface entries.
- The next line, `apps/webapp/src/app/api/api.md:56`, correctly says those routes are removed.

Evidence command:

```bash
rg -n --glob '!docs/archive/**' --glob '!node_modules/**' --glob '!apps/webapp/db/drizzle-migrations/0314_reminder_callback_capabilities.sql' '/api/integrator/reminders/(occurrences/(done|snooze|skip)|mute|messenger-topic/disable|notification-settings)' apps docs contracts packages
```

The application source has no such route files or caller; the results above are the remaining active
documentation plus a historical DBC log. This violates K8 even though the runtime routes were
removed.

#### Single fixer brief

Update only the stale route documentation: remove the two retired callback route descriptions from
`apps/webapp/src/app/api/api.md:55`, retaining its line-56 D7 capability statement; turn the seven
entries at `docs/_TODO/SAAS_FOUNDATION/T0_DB_ACCESS_SURFACE.md:90-96` into an explicit historical
record of their D7 removal (or remove them if that inventory is current-state only). Do not restore
or add HTTP routes, CSRF exceptions, or product code. Re-run the evidence `rg` command above and
the 13-test integrator command; expected active guidance is only the capability contract.

## Validation

- `git diff --check` — PASS.
- `pnpm --dir apps/webapp exec eslint src/infra/repos/reminderCallbackCapabilities.postgres.integration.test.ts` — PASS.
- `pnpm --dir apps/webapp run typecheck` — PASS.
- Full CI was intentionally not run: D7 is a product-branch audit, not the post-land milestone.

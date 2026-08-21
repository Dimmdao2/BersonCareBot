# D30 Ш3 — named DEV/TEST gap census and TEST live failure (2026-08-21)

Host identity before the operation: `hostname` → `localhost`; `ip -4 -brief addr show` →
`ens1 151.241.228.122/24`. This is the documented DEV/TEST host, not PROD.

## Read-only legacy-gap census

Lead ran the following command against both named databases through the documented local admin socket; each
transaction was `BEGIN READ ONLY` / `ROLLBACK`:

```bash
for task_db in bcb_webapp_dev bersoncarebot_test; do
  sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d "$task_db" \
    -v ON_ERROR_STOP=1 -At
done
```

The SQL counted incomplete `public.specialist_tasks` with `remind_at`, separately future-only and all, then
counted rows without any matching `public.outgoing_delivery_queue` row satisfying
`kind='specialist_task_reminder' AND event_id LIKE 'specialist-task:' || task.id || ':%'`.

Measured output:

| named DB | future open | future without queue | all open with `remind_at` | all without queue |
|---|---:|---:|---:|---:|
| `bcb_webapp_dev` | 0 | 0 | 0 | 0 |
| `bersoncarebot_test` | 0 | 0 | 0 | 0 |

There is no legacy specialist-task backlog to migrate or drain.

## Existing-owner TEST live gate

Using the already registered Dmitry Berson doctor account and ordinary email/password login:

- login and `/api/me` passed with `role=doctor`;
- the first ordinary `POST /api/doctor/tasks` with a future `remindAt` returned HTTP 500;
- TEST webapp journal recorded SQLSTATE `42501`, `permission denied for table specialist_tasks`, on the direct
  Drizzle INSERT;
- no task or queue row was created, so there was no fixture/test entity to clean up.

Read-only catalog proof on `bersoncarebot_test`:

```text
app_staff: SELECT=true INSERT=false UPDATE=false DELETE=true
bcb_test_webapp_staff -> app_staff
```

The generated current privilege artifact already contains column-scoped `INSERT`/`UPDATE` declarations for
`app_staff`, but the emitted Drizzle INSERT names defaulted columns too. The repair must trace the exact current
DB-port statement and preserve tenant/RLS boundaries; do not answer this live failure with a guessed broad grant.

Verdict: **Ш3 live gate FAIL before create**. Fix and pre-landing acceptance are required, then the same existing-
owner create/update/complete/delete/delivery sequence must be repeated. No fixture, disposable DB or PROD action.


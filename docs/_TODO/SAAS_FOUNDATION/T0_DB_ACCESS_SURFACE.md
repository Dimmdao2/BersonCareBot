# T0 DB access surface

Status: T0.4-pre update. This file points to the current detailed artifacts and records the schema-cleanup constraints that matter before T0.4.

## Canonical detailed artifacts

- `P0_7_WRITER_CENSUS.md`: writer family census.
- `P0_8_CODE_FACTS.md`: descriptor/policy execution facts.
- `RAW_SQL_AUDIT.md`: classified raw SQL baseline.
- `../DB_ACCESS_CHOKEPOINT_INITIATIVE/db-access-map.md`: chokepoint access map.

## T0.4-pre access constraints

| Area | Access surface | Constraint before T0.4 |
|---|---|---|
| `system_settings` | Webapp port, integrator public accessor, media-worker global readers, legacy sync route | Runtime reads must remain on public canonical accessor paths. Mirror writes are compatibility only. |
| Reminders | Webapp rule ports, integrator scheduler/worker repos, `outgoing_delivery_queue` | Do not assume public-only scheduling. Integrator dispatch state must get org context or be redesigned first. |
| Rubitime | Integrator webhook/writePort, webapp projection handlers, booking catalog/appointment read switches | Treat as live legacy adapter until canonical read-source flips and parity are proven. |
| Contacts | Integrator channel user repo, public platform identity repos, purge/merge package | `integrator.contacts` fallback remains live until exception audit and `public_only` setting cutover. |
| Conversations/questions | Integrator transport repos, webapp support projection repos | Public support is product read model; integrator transport writers must be cut over before drops. |
| Queues/logs/idempotency | Worker queues, outbox tick scripts, health archive repos | Technical state. Add principal/retention handling; do not collapse into business canon. |

## Source audit command

Use the dry-run checker before any proposed drop:

```bash
pnpm --dir apps/webapp exec tsx scripts/integrator-schema-cleanup/03_reconcile.ts --repo-root ../..
```

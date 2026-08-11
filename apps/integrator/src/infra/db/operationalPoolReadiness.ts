import { runWithDbInfraPrincipal } from '@bersoncare/db-principal';
import { sql, type SQL } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { createDbPort, db } from './client.js';
import { withIntegratorPoolClient } from './withClient.js';
import {
  runWithIntegratorPortCapability,
  type IntegratorPortCapabilityName,
} from './portContextRuntime.js';
import { runIntegratorNamedRoot } from './runIntegratorSql.js';

async function probeReadOnly(
  source: string,
  capability: IntegratorPortCapabilityName,
  statements: readonly string[],
): Promise<void> {
  await runWithIntegratorPortCapability(capability, () => runWithDbInfraPrincipal({ source }, () =>
    withIntegratorPoolClient(db, async (client) => {
      const probeDb = drizzle(client);
      const portContext = process.env.DB_PRINCIPAL_CONTEXT_MODE === 'port-context';
      if (!portContext) await probeDb.execute(sql.raw('BEGIN READ ONLY'));
      try {
        for (const statement of statements) await probeDb.execute(sql.raw(statement));
      } finally {
        if (!portContext) await probeDb.execute(sql.raw('ROLLBACK'));
      }
    }),
  ));
}

async function probeNamedRoot(
  source: string,
  functionIdentity: string,
  functionArgs: readonly unknown[],
  statement: SQL,
): Promise<void> {
  await runWithDbInfraPrincipal({ source }, () =>
    runIntegratorNamedRoot(createDbPort(db), functionIdentity, functionArgs, statement),
  );
}

export function assertIntegratorDiagnosticPoolReady(): Promise<void> {
  return probeReadOnly('integrator-projection-health', 'service', [
    'SELECT 1 FROM integrator.projection_outbox WHERE false',
  ]);
}

export async function assertDeliveryWorkerPoolReady(): Promise<void> {
  const probeId = '00000000-0000-4000-8000-000000000000';
  await probeReadOnly('worker:projection-outbox-tick', 'delivery', [
    'SELECT 1 FROM integrator.projection_outbox WHERE false',
    'SELECT 1 FROM public.outgoing_delivery_queue WHERE false',
    "SELECT 1 / has_function_privilege(current_user, 'app.record_operator_delivery_attempt(text,text,text,integer,text)', 'EXECUTE')::int",
    // revalidate_specialist_task_reminder_materialization and apply_specialist_task_reminder_success_outcome
    // both take `SELECT ... FOR UPDATE` inside, which cannot run in this probe's READ ONLY transaction on
    // any environment (PostgreSQL rejects FOR UPDATE under READ ONLY unconditionally). Readiness can only
    // check the EXECUTE grant, the same way record_operator_delivery_attempt is checked above.
    "SELECT 1 / has_function_privilege(current_user, 'app.revalidate_specialist_task_reminder_materialization(uuid)', 'EXECUTE')::int",
    "SELECT 1 / has_function_privilege(current_user, 'app.apply_specialist_task_reminder_success_outcome(uuid)', 'EXECUTE')::int",
  ]);
  await probeNamedRoot(
    'worker:projection-outbox-tick',
    'app.resolve_outgoing_delivery_scope(uuid)',
    [probeId],
    sql`SELECT resolution FROM app.resolve_outgoing_delivery_scope(${probeId}::uuid)`,
  );
  await probeNamedRoot(
    'worker:projection-outbox-tick',
    'app.operator_incident_alert_already_sent(uuid)',
    [probeId],
    sql`SELECT app.operator_incident_alert_already_sent(${probeId}::uuid)`,
  );
}

export async function assertSchedulerPoolReady(): Promise<void> {
  await probeReadOnly('scheduler:handle-tick-event', 'scheduler', [
    'SELECT 1 FROM integrator.idempotency_keys WHERE false',
  ]);
  await probeNamedRoot(
    'scheduler:handle-tick-event',
    'app.list_scheduler_reminder_organization_ids()',
    [],
    sql`SELECT organization_id FROM app.list_scheduler_reminder_organization_ids() AS scheduler_organizations(organization_id) LIMIT 0`,
  );
}

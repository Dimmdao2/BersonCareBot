import { runWithDbInfraPrincipal } from '@bersoncare/db-principal';
import { db } from './client.js';
import { withIntegratorPoolClient } from './withClient.js';

async function probeReadOnly(source: string, statements: readonly string[]): Promise<void> {
  await runWithDbInfraPrincipal({ source }, () =>
    withIntegratorPoolClient(db, async (client) => {
      await client.query('BEGIN READ ONLY');
      try {
        for (const statement of statements) await client.query(statement);
      } finally {
        await client.query('ROLLBACK');
      }
    }),
  );
}

export function assertIntegratorDiagnosticPoolReady(): Promise<void> {
  return probeReadOnly('integrator-projection-health', [
    'SELECT 1 FROM integrator.projection_outbox WHERE false',
  ]);
}

export function assertDeliveryWorkerPoolReady(): Promise<void> {
  return probeReadOnly('worker:projection-outbox-tick', [
    'SELECT 1 FROM integrator.projection_outbox WHERE false',
    'SELECT 1 FROM integrator.rubitime_create_retry_jobs WHERE false',
    'SELECT 1 FROM public.outgoing_delivery_queue WHERE false',
    "SELECT resolution FROM app.resolve_outgoing_delivery_scope('00000000-0000-4000-8000-000000000000'::uuid)",
    "SELECT app.operator_incident_alert_already_sent('00000000-0000-4000-8000-000000000000'::uuid)",
    "SELECT 1 / has_function_privilege(current_user, 'app.record_operator_delivery_attempt(text,text,text,integer,text)', 'EXECUTE')::int",
  ]);
}

export function assertSchedulerPoolReady(): Promise<void> {
  return probeReadOnly('scheduler:handle-tick-event', [
    'SELECT 1 FROM integrator.idempotency_keys WHERE false',
    'SELECT organization_id FROM app.list_scheduler_reminder_organization_ids() AS scheduler_organizations(organization_id) LIMIT 0',
  ]);
}

import type { IntegrationWebhookSource } from '@bersoncare/operator-db-schema';
import { sql } from 'drizzle-orm';
import { createDbPort } from '../client.js';
import { runIntegratorNamedRoot } from '../runIntegratorSql.js';

const DETAIL_MAX = 900;

function truncateDetail(detail: string | null | undefined): string | null {
  if (detail === undefined || detail === null || detail === '') return null;
  return detail.length > DETAIL_MAX ? `${detail.slice(0, DETAIL_MAX - 1)}…` : detail;
}

export type RecordIntegrationWebhookOutcomeDbInput = {
  source: IntegrationWebhookSource;
  processedOk: boolean;
  errorClass?: string | null;
  httpStatusReturned: number;
  detail?: string | null;
};

export async function recordIntegrationWebhookOutcomeDb(
  input: RecordIntegrationWebhookOutcomeDbInput,
): Promise<void> {
  const errorClass = input.errorClass ?? null;
  const detail = truncateDetail(input.detail);
  await runIntegratorNamedRoot(
    createDbPort(),
    'app.record_integrator_webhook_outcome(text,boolean,integer,text,text)',
    [input.source, input.processedOk, input.httpStatusReturned, errorClass, detail],
    sql`SELECT app.record_integrator_webhook_outcome(
      ${input.source}, ${input.processedOk}, ${input.httpStatusReturned}, ${errorClass}, ${detail}
    )`,
  );
}

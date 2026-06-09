import {
  integrationWebhookErrorEvents,
  integrationWebhookLastStatus,
  type IntegrationWebhookSource,
} from '@bersoncare/operator-db-schema';
import { getIntegratorDrizzle } from '../drizzle.js';

const DETAIL_MAX = 900;

function truncateDetail(detail: string | null | undefined): string | null {
  if (detail === undefined || detail === null || detail === '') return null;
  return detail.length > DETAIL_MAX ? `${detail.slice(0, DETAIL_MAX)}…` : detail;
}

export type UpsertIntegrationWebhookLastStatusInput = {
  source: IntegrationWebhookSource;
  processedOk: boolean;
  errorClass?: string | null;
  httpStatusReturned?: number | null;
  detail?: string | null;
};

export async function upsertIntegrationWebhookLastStatus(
  input: UpsertIntegrationWebhookLastStatusInput,
): Promise<void> {
  const db = getIntegratorDrizzle();
  const receivedAt = new Date().toISOString();
  await db
    .insert(integrationWebhookLastStatus)
    .values({
      source: input.source,
      receivedAt,
      processedOk: input.processedOk ? 1 : 0,
      errorClass: input.errorClass ?? null,
      httpStatusReturned: input.httpStatusReturned ?? null,
      detail: truncateDetail(input.detail),
    })
    .onConflictDoUpdate({
      target: integrationWebhookLastStatus.source,
      set: {
        receivedAt,
        processedOk: input.processedOk ? 1 : 0,
        errorClass: input.errorClass ?? null,
        httpStatusReturned: input.httpStatusReturned ?? null,
        detail: truncateDetail(input.detail),
      },
    });
}

export async function insertIntegrationWebhookErrorEvent(input: {
  source: IntegrationWebhookSource;
  errorClass: string;
}): Promise<void> {
  const db = getIntegratorDrizzle();
  await db.insert(integrationWebhookErrorEvents).values({
    source: input.source,
    errorClass: input.errorClass,
  });
}

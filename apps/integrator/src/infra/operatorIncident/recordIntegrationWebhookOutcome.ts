import type { IntegrationWebhookSource } from '@bersoncare/operator-db-schema';
import type { DispatchPort } from '../../kernel/contracts/index.js';
import { logger } from '../observability/logger.js';
import { recordIntegrationWebhookOutcomeDb } from '../db/repos/integrationWebhookStatusDrizzle.js';
import { reportOperatorFailure } from './reportOperatorFailure.js';

export type IntegrationWebhookErrorClass =
  | 'webhook_auth_failed'
  | 'webhook_parse_failed'
  | 'webhook_dispatch_failed'
  | 'webhook_internal_error';

export type RecordIntegrationWebhookOutcomeInput = {
  source: IntegrationWebhookSource;
  processedOk: boolean;
  httpStatusReturned: number;
  errorClass?: IntegrationWebhookErrorClass | null;
  detail?: string | null;
  dispatchPort?: DispatchPort;
};

/**
 * Записать last-status входящего вебхука; при ошибке — event для burst P8 и инцидент (digest, без immediate push).
 */
export async function recordIntegrationWebhookOutcome(
  input: RecordIntegrationWebhookOutcomeInput,
): Promise<void> {
  try {
    await recordIntegrationWebhookOutcomeDb({
      source: input.source,
      processedOk: input.processedOk,
      errorClass: input.errorClass ?? null,
      httpStatusReturned: input.httpStatusReturned,
      detail: input.detail ?? null,
    });
  } catch (err) {
    logger.warn({ err, source: input.source }, 'integration_webhook_outcome_record_failed');
  }

  if (input.processedOk || !input.errorClass) return;

  try {
    await reportOperatorFailure({
      ...(input.dispatchPort !== undefined ? { dispatchPort: input.dispatchPort } : {}),
      direction: 'inbound_webhook',
      integration: input.source,
      errorClass: input.errorClass,
      errorDetail: input.detail ?? null,
      alertLines: [`Вебхук ${input.source}: ${input.errorClass}`, input.detail ?? ''].filter(
        Boolean,
      ),
    });
  } catch (err) {
    logger.warn({ err, source: input.source }, 'integration_webhook_report_failure_failed');
  }
}

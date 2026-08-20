import type { DbPort, DispatchPort } from '../../kernel/contracts/index.js';
import type { IntegrationDataQualityIncidentInput } from '../../shared/integrationDataQuality/types.js';
import { loadAdminMessengerIdLists } from '../operatorIncident/operatorHealthAlertConfigIntegrator.js';
import { upsertIntegrationDataQualityIncident } from './repos/integrationDataQualityIncidents.js';

/**
 * Upsert data-quality incident; on first deduped insert, best-effort Telegram to admin.
 * Shared by ingest normalization and branch timezone fallback paths.
 */
export async function recordDataQualityIncidentAndMaybeTelegram(input: {
  db: DbPort;
  /** When omitted, incident is still upserted; Telegram alert is skipped. */
  dispatchPort?: DispatchPort;
  incident: IntegrationDataQualityIncidentInput;
  alertLines: string[];
}): Promise<void> {
  const { occurrences } = await upsertIntegrationDataQualityIncident(input.db, input.incident);
  if (occurrences !== 1) return;

  const dispatchPort = input.dispatchPort;
  if (!dispatchPort) return;

  const recipients = await loadAdminMessengerIdLists();
  const text = input.alertLines.join('\n');
  const eventId = `data-quality:${input.incident.integration}:${input.incident.entity}:${input.incident.externalId}`.slice(0, 240);
  for (const chatId of recipients.telegram) {
    try {
      await dispatchPort.dispatchOutgoing({
        type: 'message.send',
        meta: { eventId: `${eventId}:telegram:${chatId}`.slice(0, 240), occurredAt: new Date().toISOString(), source: 'telegram' },
        payload: { recipient: { chatId }, message: { text }, delivery: { channels: ['telegram'], maxAttempts: 1 } },
      });
    } catch {
      // best-effort alert
    }
  }
}

import type { DbPort, DispatchPort, OutgoingIntent } from "../../kernel/contracts/index.js";
import { telegramConfig } from "../../integrations/telegram/config.js";
import type { IntegrationDataQualityIncidentInput } from "../../shared/integrationDataQuality/types.js";
import { upsertIntegrationDataQualityIncident } from "./repos/integrationDataQualityIncidents.js";

/**
 * Upsert data-quality incident; on first deduped insert, best-effort Telegram to admin.
 * Shared by Rubitime ingest normalization and branch timezone fallback paths.
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

  const adminId = telegramConfig.adminTelegramId;
  if (typeof adminId !== "number" || !Number.isFinite(adminId)) return;

  const text = input.alertLines.join("\n");
  const dedupKey = [
    input.incident.integration,
    input.incident.entity,
    input.incident.externalId,
    input.incident.field,
    input.incident.errorReason,
  ].join(":");

  const intent: OutgoingIntent = {
    type: "message.send",
    meta: {
      eventId: `data-quality:${dedupKey}`.slice(0, 240),
      occurredAt: new Date().toISOString(),
      source: "telegram",
    },
    payload: {
      recipient: { chatId: adminId },
      message: { text },
      delivery: { channels: ["telegram"], maxAttempts: 1 },
    },
  };
  try {
    await dispatchPort.dispatchOutgoing(intent);
  } catch {
    // best-effort alert
  }
}

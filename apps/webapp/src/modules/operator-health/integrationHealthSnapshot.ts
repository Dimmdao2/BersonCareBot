import type { IntegrationWebhookLastStatusRow } from "./ports";
import {
  readProbeIntegrationOutcome,
  type ProbeIntegrationKey,
  type ProbeIntegrationOutcome,
} from "./probeOutboundMeta";

export type IntegrationOutboundHealth = {
  status: ProbeIntegrationOutcome;
  lastFinishedAt: string | null;
};

export type IntegrationInboundHealth = {
  receivedAt: string | null;
  processedOk: boolean | null;
  errorClass: string | null;
  httpStatusReturned: number | null;
  detail: string | null;
};

export type IntegrationHealthEntry = {
  outbound: IntegrationOutboundHealth;
  inbound?: IntegrationInboundHealth;
};

export type IntegrationsHealthSnapshot = {
  rubitime: IntegrationHealthEntry;
  telegram: IntegrationHealthEntry;
  max: IntegrationHealthEntry;
  google_calendar: { outbound: IntegrationOutboundHealth };
};

function outboundFromProbe(
  metaJson: Record<string, unknown> | undefined | null,
  key: ProbeIntegrationKey,
  lastFinishedAt: string | null,
): IntegrationOutboundHealth {
  return {
    status: readProbeIntegrationOutcome(metaJson, key),
    lastFinishedAt,
  };
}

function inboundFromRow(row: IntegrationWebhookLastStatusRow | undefined): IntegrationInboundHealth {
  if (!row) {
    return {
      receivedAt: null,
      processedOk: null,
      errorClass: null,
      httpStatusReturned: null,
      detail: null,
    };
  }
  return {
    receivedAt: row.receivedAt,
    processedOk: row.processedOk === 1,
    errorClass: row.errorClass,
    httpStatusReturned: row.httpStatusReturned,
    detail: row.detail,
  };
}

export function emptyIntegrationsHealthSnapshot(): IntegrationsHealthSnapshot {
  return buildIntegrationsHealthSnapshot({
    probeMetaJson: null,
    probeLastFinishedAt: null,
    webhookLastStatus: [],
  });
}

export function buildIntegrationsHealthSnapshot(input: {
  probeMetaJson: Record<string, unknown> | undefined | null;
  probeLastFinishedAt: string | null;
  webhookLastStatus: IntegrationWebhookLastStatusRow[];
}): IntegrationsHealthSnapshot {
  const bySource = new Map(input.webhookLastStatus.map((r) => [r.source, r]));
  const lastFinishedAt = input.probeLastFinishedAt;
  const meta = input.probeMetaJson;

  return {
    rubitime: {
      outbound: outboundFromProbe(meta, "rubitime", lastFinishedAt),
      inbound: inboundFromRow(bySource.get("rubitime")),
    },
    telegram: {
      outbound: outboundFromProbe(meta, "telegram", lastFinishedAt),
      inbound: inboundFromRow(bySource.get("telegram")),
    },
    max: {
      outbound: outboundFromProbe(meta, "max", lastFinishedAt),
      inbound: inboundFromRow(bySource.get("max")),
    },
    google_calendar: {
      outbound: outboundFromProbe(meta, "google_calendar", lastFinishedAt),
    },
  };
}

import type { NormalizeToUtcInstantFailureReason } from "../../shared/normalizeToUtcInstant.js";
import { tryNormalizeToUtcInstant } from "../../shared/normalizeToUtcInstant.js";
import { recordDataQualityIncidentAndMaybeTelegram } from "../../infra/db/dataQualityIncidentAlert.js";
import { formatIsoInstantAsRubitimeRecordLocal } from "../../config/appTimezone.js";
import type { DbPort, DispatchPort } from "../../kernel/contracts/index.js";
import type { RubitimeIncomingPayload } from "./connector.js";
import { formatRubitimeRecordAtForDisplay, toRubitimeIncoming } from "./connector.js";
import type { RubitimeWebhookBodyValidated } from "./schema.js";

export type TimeNormalizationFieldError = {
  field: "recordAt" | "dateTimeEnd";
  reason: NormalizeToUtcInstantFailureReason;
};

export type NormalizeRubitimeIngestDeps = {
  db: DbPort;
  dispatchPort: DispatchPort;
  getBranchTimezone: (branchId: string | undefined) => Promise<string>;
};

const RUBITIME_INTEGRATION = "rubitime";
const ENTITY_RECORD = "record";

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/**
 * Mutates {@link RubitimeIncomingPayload}: normalizes `recordAt` / `dateTimeEnd` to UTC ISO-Z using branch timezone.
 * On failure with raw value present: clears the field (Variant A), records incident, Telegram alert on first dedup insert.
 *
 * Semantics (S3.T08):
 * - `recordAt` — business-critical; invalid raw → NULL path + incident + alert.
 * - `dateTimeEnd` — optional; invalid raw → NULL + incident + alert (allowed absent in downstream).
 */
export async function normalizeRubitimeIncomingForIngest(
  incoming: RubitimeIncomingPayload,
  deps: NormalizeRubitimeIngestDeps,
): Promise<void> {
  const tz = await deps.getBranchTimezone(incoming.integratorBranchId);
  const externalId = incoming.recordId ?? "unknown";
  const fieldErrors: TimeNormalizationFieldError[] = [];

  const rawRecordAt = asNonEmptyString(incoming.recordAt);
  if (rawRecordAt) {
    const r = tryNormalizeToUtcInstant(rawRecordAt, tz);
    if (r.ok) {
      incoming.recordAt = r.utcIso;
      incoming.recordAtFormatted = formatRubitimeRecordAtForDisplay(
        formatIsoInstantAsRubitimeRecordLocal(r.utcIso, tz),
      );
    } else {
      delete incoming.recordAt;
      fieldErrors.push({ field: "recordAt", reason: r.reason });
      await recordDataQualityIncidentAndMaybeTelegram({
        db: deps.db,
        dispatchPort: deps.dispatchPort,
        incident: {
          integration: RUBITIME_INTEGRATION,
          entity: ENTITY_RECORD,
          externalId,
          field: "recordAt",
          rawValue: rawRecordAt,
          timezoneUsed: tz,
          errorReason: r.reason,
        },
        alertLines: [
          "⚠️ Rubitime ingest: failed to normalize recordAt",
          `recordId: ${externalId}`,
          `raw: ${rawRecordAt}`,
          `timezone: ${tz}`,
          `reason: ${r.reason}`,
        ],
      });
    }
  }

  const rawEnd = asNonEmptyString(incoming.dateTimeEnd);
  if (rawEnd) {
    const r = tryNormalizeToUtcInstant(rawEnd, tz);
    if (r.ok) {
      incoming.dateTimeEnd = r.utcIso;
    } else {
      delete incoming.dateTimeEnd;
      fieldErrors.push({ field: "dateTimeEnd", reason: r.reason });
      await recordDataQualityIncidentAndMaybeTelegram({
        db: deps.db,
        dispatchPort: deps.dispatchPort,
        incident: {
          integration: RUBITIME_INTEGRATION,
          entity: ENTITY_RECORD,
          externalId,
          field: "dateTimeEnd",
          rawValue: rawEnd,
          timezoneUsed: tz,
          errorReason: r.reason,
        },
        alertLines: [
          "⚠️ Rubitime ingest: failed to normalize dateTimeEnd",
          `recordId: ${externalId}`,
          `raw: ${rawEnd}`,
          `timezone: ${tz}`,
          `reason: ${r.reason}`,
        ],
      });
    }
  }

  incoming.timeNormalizationStatus = fieldErrors.length > 0 ? "degraded" : "ok";
  if (fieldErrors.length > 0) {
    incoming.timeNormalizationFieldErrors = fieldErrors;
  } else {
    delete incoming.timeNormalizationFieldErrors;
  }
}

export async function prepareRubitimeWebhookIngress(
  body: RubitimeWebhookBodyValidated,
  deps: NormalizeRubitimeIngestDeps,
): Promise<RubitimeIncomingPayload> {
  const incoming = toRubitimeIncoming(body);
  await normalizeRubitimeIncomingForIngest(incoming, deps);
  return incoming;
}

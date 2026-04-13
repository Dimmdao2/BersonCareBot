import { createHash } from "node:crypto";
import { stableStringifyForIdempotency } from "./integratorEventSemanticHash";

/** Semantic hash for POST /api/integrator/messenger-phone/bind idempotency (channel + external id + phone only). */
export function computeMessengerPhoneBindRequestHash(parsed: Record<string, unknown>): string {
  const semantic = {
    channelCode: parsed.channelCode,
    externalId: parsed.externalId,
    phoneNormalized: parsed.phoneNormalized,
  };
  return createHash("sha256").update(stableStringifyForIdempotency(semantic)).digest("hex");
}

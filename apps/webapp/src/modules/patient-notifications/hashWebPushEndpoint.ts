import { createHash } from "node:crypto";

/** Короткий хеш endpoint для логов (без PII полного URL). */
export function hashWebPushEndpoint(endpoint: string): string {
  return createHash("sha256").update(endpoint).digest("hex").slice(0, 16);
}

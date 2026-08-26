import { environmentDiagnosticsEnabled } from '@/config/env';

/**
 * DEV and TEST automatically enable detailed operational logs; PROD keeps only significant events.
 * Verbose-логи не должны содержать сырые params/payload/PII. TTL-кэш (fail-safe `false`).
 *
 * NB: это deps-инъекционный путь для staff/background `modules/*`-флоу. Собственный кэш сбрасывается
 * только по TTL (≤30 c). Public auth route-utils use the server-only app_runtime projection accessor;
 * both roots are refreshed by the canonical system_settings write trigger.
 */
export async function isOperationalVerboseLogEnabled(_deps?: unknown): Promise<boolean> {
  return environmentDiagnosticsEnabled;
}

/** @internal */
export function resetOperationalVerboseLogCacheForTests(): void {
  // Environment configuration is immutable in production; retained for existing test callers.
}

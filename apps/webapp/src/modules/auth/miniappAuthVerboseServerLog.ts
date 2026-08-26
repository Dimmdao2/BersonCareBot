import { environmentDiagnosticsEnabled } from '@/config/env';

/**
 * Raw Mini App initData logging is automatic in DEV and TEST and disabled in PROD.
 */
export async function isMiniappAuthVerboseServerLogEnabled(_deps?: unknown): Promise<boolean> {
  return environmentDiagnosticsEnabled;
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
const UNSAFE_DATABASE_TOKEN = /(^|[_-])(prod|production|live)($|[_-])/i;
const DEV_DATABASE = 'bcb_webapp_dev';
const TEST_DATABASE = /(^|[_-])test($|[_-])/i;

export function assertAllowedPurgeDatabaseTarget(input: {
  databaseUrl: string;
  currentDatabase: string;
  allowTestTarget: boolean;
  // Owner-gated PROD cutover unlock. Mirrors deploy/postgres/test-strict-rls-finalizer.sql:
  // the live-like-name refusal is relaxed ONLY when both the explicit flag is set AND the
  // running database name matches the operator-supplied expected name verbatim. No other gate
  // (loopback host, URL validity, name/URL agreement) is loosened. Absent/false => byte-for-byte
  // unchanged behavior. A typo/mismatch still aborts (fail-closed).
  allowAuthorizedProdTarget?: boolean;
  authorizedProdDatabase?: string;
}): void {
  let parsed: URL;
  try {
    parsed = new URL(input.databaseUrl);
  } catch {
    throw new Error('refusing_invalid_database_url');
  }
  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    throw new Error('refusing_non_postgres_database_url');
  }
  if (!LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase())) {
    // The flag NEVER bypasses this: authorized prod cutover is still loopback-only.
    throw new Error('refusing_non_loopback_database_host');
  }
  const urlDatabase = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
  if (!urlDatabase || urlDatabase !== input.currentDatabase) {
    throw new Error('refusing_database_name_mismatch');
  }
  if (UNSAFE_DATABASE_TOKEN.test(input.currentDatabase)) {
    // Reaching here means the host is already asserted loopback and the URL/current DB names agree.
    // Owner-gated unlock: permit a live-like prod name only when BOTH conditions hold together.
    if (input.allowAuthorizedProdTarget === true) {
      if (!input.authorizedProdDatabase) {
        throw new Error('refusing_authorized_prod_target_without_expected_database');
      }
      if (input.currentDatabase !== input.authorizedProdDatabase) {
        throw new Error('refusing_authorized_prod_target_mismatch');
      }
      return;
    }
    throw new Error('refusing_live_like_database');
  }
  if (TEST_DATABASE.test(input.currentDatabase)) {
    if (!input.allowTestTarget) throw new Error('refusing_test_database_without_allow_flag');
    return;
  }
  if (input.currentDatabase !== DEV_DATABASE) {
    throw new Error('refusing_non_named_dev_database');
  }
}

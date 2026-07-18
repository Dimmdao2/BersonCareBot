const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const UNSAFE_DATABASE_TOKEN = /(^|[_-])(prod|production|live)($|[_-])/i;
const DEV_OR_REHEARSAL_DATABASE = /(^|[_-])(dev|rehearsal)($|[_-])/i;
const TEST_DATABASE = /(^|[_-])test($|[_-])/i;

export function assertAllowedPurgeDatabaseTarget(input: {
  databaseUrl: string;
  currentDatabase: string;
  allowTestTarget: boolean;
}): void {
  let parsed: URL;
  try {
    parsed = new URL(input.databaseUrl);
  } catch {
    throw new Error("refusing_invalid_database_url");
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("refusing_non_postgres_database_url");
  }
  if (!LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw new Error("refusing_non_loopback_database_host");
  }
  const urlDatabase = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
  if (!urlDatabase || urlDatabase !== input.currentDatabase) {
    throw new Error("refusing_database_name_mismatch");
  }
  if (UNSAFE_DATABASE_TOKEN.test(input.currentDatabase)) {
    throw new Error("refusing_live_like_database");
  }
  if (TEST_DATABASE.test(input.currentDatabase)) {
    if (!input.allowTestTarget) throw new Error("refusing_test_database_without_allow_flag");
    return;
  }
  if (!DEV_OR_REHEARSAL_DATABASE.test(input.currentDatabase)) {
    throw new Error("refusing_non_disposable_database_name");
  }
}

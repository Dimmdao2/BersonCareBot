/**
 * Boot-time assertion that the database carries the session-revocation column this build compares
 * against (D1, C-1, 2026-07-26).
 *
 * WHY THIS EXISTS. The revocation check is fail-closed by design: a session whose epoch cannot be
 * read is rejected. That is correct per request and catastrophic per deploy — with the code live and
 * migration 0243 not applied, EVERY session is rejected, including brand-new logins, and the only
 * symptom is a uniform 401 that looks like an auth bug rather than a schema bug. An independent
 * audit reproduced exactly that: patient 401, doctor 401, fresh login 401. This repo has also
 * shipped migrations being SKIPPED on production through the drizzle journal watermark, so "the
 * migration always runs" is not an assumption available to us.
 *
 * The remedy is to make the failure loud and early instead of silent and per-request:
 *   * HERE — the process refuses to start against a schema behind the code, in
 *     `instrumentation.ts` `register()`, beside the existing `assertDevAuthBypassConfiguration()`
 *     and the production `DATABASE_URL` assertion. Same file, same shape, same lifecycle hook.
 *   * AND at deploy — `deploy/host/webapp-post-migrate-schema-check.sh` (the guardrail
 *     `deploy-prod.sh` / `deploy-webapp-prod.sh` already run after migrate and BEFORE
 *     `systemctl restart`) lists `platform_users.session_epoch`, as does `deploy-test-saas.sh`'s own
 *     post-migrate column loop. That one refuses to RELEASE; this one refuses to START.
 *
 * REACH. The caller reads `process.env.DATABASE_URL`, the same read the production `DATABASE_URL`
 * assertion beside it already uses. Under systemd (`next start`, EnvironmentFile) that variable is
 * in the environment before Node starts, so the check runs — verified by booting against a database
 * missing the column, which aborted the instrumentation hook. Under `next dev` Next injects
 * `.env.dev` into `process.env` AFTER the instrumentation hook has run, so the check silently
 * no-ops there unless `DATABASE_URL` is exported into the shell. That is a dev-only blind spot, and
 * an acceptable one: the failure this guards against is a DEPLOY event, and deploys also pass
 * through the schema-check script above.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. A connection failure is not schema drift. Refusing to boot
 * because Postgres happened to be slow to accept connections would convert a transient dependency
 * blip into a hard outage — a worse availability defect than the one being fixed. So an unreachable
 * database logs and continues (the app's normal fail-closed request path still protects the data);
 * only a reachable database that is MISSING the column is fatal.
 */

const SESSION_REVOCATION_COLUMN = 'platform_users.session_epoch';

export type SessionRevocationSchemaProbe = () => Promise<boolean>;

export class SessionRevocationSchemaError extends Error {
  constructor() {
    super(
      `Database schema is behind this build: ${SESSION_REVOCATION_COLUMN} is missing. ` +
        'Session revocation compares that column on every request, so starting now would reject ' +
        'every session including new logins. Run the webapp migrations (0243) and start again.',
    );
    this.name = 'SessionRevocationSchemaError';
  }
}

/**
 * @param probe resolves `true` when the column exists, `false` when the database answered and it
 *   does not, and REJECTS when the database could not be reached at all.
 */
export async function assertSessionRevocationSchema(
  probe: SessionRevocationSchemaProbe,
  log: (message: string) => void = (message) => console.warn(message),
): Promise<void> {
  let present: boolean;
  try {
    present = await probe();
  } catch {
    log(
      `[boot] could not verify ${SESSION_REVOCATION_COLUMN} (database unreachable); ` +
        'continuing — this check fails the boot only on a database that answers and is behind.',
    );
    return;
  }
  if (!present) throw new SessionRevocationSchemaError();
  // One line on the success path too. A guardrail that is silent when it passes is indistinguishable
  // from a guardrail that never ran — which is precisely how the missing deploy assertion went
  // unnoticed until an audit reproduced the outage.
  log(`[boot] ${SESSION_REVOCATION_COLUMN} present — session revocation is enforceable.`);
}

/** The real probe. Kept separate from the assertion so the assertion stays unit-testable. */
export async function probeSessionRevocationColumn(databaseUrl: string): Promise<boolean> {
  const { Pool } = await import('pg');
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 1,
    connectionTimeoutMillis: 5000,
  });
  try {
    // pg_catalog, NOT information_schema. `information_schema.columns` is PRIVILEGE-FILTERED: it only
    // shows columns the connecting role holds some privilege on. This connection uses the plain
    // DATABASE_URL role, which is the infra/worker login — it does not serve requests and has no grant
    // on session_epoch — so information_schema returned zero rows for a column that plainly exists, and
    // the guard refused to boot a perfectly healthy TEST while telling the operator to run a migration
    // that had already been applied. Verified live on 2026-07-26: the column was present in pg_attribute
    // for all three roles, and both roles that DO serve requests (staff and nonstaff logins) could read
    // it; only the probe's own role could not. pg_catalog is not privilege-filtered, so "absent" here
    // means genuinely absent — which is the only thing this guard is entitled to claim.
    const result = await pool.query(
      `SELECT 1
         FROM pg_catalog.pg_attribute AS attribute
         JOIN pg_catalog.pg_class AS relation ON relation.oid = attribute.attrelid
         JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = 'public'
          AND relation.relname = 'platform_users'
          AND attribute.attname = 'session_epoch'
          AND attribute.attnum > 0
          AND NOT attribute.attisdropped`,
    );
    return result.rowCount === 1;
  } finally {
    await pool.end();
  }
}

const DISPOSABLE_DATABASE_PREFIX = 'pbt_';
const PROTECTED_ENVIRONMENT_NAME = /dev|test|prod/i;

export type DisposablePostgresHarness = Readonly<{
  databaseName: string;
  mode: 'contract-only';
}>;

/**
 * Phase 0 intentionally exposes no connection string and no lifecycle operations.
 * A later, separately authorized worker can implement disposable-cluster plumbing
 * behind this contract; it cannot accidentally select DEV, TEST, or PROD here.
 */
export function disposablePostgresHarness(databaseName: string): DisposablePostgresHarness {
  if (!/^pbt_[a-z0-9_]+$/.test(databaseName)) {
    throw new Error(`Disposable PostgreSQL database names must start with ${DISPOSABLE_DATABASE_PREFIX}.`);
  }
  if (PROTECTED_ENVIRONMENT_NAME.test(databaseName)) {
    throw new Error('Disposable PostgreSQL harness rejects DEV, TEST, and PROD-looking database names.');
  }

  return Object.freeze({ databaseName, mode: 'contract-only' });
}

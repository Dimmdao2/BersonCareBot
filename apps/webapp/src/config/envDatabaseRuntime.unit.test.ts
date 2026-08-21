import { describe, expect, it } from 'vitest';
import { webappRuntimeDatabaseIsConfigured } from './env';

describe('webappRuntimeDatabaseIsConfigured', () => {
  it('recognizes port-context without the removed aggregate DATABASE_URL', () => {
    expect(
      webappRuntimeDatabaseIsConfigured({
        DB_PRINCIPAL_CONTEXT_MODE: 'port-context',
        DATABASE_URL: '',
        DATABASE_URL_STAFF: 'postgresql://staff@db/app',
        DATABASE_URL_PATIENT: 'postgresql://patient@db/app',
        DATABASE_URL_GLOBAL_ADMIN: 'postgresql://global@db/app',
      }),
    ).toBe(true);
  });

  it('fails closed when any port-context pool is missing', () => {
    expect(
      webappRuntimeDatabaseIsConfigured({
        DB_PRINCIPAL_CONTEXT_MODE: 'port-context',
        DATABASE_URL: '',
        DATABASE_URL_STAFF: 'postgresql://staff@db/app',
        DATABASE_URL_PATIENT: 'postgresql://patient@db/app',
        DATABASE_URL_GLOBAL_ADMIN: '',
      }),
    ).toBe(false);
  });

  it('keeps the legacy aggregate URL contract outside port-context', () => {
    expect(
      webappRuntimeDatabaseIsConfigured({
        DB_PRINCIPAL_CONTEXT_MODE: 'locked',
        DATABASE_URL: 'postgresql://legacy@db/app',
        DATABASE_URL_STAFF: '',
        DATABASE_URL_PATIENT: '',
        DATABASE_URL_GLOBAL_ADMIN: '',
      }),
    ).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { parseWebappEnv, webappRuntimeDatabaseIsConfigured } from './env';

describe('webappRuntimeDatabaseIsConfigured', () => {
  it('uses APP_BASE_URL for the patient origin when PATIENT_APP_ORIGIN is absent', () => {
    expect(
      parseWebappEnv({
        APP_BASE_URL: 'https://staff.example.test',
      }).PATIENT_APP_ORIGIN,
    ).toBe('https://staff.example.test');
  });

  it('keeps an explicitly configured patient origin', () => {
    expect(
      parseWebappEnv({
        APP_BASE_URL: 'https://staff.example.test',
        PATIENT_APP_ORIGIN: 'https://patient.example.test',
      }).PATIENT_APP_ORIGIN,
    ).toBe('https://patient.example.test');
  });

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

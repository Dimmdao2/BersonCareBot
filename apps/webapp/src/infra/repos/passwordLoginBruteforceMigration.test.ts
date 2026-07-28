import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  path.resolve(
    path.dirname(new URL(import.meta.url).pathname),
    '../../../db/drizzle-migrations/0266_password_login_bruteforce_protection.sql',
  ),
  'utf8',
);

describe('password login brute-force migration', () => {
  it('stores the canonical account counter and temporary deadline on password credentials', () => {
    expect(migration).toContain(
      'ADD COLUMN IF NOT EXISTS failed_attempts integer NOT NULL DEFAULT 0',
    );
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS locked_until timestamptz');
    expect(migration).toContain("WHEN v_next_attempts >= 10 THEN v_now + interval '15 minutes'");
    expect(migration).toContain('30 * power(2, v_next_attempts - 5)');
  });

  it('resets expired tenth-attempt locks and successful password proofs', () => {
    expect(migration).toContain('v_failed_attempts >= 10');
    expect(migration).toContain('v_locked_until <= v_now');
    expect(migration).toContain('failed_attempts = 0');
    expect(migration).toContain('locked_until = NULL');
  });

  it('reuses existing accessors without adding grants or changing RLS', () => {
    expect(migration).not.toMatch(/\bGRANT\b/u);
    expect(migration).not.toMatch(/\b(?:ENABLE|DISABLE|FORCE|NO FORCE) ROW LEVEL SECURITY\b/u);
    expect(migration).toContain('CREATE OR REPLACE FUNCTION app.auth_rate_limit_record');
    expect(migration).toContain(
      'CREATE OR REPLACE FUNCTION app.set_staff_security_self_password_hash',
    );
  });
});

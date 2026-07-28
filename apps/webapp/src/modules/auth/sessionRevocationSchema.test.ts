import { describe, expect, it, vi } from 'vitest';

import {
  assertSessionRevocationSchema,
  SessionRevocationSchemaError,
} from './sessionRevocationSchema';

// D1 (C-1, 2026-07-26). The boot guard that turns "every request 401s, including brand-new logins"
// into "the process refuses to start, naming the migration". Live evidence for the real probe:
// booting the webapp against a database whose platform_users has no session_epoch aborted the
// instrumentation hook with this exact error; booting it against the migrated database did not.

describe('assertSessionRevocationSchema', () => {
  it('refuses to start when the database answers and the column is missing', async () => {
    await expect(
      assertSessionRevocationSchema(
        async () => false,
        () => {},
      ),
    ).rejects.toBeInstanceOf(SessionRevocationSchemaError);
  });

  it('names the migration in the error, so the operator is not left guessing', async () => {
    await expect(
      assertSessionRevocationSchema(
        async () => false,
        () => {},
      ),
    ).rejects.toThrow(/platform_users\.session_epoch is missing[\s\S]*0243/);
  });

  it('starts normally when the column is present, and says so once', async () => {
    const log = vi.fn();
    await expect(assertSessionRevocationSchema(async () => true, log)).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]![0]).toMatch(/session_epoch present/);
  });

  it('does NOT refuse to start when the database is merely unreachable', async () => {
    // Deliberate: a connection blip is not schema drift, and turning one into a refusal to boot
    // would be a worse availability defect than the one this guard exists to fix.
    const log = vi.fn();
    await expect(
      assertSessionRevocationSchema(async () => {
        throw new Error('ECONNREFUSED');
      }, log),
    ).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]![0]).toMatch(/database unreachable/);
  });
});

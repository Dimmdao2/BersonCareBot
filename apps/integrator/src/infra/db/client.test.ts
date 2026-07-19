/** @vitest-environment node */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const SENSITIVE_TEST_MARKER = 'SENSITIVE_TEST_MARKER_bcb914';

function buildSensitiveError(): Error {
  const err = new Error(
    `duplicate key value violates unique constraint "users_phone_key" Key (phone)=(${SENSITIVE_TEST_MARKER}) already exists.`,
  );
  (err as unknown as { code: string }).code = '23505';
  (err as unknown as { cause: unknown }).cause = {
    body: { message: SENSITIVE_TEST_MARKER },
    providerError: { message: SENSITIVE_TEST_MARKER, phone: SENSITIVE_TEST_MARKER },
    filename: SENSITIVE_TEST_MARKER,
    token: SENSITIVE_TEST_MARKER,
  };
  return err;
}

function isSetConfigCall(sql: unknown): boolean {
  return typeof sql === 'string' && sql.startsWith('SELECT set_config');
}

function renderedOutput(
  stdoutSpy: ReturnType<typeof vi.spyOn>,
  consoleErrorSpy: ReturnType<typeof vi.spyOn>,
): string {
  const stdout = stdoutSpy.mock.calls.map((call: unknown[]) => String(call[0])).join('\n');
  const consoleOut = consoleErrorSpy.mock.calls
    .map((call: unknown[]) =>
      call.map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' '),
    )
    .join('\n');
  return `${stdout}\n${consoleOut}`;
}

describe('integrator DbPort error logging', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  const originalLogLevel = process.env.LOG_LEVEL;

  beforeEach(() => {
    // vitest.setup.ts forces LOG_LEVEL=silent for test-suite quiet; these
    // tests assert actual rendered `error` level output, so raise it back up.
    process.env.LOG_LEVEL = 'error';
    vi.resetModules();
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env.LOG_LEVEL = originalLogLevel;
    vi.resetModules();
  });

  it('never renders raw sql/params or nested sensitive fields on query error', async () => {
    const { createDbPort } = await import('./client.js');

    const sql = 'INSERT INTO users(phone) VALUES ($1) -- lookup by phone';
    const params = [SENSITIVE_TEST_MARKER];
    const err = buildSensitiveError();

    const query = vi.fn(async (queryText: string) => {
      if (isSetConfigCall(queryText)) return { rows: [], rowCount: 0 };
      throw err;
    });
    const release = vi.fn();
    const client = { query, release };
    const pool = { connect: vi.fn(async () => client) };

    const db = createDbPort(pool as never);
    await expect(db.query(sql, params)).rejects.toBe(err);

    const rendered = renderedOutput(stdoutSpy, consoleErrorSpy);
    expect(rendered).not.toContain(SENSITIVE_TEST_MARKER);
    expect(rendered).not.toContain(sql);
    expect(rendered).toContain('23505');
  });

  it('never renders raw sql/params or nested sensitive fields on tx query error', async () => {
    const { createDbPort } = await import('./client.js');

    const sql = 'UPDATE users SET phone = $1 WHERE id = $2';
    const params = [SENSITIVE_TEST_MARKER, 'user-1'];
    const err = buildSensitiveError();

    const query = vi.fn(async (queryText: string) => {
      if (isSetConfigCall(queryText) || queryText === 'BEGIN' || queryText === 'ROLLBACK') {
        return { rows: [], rowCount: 0 };
      }
      throw err;
    });
    const release = vi.fn();
    const client = { query, release };
    const pool = { connect: vi.fn(async () => client) };

    const db = createDbPort(pool as never);
    await expect(
      db.tx(async (txDb) => {
        await txDb.query(sql, params);
      }),
    ).rejects.toBe(err);

    const rendered = renderedOutput(stdoutSpy, consoleErrorSpy);
    expect(rendered).not.toContain(SENSITIVE_TEST_MARKER);
    expect(rendered).not.toContain(sql);
    expect(rendered).toContain('23505');
  });

  it('keeps console fallback safe when the logger itself throws', async () => {
    vi.resetModules();
    vi.doMock('../observability/logger.js', () => ({
      logger: {
        error: () => {
          throw new Error('logger transport unavailable');
        },
      },
    }));

    const { createDbPort } = await import('./client.js');

    const sql = 'DELETE FROM users WHERE phone = $1';
    const params = [SENSITIVE_TEST_MARKER];
    const err = buildSensitiveError();

    const query = vi.fn(async (queryText: string) => {
      if (isSetConfigCall(queryText)) return { rows: [], rowCount: 0 };
      throw err;
    });
    const release = vi.fn();
    const client = { query, release };
    const pool = { connect: vi.fn(async () => client) };

    const db = createDbPort(pool as never);
    await expect(db.query(sql, params)).rejects.toBe(err);

    const rendered = renderedOutput(stdoutSpy, consoleErrorSpy);
    expect(rendered).not.toContain(SENSITIVE_TEST_MARKER);
    expect(rendered).not.toContain(sql);
    expect(rendered).toContain('23505');

    vi.doUnmock('../observability/logger.js');
  });
});

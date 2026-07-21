import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { logger, serializeError } from './logger.js';

const SENSITIVE_TEST_MARKER = 'SENSITIVE_TEST_MARKER_bcb914';

/** Unknown `cause` shape covering every leak vector: nested body/provider keys, an
 * unexpected `patientName`, `response.data`, arrays, and a custom enumerable Error property. */
function buildLeakyCause(): unknown {
  const wrappedError = Object.assign(new Error(SENSITIVE_TEST_MARKER), {
    patientName: SENSITIVE_TEST_MARKER,
  });
  return {
    body: { message: SENSITIVE_TEST_MARKER },
    providerError: { message: SENSITIVE_TEST_MARKER, phone: SENSITIVE_TEST_MARKER },
    patientName: SENSITIVE_TEST_MARKER,
    response: { data: SENSITIVE_TEST_MARKER },
    items: [SENSITIVE_TEST_MARKER, { nested: SENSITIVE_TEST_MARKER }],
    wrappedError,
  };
}

describe('serializeError', () => {
  it('never emits the raw top-level Error.message/stack', () => {
    const e = new Error(SENSITIVE_TEST_MARKER);
    expect(e.stack).toContain(SENSITIVE_TEST_MARKER); // sanity: stack does carry the raw message
    const s = serializeError(e);
    expect(s.type).toBe('Error');
    expect(JSON.stringify(s)).not.toContain(SENSITIVE_TEST_MARKER);
    expect((s as unknown as { message?: unknown }).message).toBeUndefined();
    expect((s as unknown as { stack?: unknown }).stack).toBeUndefined();
  });

  it('never emits a raw non-Error value', () => {
    const s = serializeError(SENSITIVE_TEST_MARKER);
    expect(s.type).toBe('UnknownError');
    expect(JSON.stringify(s)).not.toContain(SENSITIVE_TEST_MARKER);
  });

  it('preserves sanitized PostgreSQL SQLSTATE code/class as explicit safe fields', () => {
    const e = new Error(SENSITIVE_TEST_MARKER);
    (e as unknown as { code: string }).code = '23505';
    const s = serializeError(e);
    expect(s.code).toBe('23505');
    expect(s.class).toBe('23');
    expect(JSON.stringify(s)).not.toContain(SENSITIVE_TEST_MARKER);
  });

  it('never emits any part of an unknown cause shape — closed, value-free output', () => {
    const e = new Error(SENSITIVE_TEST_MARKER);
    (e as unknown as { cause: unknown }).cause = buildLeakyCause();

    const s = serializeError(e);
    expect(JSON.stringify(s)).not.toContain(SENSITIVE_TEST_MARKER);
    expect(Object.keys(s).sort()).toEqual(['type']);
    expect((s as unknown as { cause?: unknown }).cause).toBeUndefined();
  });
});

describe('logger rendered output', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  const originalLogLevel = process.env.LOG_LEVEL;

  beforeEach(() => {
    // vitest.setup.ts forces LOG_LEVEL=silent for test-suite quiet; this suite
    // needs actual rendered `error` level output, so re-instantiate the logger.
    process.env.LOG_LEVEL = 'error';
    vi.resetModules();
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env.LOG_LEVEL = originalLogLevel;
    vi.resetModules();
  });

  it('never prints the marker from the top-level message/stack or from any unknown cause shape (nested body/provider keys, patientName, response.data, arrays, custom enumerable Error properties) in actual rendered output', async () => {
    const { logger: freshLogger } = await import('./logger.js');

    const e = new Error(SENSITIVE_TEST_MARKER);
    (e as unknown as { code: string }).code = '23505';
    (e as unknown as { cause: unknown }).cause = buildLeakyCause();
    expect(e.stack).toContain(SENSITIVE_TEST_MARKER); // sanity: stack does carry the raw message

    freshLogger.error({ err: e, requestId: 'req-123' }, 'handler failed');

    const rendered = stdoutSpy.mock.calls.map((call: unknown[]) => String(call[0])).join('\n');
    expect(rendered).not.toContain(SENSITIVE_TEST_MARKER);
    expect(rendered).toContain('req-123');
    expect(rendered).toContain('23505');
    expect(rendered).toContain('handler failed');
  });

  it('adds only trusted bounded correlation and organization context from the shared principal ALS', async () => {
    const { runWithDbOrganizationPrincipal, runWithObservabilityContext } = await import('@bersoncare/db-principal');
    const { logger: freshLogger } = await import('./logger.js');
    const correlationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const organizationId = '11111111-1111-4111-8111-111111111111';

    await runWithObservabilityContext({ correlationId }, () =>
      runWithDbOrganizationPrincipal(organizationId, () => {
        freshLogger.error({ outcome: 'ok' }, 'request completed');
      }),
    );

    const rendered = stdoutSpy.mock.calls.map((call: unknown[]) => String(call[0])).join('\n');
    expect(rendered).toContain(correlationId);
    expect(rendered).toContain(organizationId);
    expect(rendered).toContain('request completed');
  });
});

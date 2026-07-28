import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLogger, serializeError } from './logger.js';

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

describe('createLogger rendered output', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('never prints the marker from the top-level message/stack or from any unknown cause shape (nested body/provider keys, patientName, response.data, arrays, custom enumerable Error properties) in actual rendered output', () => {
    const logger = createLogger({ LOG_LEVEL: 'error' });

    const e = new Error(SENSITIVE_TEST_MARKER);
    (e as unknown as { code: string }).code = '23505';
    (e as unknown as { cause: unknown }).cause = buildLeakyCause();
    expect(e.stack).toContain(SENSITIVE_TEST_MARKER); // sanity: stack does carry the raw message

    logger.error({ err: e }, 'main loop error');

    const rendered = stdoutSpy.mock.calls.map((call: unknown[]) => String(call[0])).join('\n');
    expect(rendered).not.toContain(SENSITIVE_TEST_MARKER);
    expect(rendered).toContain('23505');
    expect(rendered).toContain('main loop error');
  });

  it('adds bounded trusted job context from the shared principal ALS', async () => {
    const { runWithObservabilityContext } = await import('@bersoncare/db-principal');
    const correlationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const organizationId = '11111111-1111-4111-8111-111111111111';
    const log = createLogger({ LOG_LEVEL: 'info' });

    await runWithObservabilityContext({ correlationId, organizationId }, () => {
      log.info({ outcome: 'done' }, 'transcode completed');
    });

    const rendered = stdoutSpy.mock.calls.map((call: unknown[]) => String(call[0])).join('\n');
    expect(rendered).toContain(correlationId);
    expect(rendered).toContain(organizationId);
    expect(rendered).toContain('transcode completed');
  });
});

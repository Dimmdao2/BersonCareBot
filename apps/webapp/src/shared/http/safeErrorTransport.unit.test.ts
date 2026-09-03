import pino from 'pino';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LOG_SERIALIZERS, logger } from '@/infra/logging/logger';

import {
  jsonError,
  resolveApiFailure,
  safeActionErrorCode,
  TypedApiResponseError,
} from './apiResponse';

/**
 * S4 (owner plan `docs/_TODO/SYSTEMIC_RESIDUAL_AUDIT_AND_FIX_PLAN_2026-08-27.md`, wave 03.09).
 *
 * The acceptance oracles in `apiResponse.unit.test.ts` and `patientPackagesRouteShared.unit.test.ts`
 * prove the user no longer sees internal detail. They cannot prove the other half of the same owner
 * requirement — that the operator *starts* seeing what the user stopped seeing, under the very id
 * the user was given. Both failures this file names are expensive and silent:
 *
 *  - the response carries a correlation id that appears nowhere in the log, so an operator holding
 *    the id the user quotes has nothing to look up and the incident is simply lost;
 *  - the operator log line goes through the closed `err`/`error` serializer (or a mistyped key), so
 *    it records `{ type, code }` and the actual failure text is gone for good.
 *
 * Neither shows up in any user-visible way: responses stay well-formed, tests stay green, and the
 * loss is only discovered when someone needs the detail and it is not there.
 */

const dbFailure = Object.assign(
  new Error(
    'insert into "be_patient_package_items" ("id","patient_package_id") values ($1,$2) - ' +
      'permission denied for table be_patient_package_items',
  ),
  { code: '42501' },
);

const KNOWN_RULES = { catalog_not_found: { code: 'catalog_not_found', status: 404 } } as const;
const FALLBACK = { code: 'membership_operation_failed', status: 500 } as const;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('shared error door — the id the user gets is the id the operator logs under', () => {
  it('returns a correlation id to the caller and logs the full detail under that same id', async () => {
    const operatorLog = vi.spyOn(logger, 'error').mockImplementation(() => undefined);

    const response = jsonError({
      error: dbFailure,
      literalRules: KNOWN_RULES,
      fallback: FALLBACK,
      logEvent: 'test_unmapped_failure',
    });
    const body = (await response.json()) as { error: string; correlationId?: string };

    expect(response.status).toBe(500);
    expect(body.error).toBe('membership_operation_failed');
    expect(typeof body.correlationId).toBe('string');
    expect(body.correlationId).not.toBe('');

    expect(operatorLog).toHaveBeenCalledTimes(1);
    const [payload, event] = operatorLog.mock.calls[0] as [
      { correlationId: string; operatorErrorDetail: unknown },
      string,
    ];
    expect(event).toBe('test_unmapped_failure');
    // The whole point: one id, both audiences. A second generated id would look identical here
    // until an operator actually tried to use it.
    expect(payload.correlationId).toBe(body.correlationId);
    expect(payload.operatorErrorDetail).toBe(dbFailure);
  });

  it('leaves a known domain code untouched — distinct code, no id, no operator log line', async () => {
    const operatorLog = vi.spyOn(logger, 'error').mockImplementation(() => undefined);

    const response = jsonError({
      error: new Error('catalog_not_found'),
      literalRules: KNOWN_RULES,
      fallback: FALLBACK,
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ ok: false, error: 'catalog_not_found' });
    expect(operatorLog).not.toHaveBeenCalled();
  });

  it('gives server actions the same decision: safe code out, full detail to the operator', () => {
    const operatorLog = vi.spyOn(logger, 'error').mockImplementation(() => undefined);

    const code = safeActionErrorCode(dbFailure, 'toggle_failed', 'test_action_failure');

    expect(code).toBe('toggle_failed');
    expect(operatorLog).toHaveBeenCalledTimes(1);
    const [payload] = operatorLog.mock.calls[0] as [{ operatorErrorDetail: unknown }];
    expect(payload.operatorErrorDetail).toBe(dbFailure);
  });

  /**
   * The door has one trusted channel for an outcome a module authored on purpose — the typed error
   * class — and server actions now use it (`entitlementMutationRefusalError`), because a tariff
   * refusal is a sentence the doctor must read, not an internal failure to hide. The expensive and
   * silent failure is the widening: someone re-opens the authored text for *any* `Error` — a
   * literal allowlist of the sentence, a "looks authored" heuristic — and a rejected statement
   * carrying that same text is back on the doctor's screen with every test still green.
   */
  it('trusts the typed authored outcome and still refuses the same text from a plain Error', () => {
    const operatorLog = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    const authored =
      'Невозможно изменить настройки главной страницы пациента: этот раздел не входит в ваш тариф.';

    const trusted = safeActionErrorCode(
      new TypedApiResponseError({ code: authored, status: 403 }),
      'toggle_failed',
      'test_action_failure',
    );
    expect(trusted).toBe(authored);
    expect(operatorLog).not.toHaveBeenCalled();

    const impostor = safeActionErrorCode(
      Object.assign(new Error(authored), { code: '42501' }),
      'toggle_failed',
      'test_action_failure',
    );
    expect(impostor).toBe('toggle_failed');
    expect(operatorLog).toHaveBeenCalledTimes(1);
  });

  it('reuses one id for every failure of the same request instead of minting a new one', () => {
    vi.spyOn(logger, 'error').mockImplementation(() => undefined);

    const first = resolveApiFailure({ error: dbFailure, fallback: FALLBACK });
    const second = resolveApiFailure({ error: new Error('something else'), fallback: FALLBACK });

    expect(first.correlationId).toBe(second.correlationId);
  });
});

describe('operator log serializers — which key keeps detail and which key drops it', () => {
  function logLine(payload: Record<string, unknown>): Record<string, unknown> {
    const written: string[] = [];
    const probe = pino(
      { serializers: LOG_SERIALIZERS, base: null },
      { write: (chunk: string) => void written.push(chunk) },
    );
    probe.error(payload, 'probe');
    return JSON.parse(written.join('')) as Record<string, unknown>;
  }

  it('keeps the full failure under the operator key', () => {
    const line = logLine({ operatorErrorDetail: dbFailure });
    const detail = line.operatorErrorDetail as Record<string, unknown>;

    expect(detail.message).toBe(dbFailure.message);
    expect(detail.code).toBe('42501');
    expect(detail.class).toBe('42');
    expect(typeof detail.stack).toBe('string');
  });

  it('still drops the failure text under the closed err/error keys', () => {
    const line = logLine({ err: dbFailure, error: dbFailure });

    for (const key of ['err', 'error'] as const) {
      const serialized = line[key] as Record<string, unknown>;
      expect(serialized).toEqual({ type: 'Error', code: '42501', class: '42' });
      expect(serialized.message).toBeUndefined();
      expect(serialized.stack).toBeUndefined();
    }
  });

  it('records the cause chain the operator needs, bounded so it cannot run away', () => {
    const root = new Error('root cause: connection terminated unexpectedly');
    const wrapped = new Error('failed to load appointments', { cause: root });

    const detail = logLine({ operatorErrorDetail: wrapped }).operatorErrorDetail as {
      message: string;
      cause?: { message?: string };
    };

    expect(detail.message).toBe('failed to load appointments');
    expect(detail.cause?.message).toBe(root.message);
  });
});

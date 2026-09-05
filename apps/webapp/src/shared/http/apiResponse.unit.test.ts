import { describe, expect, it } from 'vitest';
import { mapApiError, TypedApiResponseError, type ApiErrorLiteralRules } from './apiResponse';

/**
 * S4 acceptance oracle — safe UI/API error boundary
 * (docs/_TODO/SYSTEMIC_RESIDUAL_AUDIT_AND_FIX_PLAN_2026-08-27.md, wave 03.09, R4/S4).
 *
 * This is the general contract every route's error mapping is expected to converge on (only 14 of
 * 454 `route.ts` currently import this module — see the audit artifact). It stays useful after the
 * S4 fix lands: it is the door the other 49 direct `error.message` sinks must be migrated onto, and
 * this test is what keeps that door safe once they are.
 */
const domainRules: ApiErrorLiteralRules = {
  catalog_not_found: { code: 'catalog_not_found', status: 404 },
};

const fallback = { code: 'internal_error', status: 500 } as const;

describe('mapApiError — safe error boundary contract', () => {
  it('keeps a known allowlisted domain code distinct from the fallback', () => {
    const descriptor = mapApiError(new Error('catalog_not_found'), domainRules, fallback);

    expect(descriptor).toEqual({ code: 'catalog_not_found', status: 404 });
  });

  it('keeps a trusted typed error distinct from the fallback', () => {
    const typedError = new TypedApiResponseError({ code: 'payments_disabled', status: 422 });

    expect(mapApiError(typedError, domainRules, fallback)).toEqual(typedError.descriptor);
  });

  it('never lets raw PostgreSQL/Drizzle detail become the mapped code for an unmapped internal error', () => {
    // Fault injection: same reachable shape as R1/R4 — an INSERT rejected by a column-grant gap,
    // carrying SQL text, a real table name, bound params and the PG SQLSTATE.
    const dbError = Object.assign(
      new Error(
        'insert into "be_patient_package_items" ("id","patient_package_id","service_id","quantity") ' +
          'values ($1, $2, $3, $4) - permission denied for table be_patient_package_items',
      ),
      { code: '42501' },
    );

    const descriptor = mapApiError(dbError, domainRules, fallback);

    expect(descriptor).toEqual(fallback);
    expect(descriptor.code).not.toMatch(/insert into|be_patient_package_items|permission denied|values \(|\$\d/i);
  });

  it('falls back safely for a non-Error thrown value carrying internal-looking detail', () => {
    const descriptor = mapApiError(
      { message: 'select * from be_patient_package_items where organization_id = $1' },
      domainRules,
      fallback,
    );

    expect(descriptor).toEqual(fallback);
  });
});

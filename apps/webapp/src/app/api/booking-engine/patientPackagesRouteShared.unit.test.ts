import { describe, expect, it } from 'vitest';
import { membershipErrorResponse } from './patientPackagesRouteShared';

/**
 * S4 acceptance oracle — safe UI/API error boundary
 * (docs/_TODO/SYSTEMIC_RESIDUAL_AUDIT_AND_FIX_PLAN_2026-08-27.md, wave 03.09, R4/S4).
 *
 * `membershipErrorResponse` is the exact helper R4 measured leaking: it takes an unmapped error's
 * raw `.message` and puts it, verbatim, into the JSON body the doctor/patient browser renders. Owner
 * requirement: an unknown internal exception must become a safe, stable response — no query text,
 * table/column names, parameters or raw internal message — while a known domain code stays distinct.
 */
describe('membershipErrorResponse — safe error boundary contract', () => {
  it('keeps a known allowlisted domain code distinct, with its declared status', async () => {
    const response = membershipErrorResponse(new Error('catalog_not_found'));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ ok: false, error: 'catalog_not_found' });
  });

  it('never puts raw PostgreSQL/Drizzle detail into the response body for an unmapped internal error', async () => {
    // Fault injection: the shape R1 makes reachable — an INSERT rejected by a column-grant gap on
    // a real table this route writes to (be_patient_package_items), carrying the PG SQLSTATE for it.
    const dbError = Object.assign(
      new Error(
        'insert into "be_patient_package_items" ("id","patient_package_id","service_id","quantity") ' +
          'values ($1, $2, $3, $4) - permission denied for table be_patient_package_items',
      ),
      { code: '42501' },
    );

    const response = membershipErrorResponse(dbError);
    const body = (await response.json()) as { ok: boolean; error: string };

    // Sanity: still reported as a failure, not silently swallowed.
    expect(response.status).toBe(500);
    expect(body.error).not.toMatch(/insert into|be_patient_package_items|permission denied|values \(|\$\d/i);
    // The owner requirement is a stable, human-safe code — never the verbatim internal message.
    expect(body.error).not.toBe(dbError.message);
  });
});

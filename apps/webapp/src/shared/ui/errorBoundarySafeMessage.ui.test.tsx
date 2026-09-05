/**
 * S4 acceptance oracle — safe UI/API error boundary
 * (docs/_TODO/SYSTEMIC_RESIDUAL_AUDIT_AND_FIX_PLAN_2026-08-27.md, wave 03.09, R4/S4).
 *
 * The React transport is independent from the API/JSON transport (`apiResponse.unit.test.ts`,
 * `patientPackagesRouteShared.unit.test.ts`): these boundaries render whatever escapes into
 * `error.message` from a Server Component/render failure, and that path never goes through
 * `mapApiError`/`jsonError` at all. Owner requirement: the same class of exception — no query text,
 * table/column names, parameters or raw internal message — must not reach the browser here either.
 */
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import GlobalError from '@/app/global-error';
import { SegmentRouteError as PatientSegmentRouteError } from '@/shared/ui/patient/SegmentRouteError';
import { SegmentRouteError as DoctorSegmentRouteError } from '@/shared/ui/doctor/SegmentRouteError';

vi.mock('next/navigation', () => ({
  usePathname: () => '/app/patient/treatment',
  useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
}));

// Fault injection: the same reachable shape as R1/R4 — a raw PostgreSQL/Drizzle failure, the shape
// that reaches a segment/global boundary through an escaped server/render exception.
const rawInternalError = Object.assign(
  new Error(
    'insert into "be_patient_package_items" ("id","patient_package_id") values ($1,$2) - ' +
      'permission denied for table be_patient_package_items',
  ),
  { digest: 'NEXT_DIGEST_TEST' },
);

const leakedDetailPattern = /insert into|permission denied|values \(|be_patient_package_items/i;

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe.each([
  ['patient SegmentRouteError', PatientSegmentRouteError],
  ['doctor SegmentRouteError', DoctorSegmentRouteError],
])('%s — never renders raw internal error detail', (_label, Component) => {
  it('shows a human-safe message instead of the raw SQL/table text', () => {
    render(<Component error={rawInternalError} reset={vi.fn()} />);

    expect(screen.queryByText(leakedDetailPattern)).not.toBeInTheDocument();
    expect(screen.queryByText('be_patient_package_items', { exact: false })).not.toBeInTheDocument();
  });
});

describe('global-error.tsx — never renders raw internal error detail', () => {
  it('shows a human-safe message instead of the raw SQL/table text', () => {
    render(<GlobalError error={rawInternalError} reset={vi.fn()} />);

    expect(screen.queryByText(leakedDetailPattern)).not.toBeInTheDocument();
    expect(screen.queryByText('be_patient_package_items', { exact: false })).not.toBeInTheDocument();
  });
});

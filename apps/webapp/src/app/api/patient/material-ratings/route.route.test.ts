import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  getServerBoolean: vi.fn(),
  getOptionalPatientSession: vi.fn(),
  requirePatientAccess: vi.fn(),
  resolveTenant: vi.fn(),
  getForPatient: vi.fn(),
  putForPatient: vi.fn(),
  submitPatientFeedback: vi.fn(),
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    runtimeConfig: { getServerBoolean: fakes.getServerBoolean },
    patientOrganization: {},
    materialRating: {
      getForPatient: fakes.getForPatient,
      putForPatient: fakes.putForPatient,
    },
    materialRatingFeedback: { submitPatientFeedback: fakes.submitPatientFeedback },
  }),
}));
vi.mock('@/app-layer/guards/requireRole', () => ({
  getOptionalPatientSession: fakes.getOptionalPatientSession,
  requirePatientApiBusinessAccess: fakes.requirePatientAccess,
}));
vi.mock('@/app-layer/platform-access', () => ({
  patientClientBusinessGate: vi.fn().mockResolvedValue('allow'),
  resolvePatientCanViewAuthOnlyContent: vi.fn().mockResolvedValue(true),
}));
vi.mock('@/app/api/booking/bookingTenant', () => ({
  resolvePatientEnrollmentOrganizationId: fakes.resolveTenant,
}));

import { GET, PUT } from './route';
import { POST as POST_FEEDBACK } from './feedback/route';

const session = {
  user: {
    userId: '00000000-0000-4000-8000-000000000317',
    role: 'client',
    displayName: 'Patient',
    bindings: {},
  },
};
const contentPageId = '00000000-0000-4000-8000-000000000318';

beforeEach(() => {
  vi.clearAllMocks();
  fakes.getServerBoolean.mockResolvedValue(false);
  fakes.getOptionalPatientSession.mockResolvedValue(session);
  fakes.requirePatientAccess.mockResolvedValue({ ok: true, session });
  fakes.resolveTenant.mockResolvedValue({
    ok: true,
    organizationId: '00000000-0000-4000-8000-000000000319',
  });
});

describe('material ratings global switch', () => {
  it('blocks GET before resolving a patient or touching rating data', async () => {
    const response = await GET(
      new Request(
        `https://app.example.test/api/patient/material-ratings?kind=content_page&id=${contentPageId}`,
      ),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'material_ratings_disabled',
    });
    expect(fakes.getOptionalPatientSession).not.toHaveBeenCalled();
    expect(fakes.getForPatient).not.toHaveBeenCalled();
  });

  it('blocks PUT before tenant resolution or mutation', async () => {
    const response = await PUT(
      new Request('https://app.example.test/api/patient/material-ratings', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ targetKind: 'content_page', targetId: contentPageId, stars: 5 }),
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: 'material_ratings_disabled' });
    expect(fakes.resolveTenant).not.toHaveBeenCalled();
    expect(fakes.putForPatient).not.toHaveBeenCalled();
  });

  it('blocks low-rating feedback before tenant resolution or mutation', async () => {
    const response = await POST_FEEDBACK(
      new Request('https://app.example.test/api/patient/material-ratings/feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contentPageId,
          ratingValue: 1,
          reasonCodes: ['too_hard'],
          comment: null,
        }),
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: 'material_ratings_disabled' });
    expect(fakes.resolveTenant).not.toHaveBeenCalled();
    expect(fakes.submitPatientFeedback).not.toHaveBeenCalled();
  });
});

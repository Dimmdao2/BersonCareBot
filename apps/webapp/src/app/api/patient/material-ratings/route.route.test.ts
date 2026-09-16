import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  getServerBoolean: vi.fn(),
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
  requirePatientApiBusinessAccess: fakes.requirePatientAccess,
}));
vi.mock('@/app-layer/platform-access', () => ({
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
  fakes.requirePatientAccess.mockResolvedValue({
    ok: true,
    session,
    hasBusinessAccess: true,
  });
  fakes.resolveTenant.mockResolvedValue({
    ok: true,
    organizationId: '00000000-0000-4000-8000-000000000319',
  });
  fakes.getForPatient.mockResolvedValue({
    aggregate: { avg: 4, count: 2, distribution: { 4: 2 } },
    myStars: 4,
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
    expect(fakes.requirePatientAccess).not.toHaveBeenCalled();
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

describe('material ratings patient email gate', () => {
  it('refuses GET after the email deadline without reading rating data', async () => {
    fakes.getServerBoolean.mockResolvedValue(true);
    fakes.requirePatientAccess.mockResolvedValue({
      ok: false,
      response: Response.json(
        {
          ok: false,
          error: 'patient_email_required',
          redirectTo: '/app/patient/bind-email?next=%2Fapp%2Fpatient',
        },
        { status: 403 },
      ),
    });

    const response = await GET(
      new Request(
        `https://app.example.test/api/patient/material-ratings?kind=content_page&id=${contentPageId}`,
      ),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: 'patient_email_required' });
    expect(fakes.getForPatient).not.toHaveBeenCalled();
  });

  it('keeps GET available during the soft email-request period', async () => {
    fakes.getServerBoolean.mockResolvedValue(true);

    const response = await GET(
      new Request(
        `https://app.example.test/api/patient/material-ratings?kind=content_page&id=${contentPageId}`,
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, myStars: 4 });
  });

  it('keeps activation-pending GET aggregate-only while enforcing the email door', async () => {
    fakes.getServerBoolean.mockResolvedValue(true);
    fakes.requirePatientAccess.mockResolvedValue({
      ok: true,
      session,
      hasBusinessAccess: false,
    });
    fakes.getForPatient.mockResolvedValue({
      aggregate: { avg: 4, count: 2, distribution: { 4: 2 } },
      myStars: null,
    });

    const response = await GET(
      new Request(
        `https://app.example.test/api/patient/material-ratings?kind=content_page&id=${contentPageId}`,
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, myStars: null });
    expect(fakes.getForPatient).toHaveBeenCalledWith(
      expect.objectContaining({ userId: null }),
    );
  });
});

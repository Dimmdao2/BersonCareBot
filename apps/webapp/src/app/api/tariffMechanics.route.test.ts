import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: vi.fn() }));
vi.mock('@/app-layer/guards/requireEntitlement', () => ({
  requireEntitlementForMutation: vi.fn(),
}));
vi.mock('@/app-layer/guards/requireRole', () => ({
  requireClinicManagementApiContext: vi.fn(),
  requireDoctorWorkspaceApiContext: vi.fn(),
  requirePatientApiBusinessAccess: vi.fn(),
}));
vi.mock('@/app-layer/principal/withOrganizationPrincipal', () => ({
  withDoctorWorkspacePrincipal: vi.fn(
    <T>(_ctx: unknown, _operation: string, fn: () => T): T => fn(),
  ),
}));
vi.mock('@/app-layer/guards/doctorWorkspacePrincipal', () => ({
  withDoctorWorkspacePrincipal: vi.fn(<T>(...args: unknown[]): T => (args.at(-1) as () => T)()),
}));
vi.mock('@/app-layer/media/clientMediaFolders', () => ({
  pgEnsureClientPatientFolder: vi.fn(),
}));
vi.mock('@/app/api/booking/bookingTenant', () => ({
  resolvePatientEnrollmentOrganizationId: vi.fn(),
}));

import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireEntitlementForMutation } from '@/app-layer/guards/requireEntitlement';
import {
  requireClinicManagementApiContext,
  requireDoctorWorkspaceApiContext,
  requirePatientApiBusinessAccess,
} from '@/app-layer/guards/requireRole';
import { resolvePatientEnrollmentOrganizationId } from '@/app/api/booking/bookingTenant';
import { POST as createCourse } from '@/app/api/doctor/courses/route';
import { PUT as saveNotificationTemplate } from '@/app/api/doctor/notification-templates/route';
import { POST as submitRatingFeedback } from '@/app/api/patient/material-ratings/feedback/route';
import { PUT as saveMaterialRating } from '@/app/api/patient/material-ratings/route';
import { POST as createPatientFile } from '@/app/api/doctor/patients/[userId]/files/route';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const TARGET_ID = '33333333-3333-4333-8333-333333333333';

const workspace = { organizationId: ORG_ID, session: { user: { userId: USER_ID } } };
const denied = { ok: false as const, response: NextResponse.json({ ok: false }, { status: 403 }) };

function request(url: string, body: unknown): Request {
  return new Request(url, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireDoctorWorkspaceApiContext).mockResolvedValue({
    ok: true,
    ctx: workspace,
  } as never);
  vi.mocked(requireClinicManagementApiContext).mockResolvedValue({
    ok: true,
    ctx: workspace,
  } as never);
  vi.mocked(requirePatientApiBusinessAccess).mockResolvedValue({
    ok: true,
    session: workspace.session,
  } as never);
  vi.mocked(requireEntitlementForMutation).mockResolvedValue(denied);
  vi.mocked(resolvePatientEnrollmentOrganizationId).mockResolvedValue({
    ok: true,
    organizationId: ORG_ID,
  });
  vi.mocked(buildAppDeps).mockReturnValue({
    courses: { createCourse: vi.fn() },
    notifTemplates: { saveManagedTemplate: vi.fn(), saveManagedPresentation: vi.fn() },
    systemSettings: { getSetting: vi.fn().mockResolvedValue({ valueJson: { value: false } }) },
    doctorClientsPort: { getClientIdentityForOrganization: vi.fn() },
    patientFiles: { createFile: vi.fn() },
    orgEntitlements: {},
    patientOrganization: {},
    materialRating: {
      putForPatient: vi.fn().mockResolvedValue({
        ok: true,
        aggregate: { avg: 5, count: 1, distribution: [0, 0, 0, 0, 1] },
        myStars: 5,
      }),
    },
    materialRatingFeedback: {
      submitPatientFeedback: vi.fn().mockResolvedValue({ ok: true, id: TARGET_ID }),
    },
  } as unknown as ReturnType<typeof buildAppDeps>);
});

describe('tariff and platform mutation gates', () => {
  it('refuses course creation when courses are not included in the tariff', async () => {
    const response = await createCourse(
      request('https://app.example.test/api/doctor/courses', {
        title: 'Курс',
        programTemplateId: TARGET_ID,
      }),
    );

    expect(response.status).toBe(403);
  });

  it('refuses saving a clinic notification template when branding is disabled', async () => {
    const response = await saveNotificationTemplate(
      request('https://app.example.test/api/doctor/notification-templates', {
        kind: 'template',
        event: 'created',
        audience: 'patient',
        channels: {
          email: { subject: 's', plainText: 't' },
          telegram: { text: 't' },
          max: { text: 't' },
          smsc: { text: 't' },
          web_push: { title: 't', text: 't' },
        },
        expectedUpdatedAt: null,
      }),
    );

    expect(response.status).toBe(403);
  });

  it('refuses both rating writes while material ratings are disabled platform-wide', async () => {
    const ratingResponse = await saveMaterialRating(
      request('https://app.example.test/api/patient/material-ratings', {
        targetKind: 'content_page',
        targetId: TARGET_ID,
        stars: 5,
      }),
    );
    const feedbackResponse = await submitRatingFeedback(
      request('https://app.example.test/api/patient/material-ratings/feedback', {
        contentPageId: TARGET_ID,
        ratingValue: 3,
      }),
    );

    expect(ratingResponse.status).toBe(403);
    await expect(ratingResponse.json()).resolves.toMatchObject({
      error: 'material_ratings_disabled',
    });
    expect(feedbackResponse.status).toBe(403);
    await expect(feedbackResponse.json()).resolves.toMatchObject({
      error: 'material_ratings_disabled',
    });
  });

  it('refuses file metadata creation visibly when the assigned tariff has no file limit', async () => {
    const createFile = vi.fn();
    vi.mocked(requireEntitlementForMutation).mockResolvedValue({ ok: true });
    vi.mocked(buildAppDeps).mockReturnValue({
      doctorClientsPort: {
        getClientIdentityForOrganization: vi.fn().mockResolvedValue({ userId: TARGET_ID }),
      },
      patientFiles: { createFile },
      orgEntitlements: {
        getSnapshot: vi.fn().mockResolvedValue({
          tariff: { mechanics: {}, quotas: {}, includedSeats: null },
          overrides: [],
          access: { lifecycle: 'active', tariffId: 'tariff', source: 'assignment' },
        }),
      },
    } as unknown as ReturnType<typeof buildAppDeps>);

    const response = await createPatientFile(
      request('https://app.example.test/api/doctor/patients/' + TARGET_ID + '/files', {
        category: 'анализ',
        fileName: 'result.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1,
      }),
      { params: Promise.resolve({ userId: TARGET_ID }) },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: 'file_storage_limit_not_configured',
    });
    expect(createFile).not.toHaveBeenCalled();
  });
});

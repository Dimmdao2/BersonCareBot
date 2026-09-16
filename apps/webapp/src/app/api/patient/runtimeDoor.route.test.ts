import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  requirePatientApiBusinessAccess: vi.fn(),
}));

vi.mock('@/app-layer/guards/requireRole', () => ({
  requirePatientApiBusinessAccess: fakes.requirePatientApiBusinessAccess,
}));
vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => {
    throw new Error('clinical dependency reached after email refusal');
  },
}));

import { GET as getDiaryContext } from './diary/quick-add-context/route';
import { GET as getTreatmentPrograms } from './treatment-program-instances/route';
import { GET as getMessages } from './messages/route';
import { GET as getProgramFileStatus } from './media/program-submission/[mediaId]/status/route';

const refusal = () =>
  Response.json(
    {
      ok: false,
      error: 'patient_email_required',
      redirectTo: '/app/patient/bind-email',
    },
    { status: 403 },
  );

beforeEach(() => {
  vi.clearAllMocks();
  fakes.requirePatientApiBusinessAccess.mockResolvedValue({ ok: false, response: refusal() });
});

describe('E5 runtime door on representative clinical routes', () => {
  it('refuses diary data', async () => {
    expect((await getDiaryContext()).status).toBe(403);
  });

  it('refuses treatment programs', async () => {
    expect((await getTreatmentPrograms()).status).toBe(403);
  });

  it('refuses correspondence', async () => {
    expect((await getMessages(new Request('https://app.test/api/patient/messages'))).status).toBe(
      403,
    );
  });

  it('refuses program file status', async () => {
    const response = await getProgramFileStatus(
      new Request(
        'https://app.test/api/patient/media/program-submission/00000000-0000-4000-8000-000000000001/status?instanceId=00000000-0000-4000-8000-000000000002',
      ),
      { params: Promise.resolve({ mediaId: '00000000-0000-4000-8000-000000000001' }) },
    );
    expect(response.status).toBe(403);
  });
});

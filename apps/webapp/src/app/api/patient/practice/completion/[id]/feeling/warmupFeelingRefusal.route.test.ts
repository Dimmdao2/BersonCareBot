import { describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  buildAppDeps: vi.fn(),
  requirePatientApiBusinessAccess: vi.fn(),
  resolvePatientEnrollmentOrganizationId: vi.fn(),
  withPatientOrganizationPrincipal: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: fakes.revalidatePath }));
vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: fakes.buildAppDeps }));
vi.mock('@/app-layer/guards/requireRole', () => ({
  requirePatientApiBusinessAccess: fakes.requirePatientApiBusinessAccess,
}));
vi.mock('@/app/api/booking/bookingTenant', () => ({
  resolvePatientEnrollmentOrganizationId: fakes.resolvePatientEnrollmentOrganizationId,
}));
vi.mock('@/app-layer/principal/withOrganizationPrincipal', () => ({
  withPatientOrganizationPrincipal: fakes.withPatientOrganizationPrincipal,
}));

import { PATCH } from './route';
import { WarmupFeelingRefusedError } from '@/modules/patient-practice/warmupFeelingCompletionPort';

const organizationId = '11111111-1111-4111-8111-111111111111';
const patientUserId = '22222222-2222-4222-8222-222222222222';
const completionId = '33333333-3333-4333-8333-333333333333';

function arrange(
  applyDailyWarmupFeeling: (params: { feeling: number }) => Promise<{ duplicate: boolean }>,
) {
  fakes.requirePatientApiBusinessAccess.mockResolvedValue({
    ok: true,
    session: { user: { userId: patientUserId } },
  });
  fakes.resolvePatientEnrollmentOrganizationId.mockResolvedValue({ ok: true, organizationId });
  fakes.withPatientOrganizationPrincipal.mockImplementation((_ctx: unknown, run: () => unknown) =>
    run(),
  );
  fakes.buildAppDeps.mockReturnValue({
    patientOrganization: {},
    patientPractice: {
      getCompletionByIdForUser: async () => ({
        id: completionId,
        source: 'daily_warmup',
        feeling: null,
        completedAt: '2026-08-18T08:20:16.771Z',
      }),
    },
    references: {
      listActiveItemsByCategoryCode: async () => [
        {
          id: '44444444-4444-4444-8444-444444444444',
          code: 'warmup_feeling',
          title: 'Самочувствие после разминки',
        },
      ],
    },
    warmupFeelingCompletion: { applyDailyWarmupFeeling },
  });
}

function patch(feeling: number): Promise<Response> {
  return PATCH(
    new Request(
      `https://app.example.test/api/patient/practice/completion/${completionId}/feeling`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feeling }),
      },
    ),
    { params: Promise.resolve({ id: completionId }) },
  );
}

describe('PATCH /api/patient/practice/completion/[id]/feeling', () => {
  it('сохраняет любой балл шкалы 1–5, а не только 1, 3 и 5', async () => {
    const applied: number[] = [];
    for (const feeling of [1, 2, 3, 4, 5]) {
      arrange(async (params) => {
        applied.push(params.feeling);
        return { duplicate: false };
      });
      const response = await patch(feeling);
      expect(response.status, `балл ${feeling}`).toBe(200);
      await expect(response.json()).resolves.toEqual({ ok: true });
    }
    expect(applied).toEqual([1, 2, 3, 4, 5]);
  });

  it('отказ шва человек читает предложением, а не машинным кодом', async () => {
    arrange(async () => {
      throw new WarmupFeelingRefusedError('warmup_completion_not_current_patient');
    });

    const response = await patch(4);

    expect(response.status).toBe(409);
    const body = (await response.json()) as { ok: boolean; error: string; message: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe('warmup_completion_not_current_patient');
    // Экран показывает именно `message` (PatientContentPracticeComplete → toast.error(data.message)).
    expect(body.message).toMatch(/^Не удалось записать самочувствие: .+\.$/u);
    expect(body.message).not.toMatch(/_rejected|P0001|[a-z]+_[a-z]+_[a-z]+/u);
  });

  it('сбой, который не является отказом шва, не выдаётся человеку за отказ', async () => {
    arrange(async () => {
      throw new Error('connection terminated unexpectedly');
    });

    await expect(patch(4)).rejects.toThrow('connection terminated unexpectedly');
  });
});

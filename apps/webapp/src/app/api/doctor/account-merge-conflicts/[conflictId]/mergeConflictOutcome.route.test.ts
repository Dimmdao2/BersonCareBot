import { describe, expect, it, vi } from 'vitest';

/**
 * Канон §18б: у врача ровно два действия, и «слить» — это «да, это мой клиент», под свою
 * ответственность. Действие обязано либо исполниться, либо честно сказать, что не исполнилось.
 *
 * Дорогая молчаливая поломка, уже случившаяся: у пары есть медицинский конфликт в двух клиниках;
 * врач первой жмёт «слить», слияния не происходит (блокер второй клиники снимает только её врач),
 * а маршрут отвечает `200 {"ok":true,"action":"merge"}`. Врач считает конфликт разобранным, человек
 * остаётся двумя учётками, и вернуться к этому конфликту нечем. Причина была ровно тут: исход двери
 * схлопывался в `true` по дороге наружу.
 *
 * Независимый oracle — канон, а не реализация: проверяется наблюдаемый ответ HTTP-границы на каждый
 * из трёх исходов двери. Точные коды и тексты не фиксируются: их выбирает продукт.
 */
const fakes = vi.hoisted(() => ({
  requireDoctorWorkspaceApiContext: vi.fn(),
  mergeMedicalConflict: vi.fn(),
}));

vi.mock('@/app-layer/guards/requireRole', () => ({
  requireDoctorWorkspaceApiContext: fakes.requireDoctorWorkspaceApiContext,
}));
vi.mock('@/app-layer/guards/doctorWorkspacePrincipal', () => ({
  withDoctorWorkspacePrincipal: (_ctx: unknown, work: () => Promise<unknown>) => work(),
}));
vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    patientMergeCandidate: createPatientMergeCandidateService({
      mergeMedicalConflict: fakes.mergeMedicalConflict,
    } as unknown as PatientMergeCandidatePort),
  }),
}));

import { createPatientMergeCandidateService } from '@/modules/patient-merge-candidate/service';
import type { PatientMergeCandidatePort } from '@/modules/patient-merge-candidate/ports';
import { POST } from './route';

const ORGANIZATION_ID = '22222222-2222-4222-8222-222222222222';
const CONFLICT_ID = '33333333-3333-4333-8333-333333333333';

async function pressMerge(outcome: string) {
  fakes.requireDoctorWorkspaceApiContext.mockResolvedValue({
    ok: true,
    ctx: { organizationId: ORGANIZATION_ID, session: { user: { userId: 'doctor-1' } } },
  });
  fakes.mergeMedicalConflict.mockResolvedValue(outcome);
  const response = await POST(
    new Request(`http://test/api/doctor/account-merge-conflicts/${CONFLICT_ID}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'merge' }),
    }),
    { params: Promise.resolve({ conflictId: CONFLICT_ID }) },
  );
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

describe('врач нажал «слить» — ответ соответствует тому, что произошло (§18б)', () => {
  it('слияние состоялось — врач получает успех', async () => {
    const { status, body } = await pressMerge('merged');
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
  });

  it('слияния не было, ждём вторую клинику — врач НЕ получает успех', async () => {
    const waiting = await pressMerge('awaiting_other_organization');
    const missing = await pressMerge('conflict_not_found');

    expect(waiting.body.ok).not.toBe(true);
    expect(waiting.status).not.toBe(200);
    // И это НЕ «такого конфликта у вас нет»: врачу есть что показать, и состояния разные.
    expect(waiting.body.error).not.toBe(missing.body.error);
  });

  it('незакрытого конфликта этой клиники нет — отказ', async () => {
    const { status, body } = await pressMerge('conflict_not_found');
    expect(status).toBe(403);
    expect(body.ok).toBe(false);
  });
});

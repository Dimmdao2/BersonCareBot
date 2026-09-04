import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * S4 (owner plan `docs/_TODO/SYSTEMIC_RESIDUAL_AUDIT_AND_FIX_PLAN_2026-08-27.md`, lines 210–224 and
 * the owner decision on lines 277–281): «S4 возвращает пользователю короткий безопасный correlation
 * id, общий с серверным логом; внутренний текст ошибки остаётся только оператору.»
 *
 * `safeErrorTransport.unit.test.ts` proves the shared door returns that pair. It cannot prove the
 * pair survives the trip a doctor actually makes — server action result type, then the component
 * that renders it. That trip is where the requirement was lost before: the door produced the id and
 * the action threw it away, so a reachable unknown DB failure reached the screen as a bare code with
 * nothing to quote to support, and no test noticed because the code itself was correct.
 *
 * Both halves are asserted against one injected failure: nothing internal on screen, and the visible
 * reference equal to the id the operator log line was written under. The named tariff refusal is
 * asserted beside it, because the cheap way to satisfy the first half is to make every failure
 * generic — that would delete the sentence the doctor can act on.
 */

const routerRefresh = vi.fn();
const deps = vi.hoisted(() => ({ updateSetting: vi.fn() }));
const guards = vi.hoisted(() => ({ requireWorkspace: vi.fn(), requireEntitlement: vi.fn() }));

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: routerRefresh }) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({ systemSettings: { updateSetting: deps.updateSetting } }),
}));
vi.mock('@/app-layer/guards/requireRole', () => ({
  requireDoctorWorkspaceContext: guards.requireWorkspace,
}));
vi.mock('@/app-layer/guards/doctorWorkspacePrincipal', () => ({
  withDoctorWorkspacePrincipal: (_scope: unknown, fn: () => unknown) => fn(),
}));
vi.mock('@/app-layer/guards/requireEntitlement', async () => {
  // The refusal has to be the real typed class: that class is exactly what makes the door keep the
  // authored sentence distinct instead of collapsing it, so a stand-in would test nothing.
  const { TypedApiResponseError } = await vi.importActual<
    typeof import('@/shared/http/apiResponse')
  >('@/shared/http/apiResponse');
  return {
    requireEntitlementForMutationAction: guards.requireEntitlement,
    entitlementMutationRefusalError: (action: string) =>
      new TypedApiResponseError({
        code: `Невозможно ${action}: этот раздел не входит в ваш тариф.`,
        status: 403,
      }),
  };
});

import { logger } from '@/infra/logging/logger';
import { PatientHomePracticeTargetPanel } from './PatientHomePracticeTargetPanel';

/** The exact shape S4 names: a rejected statement, its table and its SQLSTATE. */
const dbFailure = Object.assign(
  new Error(
    'insert into "be_patient_package_items" ("id","patient_package_id") values ($1,$2) - ' +
      'permission denied for table be_patient_package_items',
  ),
  { code: '42501' },
);

const INTERNAL_DETAIL = /insert into|be_patient_package_items|permission denied|42501|values/i;

beforeEach(() => {
  vi.clearAllMocks();
  guards.requireWorkspace.mockResolvedValue({
    session: { user: { userId: 'user-1' } },
    organizationId: 'org-1',
    membershipRole: 'owner',
  } as never);
  guards.requireEntitlement.mockResolvedValue({ ok: true } as never);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function saveTarget(): Promise<void> {
  render(<PatientHomePracticeTargetPanel initialTarget={3} />);
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
}

describe('patient-home settings — what a failed save leaves on the doctor screen', () => {
  it('shows the safe code with the reference the operator log was written under, and nothing internal', async () => {
    const operatorLog = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    deps.updateSetting.mockRejectedValue(dbFailure);

    await saveTarget();

    const alert = await screen.findByRole('alert');
    await waitFor(() => expect(operatorLog).toHaveBeenCalledTimes(1));
    const [payload] = operatorLog.mock.calls[0] as [
      { correlationId: string; operatorErrorDetail: unknown },
    ];

    expect(payload.operatorErrorDetail).toBe(dbFailure);
    expect(alert.textContent ?? '').not.toMatch(INTERNAL_DETAIL);
    expect(document.body.textContent ?? '').not.toMatch(INTERNAL_DETAIL);
    expect(alert.textContent).toContain('forbidden');
    expect(alert.textContent).toContain(`Код для поддержки: ${payload.correlationId}`);
  });

  it('keeps a named tariff refusal readable and offers no reference for it', async () => {
    const operatorLog = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    guards.requireEntitlement.mockResolvedValue({
      ok: false,
      reason: 'entitlement_required',
      mechanic: 'patient_home_today',
    } as never);

    await saveTarget();

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe(
      'Невозможно изменить настройки главной страницы пациента: этот раздел не входит в ваш тариф.',
    );
    expect(alert.textContent).not.toContain('Код для поддержки');
    expect(operatorLog).not.toHaveBeenCalled();
    expect(deps.updateSetting).not.toHaveBeenCalled();
  });
});

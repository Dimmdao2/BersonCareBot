import { describe, expect, it, vi } from 'vitest';
import {
  resolveActiveTreatmentProgramInstanceId,
  resolvePatientTreatmentProgramEntry,
  type PatientTreatmentProgramEntryDeps,
} from './patientTreatmentProgramEntry';

function promoDeps() {
  const ensureDefaultPromoProgramForPatient = vi.fn().mockResolvedValue({ id: 'promo-instance' });
  const deps = {
    treatmentProgramInstance: {
      listForPatient: vi.fn().mockResolvedValue([]),
      ensureDefaultPromoProgramForPatient,
    },
    treatmentProgram: {
      getTemplate: vi.fn().mockResolvedValue({ status: 'published' }),
    },
    systemSettings: {
      getPatientDefaultPromoTreatmentProgramTemplateId: vi.fn().mockResolvedValue('promo-template'),
    },
  } satisfies PatientTreatmentProgramEntryDeps;
  return { deps, ensureDefaultPromoProgramForPatient };
}

describe('promo materialization entitlement', () => {
  it('materializes promo for full access when no program exists', async () => {
    const full = promoDeps();

    await expect(
      resolvePatientTreatmentProgramEntry(
        full.deps,
        'patient',
        vi.fn().mockResolvedValue({ visible: true, canMaterialize: true }),
      ),
    ).resolves.toEqual({ kind: 'redirect', instanceId: 'promo-instance' });
    expect(full.ensureDefaultPromoProgramForPatient).toHaveBeenCalledWith({ patientUserId: 'patient' });
  });

  it('does not materialize promo from treatment, reminder or go entry when promo is off', async () => {
    const treatment = promoDeps();
    const active = promoDeps();
    const denied = vi.fn().mockResolvedValue({ visible: false, canMaterialize: false });

    const [entry, activeId] = await Promise.all([
      resolvePatientTreatmentProgramEntry(treatment.deps, 'patient', denied),
      resolveActiveTreatmentProgramInstanceId(active.deps, 'patient', denied),
    ]);

    expect(entry).toMatchObject({ kind: 'list', promoEnsureFailed: false });
    expect(activeId).toBeNull();
    expect(treatment.deps.treatmentProgram.getTemplate).not.toHaveBeenCalled();
    expect(active.deps.treatmentProgram.getTemplate).not.toHaveBeenCalled();
    expect(treatment.ensureDefaultPromoProgramForPatient).not.toHaveBeenCalled();
    expect(active.ensureDefaultPromoProgramForPatient).not.toHaveBeenCalled();
  });

  it('hides an already existing promo instance when promo is disabled', async () => {
    const existing = promoDeps();
    existing.deps.treatmentProgramInstance.listForPatient.mockResolvedValue([
      {
        id: 'existing-promo',
        patientUserId: 'patient',
        templateId: 'promo-template',
        assignedBy: null,
        assignmentSource: 'promo',
        title: 'Промо',
        status: 'active',
        createdAt: '2026-07-29T00:00:00.000Z',
        updatedAt: '2026-07-30T00:00:00.000Z',
        patientPlanLastOpenedAt: null,
      },
    ]);
    const denied = vi.fn().mockResolvedValue({ visible: false, canMaterialize: false });

    await expect(
      resolveActiveTreatmentProgramInstanceId(existing.deps, 'patient', denied),
    ).resolves.toBeNull();
    expect(denied).toHaveBeenCalledTimes(1);
    expect(existing.ensureDefaultPromoProgramForPatient).not.toHaveBeenCalled();
  });

  it('keeps an existing promo readable without materializing another one in read-only mode', async () => {
    const existing = promoDeps();
    existing.deps.treatmentProgramInstance.listForPatient.mockResolvedValue([
      {
        id: 'existing-promo',
        patientUserId: 'patient',
        templateId: 'promo-template',
        assignedBy: null,
        assignmentSource: 'promo',
        title: 'Промо',
        status: 'active',
        createdAt: '2026-07-29T00:00:00.000Z',
        updatedAt: '2026-07-30T00:00:00.000Z',
        patientPlanLastOpenedAt: null,
      },
    ]);

    await expect(
      resolveActiveTreatmentProgramInstanceId(
        existing.deps,
        'patient',
        vi.fn().mockResolvedValue({ visible: true, canMaterialize: false }),
      ),
    ).resolves.toBe('existing-promo');
    expect(existing.ensureDefaultPromoProgramForPatient).not.toHaveBeenCalled();
  });

  it('keeps an assigned program available while promo is disabled', async () => {
    const existing = promoDeps();
    existing.deps.treatmentProgramInstance.listForPatient.mockResolvedValue([
      {
        id: 'assigned-program',
        patientUserId: 'patient',
        templateId: 'assigned-template',
        assignedBy: 'doctor',
        assignmentSource: 'doctor',
        title: 'Назначенная программа',
        status: 'active',
        createdAt: '2026-07-29T00:00:00.000Z',
        updatedAt: '2026-07-30T00:00:00.000Z',
        patientPlanLastOpenedAt: null,
      },
    ]);

    await expect(
      resolveActiveTreatmentProgramInstanceId(
        existing.deps,
        'patient',
        vi.fn().mockResolvedValue({ visible: false, canMaterialize: false }),
      ),
    ).resolves.toBe('assigned-program');
    expect(existing.ensureDefaultPromoProgramForPatient).not.toHaveBeenCalled();
  });
});

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
  it('does not materialize promo from treatment, reminder or go entry when promo is off', async () => {
    const treatment = promoDeps();
    const active = promoDeps();
    const denied = vi.fn().mockResolvedValue(false);

    const [entry, activeId] = await Promise.all([
      resolvePatientTreatmentProgramEntry(treatment.deps, 'patient', denied),
      resolveActiveTreatmentProgramInstanceId(active.deps, 'patient', denied),
    ]);

    expect(entry).toMatchObject({ kind: 'list', promoEnsureFailed: false });
    expect(activeId).toBeNull();
    expect(treatment.ensureDefaultPromoProgramForPatient).not.toHaveBeenCalled();
    expect(active.ensureDefaultPromoProgramForPatient).not.toHaveBeenCalled();
  });

  it('keeps an already existing active promo instance readable when promo is off', async () => {
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
    const denied = vi.fn().mockResolvedValue(false);

    await expect(
      resolveActiveTreatmentProgramInstanceId(existing.deps, 'patient', denied),
    ).resolves.toBe('existing-promo');
    expect(denied).not.toHaveBeenCalled();
    expect(existing.ensureDefaultPromoProgramForPatient).not.toHaveBeenCalled();
  });
});

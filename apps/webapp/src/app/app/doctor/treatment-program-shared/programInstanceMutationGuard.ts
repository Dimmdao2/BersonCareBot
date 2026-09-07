import type { TreatmentProgramInstanceStatus } from '@/modules/treatment-program/types';
import type { PatientTerms } from '@/modules/system-settings/patientTerms';

/** Программа завершена — мутации структуры плана запрещены. */
export function isProgramInstanceEditLocked(status: TreatmentProgramInstanceStatus): boolean {
  return status === 'completed';
}

function activeBatchSavePrompt(terms: Pick<PatientTerms, 'patientGenitive'>): string {
  return `Применить изменения к активной программе лечения ${terms.patientGenitive}? Они отразятся в плане.`;
}

/** Структурные мутации (добавление, удаление, reorder): только lock при `completed`. */
export function isProgramInstanceStructuralMutationBlocked(
  status: TreatmentProgramInstanceStatus,
): boolean {
  return status === 'completed';
}

/**
 * @deprecated Используйте {@link runIfProgramInstanceStructuralMutationAllowed} или batch save.
 * Оставлено для совместимости: без confirm на каждый клик (фаза 3).
 */
export function requestProgramInstanceDataMutation(
  status: TreatmentProgramInstanceStatus,
): boolean {
  return !isProgramInstanceStructuralMutationBlocked(status);
}

/** Одно подтверждение перед сохранением черновика активной программы. */
export function confirmActiveProgramInstanceBatchSave(
  status: TreatmentProgramInstanceStatus,
  terms: Pick<PatientTerms, 'patientGenitive'>,
): boolean {
  if (status === 'completed') return false;
  if (status === 'active') {
    return (
      typeof globalThis !== 'undefined' && globalThis.confirm?.(activeBatchSavePrompt(terms)) === true
    );
  }
  return true;
}

/** Структурные async-мутации без confirm на каждый клик. */
export async function runIfProgramInstanceStructuralMutationAllowed(
  status: TreatmentProgramInstanceStatus,
  action: () => Promise<void>,
): Promise<boolean> {
  if (isProgramInstanceStructuralMutationBlocked(status)) return false;
  await action();
  return true;
}

/**
 * @deprecated Алиас {@link runIfProgramInstanceStructuralMutationAllowed} (фаза 3: без confirm на клик).
 */
export async function runIfProgramInstanceMutationAllowed(
  status: TreatmentProgramInstanceStatus,
  action: () => Promise<void>,
): Promise<boolean> {
  return runIfProgramInstanceStructuralMutationAllowed(status, action);
}

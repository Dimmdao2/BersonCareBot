import type { TreatmentProgramInstanceStatus } from "@/modules/treatment-program/types";

/** Программа завершена — мутации структуры плана запрещены. */
export function isProgramInstanceEditLocked(status: TreatmentProgramInstanceStatus): boolean {
  return status === "completed";
}

const ACTIVE_DATA_MUTATION_PROMPT =
  "Применить изменение к активной программе лечения пациента? Оно отразится в плане.";

/**
 * Перед каждой мутацией данных инстанса (этап / группа / элемент / тест).
 * Для `completed` — отказ; для `active` — подтверждение в браузере.
 */
export function requestProgramInstanceDataMutation(status: TreatmentProgramInstanceStatus): boolean {
  if (status === "completed") return false;
  if (status === "active") {
    return typeof globalThis !== "undefined" && globalThis.confirm?.(ACTIVE_DATA_MUTATION_PROMPT) === true;
  }
  return true;
}

/**
 * Единая точка для async-мутаций: при отказе guard действие не выполняется.
 * Для `completed` — немедленный выход; для `active` — тот же confirm, что и у {@link requestProgramInstanceDataMutation}.
 */
export async function runIfProgramInstanceMutationAllowed(
  status: TreatmentProgramInstanceStatus,
  action: () => Promise<void>,
): Promise<boolean> {
  if (!requestProgramInstanceDataMutation(status)) return false;
  await action();
  return true;
}

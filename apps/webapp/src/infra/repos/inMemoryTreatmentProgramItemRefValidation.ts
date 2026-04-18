import type { TreatmentProgramItemRefValidationPort } from "@/modules/treatment-program/ports";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Vitest / режим без БД: только форма UUID (полная проверка по библиотекам — через PG-порт).
 */
export function createInMemoryTreatmentProgramItemRefValidationPort(): TreatmentProgramItemRefValidationPort {
  return {
    async assertItemRefExists(_type, itemRefId): Promise<void> {
      const id = itemRefId.trim();
      if (!UUID_RE.test(id)) throw new Error("Некорректный UUID");
    },
  };
}

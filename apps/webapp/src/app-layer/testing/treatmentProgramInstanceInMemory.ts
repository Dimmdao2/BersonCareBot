/**
 * Фикстуры Vitest: экземпляр программы (фаза 4). Без импорта `@/infra/repos/*` из модулей.
 */
export {
  createInMemoryTreatmentProgramInstancePort,
  createInMemoryTreatmentProgramPersistence,
} from "@/infra/repos/inMemoryTreatmentProgramInstance";
export { createInMemoryTreatmentProgramItemSnapshotPort } from "@/infra/repos/inMemoryTreatmentProgramItemSnapshot";

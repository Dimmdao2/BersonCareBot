/**
 * Фикстуры Vitest: шаблон программы лечения (фаза 3).
 * Реэкспорт из infra, чтобы тесты в `modules/treatment-program` не импортировали `@/infra/repos/*`.
 */
export {
  clearInMemoryTreatmentProgramTemplateUsageSnapshots,
  createInMemoryTreatmentProgramPort,
  seedInMemoryTreatmentProgramTemplateUsageSnapshot,
} from "@/infra/repos/inMemoryTreatmentProgram";

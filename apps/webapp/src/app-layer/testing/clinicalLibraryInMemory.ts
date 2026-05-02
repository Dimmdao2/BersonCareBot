/**
 * Фикстуры для Vitest: библиотека блоков программ лечения (фаза 2).
 * Реэкспорт из infra, чтобы тесты в modules не импортировали `@/infra/repos/*` напрямую
 * (готовность к возможному расширению ESLint на тесты под `modules/`).
 */
export {
  inMemoryClinicalTestsPort,
  resetInMemoryClinicalTestsStore,
  seedInMemoryClinicalTestUsageSnapshot,
} from "@/infra/repos/inMemoryClinicalTests";
export {
  inMemoryTestSetsPort,
  resetInMemoryTestSetsStore,
  seedInMemoryTestSetUsageSnapshot,
} from "@/infra/repos/inMemoryTestSets";
export {
  inMemoryRecommendationsPort,
  resetInMemoryRecommendationsStore,
  seedInMemoryRecommendationUsageSnapshot,
} from "@/infra/repos/inMemoryRecommendations";

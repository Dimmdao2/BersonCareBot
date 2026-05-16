import type {
  CreateExerciseInput,
  Exercise,
  ExerciseFilter,
  ExerciseUsageSnapshot,
  UpdateExerciseInput,
} from "./types";

export type LfkExercisesPort = {
  list(filter: ExerciseFilter): Promise<Exercise[]>;
  /** Заголовки по id (один запрос к БД в PG-реализации). */
  listTitlesByIds(ids: readonly string[]): Promise<Map<string, string>>;
  getById(id: string): Promise<Exercise | null>;
  create(input: CreateExerciseInput, createdBy: string | null): Promise<Exercise>;
  update(id: string, input: UpdateExerciseInput): Promise<Exercise | null>;
  archive(id: string): Promise<boolean>;
  unarchive(id: string): Promise<boolean>;
  getExerciseUsageSummary(id: string): Promise<ExerciseUsageSnapshot>;
};

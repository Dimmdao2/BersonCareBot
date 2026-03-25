import type {
  CreateExerciseInput,
  Exercise,
  ExerciseFilter,
  UpdateExerciseInput,
} from "./types";

export type LfkExercisesPort = {
  list(filter: ExerciseFilter): Promise<Exercise[]>;
  getById(id: string): Promise<Exercise | null>;
  create(input: CreateExerciseInput, createdBy: string | null): Promise<Exercise>;
  update(id: string, input: UpdateExerciseInput): Promise<Exercise | null>;
  archive(id: string): Promise<boolean>;
};

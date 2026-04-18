import type {
  ClinicalTest,
  ClinicalTestFilter,
  CreateClinicalTestInput,
  TestSet,
  TestSetFilter,
  CreateTestSetInput,
  UpdateClinicalTestInput,
  UpdateTestSetInput,
  TestSetItemInput,
} from "./types";

export type ClinicalTestsPort = {
  list(filter: ClinicalTestFilter): Promise<ClinicalTest[]>;
  getById(id: string): Promise<ClinicalTest | null>;
  create(input: CreateClinicalTestInput, createdBy: string | null): Promise<ClinicalTest>;
  update(id: string, input: UpdateClinicalTestInput): Promise<ClinicalTest | null>;
  archive(id: string): Promise<boolean>;
};

export type TestSetsPort = {
  list(filter: TestSetFilter): Promise<TestSet[]>;
  getById(id: string): Promise<TestSet | null>;
  create(input: CreateTestSetInput, createdBy: string | null): Promise<TestSet>;
  update(id: string, input: UpdateTestSetInput): Promise<TestSet | null>;
  archive(id: string): Promise<boolean>;
  replaceItems(testSetId: string, items: TestSetItemInput[]): Promise<void>;
};

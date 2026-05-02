import type {
  ClinicalTest,
  ClinicalTestFilter,
  ClinicalTestUsageSnapshot,
  CreateClinicalTestInput,
  CreateTestSetInput,
  TestSet,
  TestSetFilter,
  TestSetItemInput,
  TestSetUsageSnapshot,
  UpdateClinicalTestInput,
  UpdateTestSetInput,
} from "./types";

export type ClinicalTestsPort = {
  list(filter: ClinicalTestFilter): Promise<ClinicalTest[]>;
  getById(id: string): Promise<ClinicalTest | null>;
  create(input: CreateClinicalTestInput, createdBy: string | null): Promise<ClinicalTest>;
  update(id: string, input: UpdateClinicalTestInput): Promise<ClinicalTest | null>;
  archive(id: string): Promise<boolean>;
  unarchive(id: string): Promise<boolean>;
  getClinicalTestUsageSummary(id: string): Promise<ClinicalTestUsageSnapshot>;
};

export type TestSetsPort = {
  list(filter: TestSetFilter): Promise<TestSet[]>;
  getById(id: string): Promise<TestSet | null>;
  create(input: CreateTestSetInput, createdBy: string | null): Promise<TestSet>;
  update(id: string, input: UpdateTestSetInput): Promise<TestSet | null>;
  archive(id: string): Promise<boolean>;
  unarchive(id: string): Promise<boolean>;
  replaceItems(testSetId: string, items: TestSetItemInput[]): Promise<void>;
  getTestSetUsageSummary(id: string): Promise<TestSetUsageSnapshot>;
};

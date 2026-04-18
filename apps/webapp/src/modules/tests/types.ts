/** Медиа-блок в JSON (как снимок для stage_item по SYSTEM_LOGIC_SCHEMA §4). */
export type ClinicalTestMediaItem = {
  mediaUrl: string;
  mediaType: "image" | "video" | "gif";
  sortOrder: number;
};

export type ClinicalTest = {
  id: string;
  title: string;
  description: string | null;
  testType: string | null;
  scoringConfig: unknown | null;
  media: ClinicalTestMediaItem[];
  tags: string[] | null;
  isArchived: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ClinicalTestFilter = {
  includeArchived?: boolean;
  search?: string | null;
  testType?: string | null;
};

export type CreateClinicalTestInput = {
  title: string;
  description?: string | null;
  testType?: string | null;
  scoringConfig?: unknown | null;
  media?: ClinicalTestMediaItem[];
  tags?: string[] | null;
};

export type UpdateClinicalTestInput = {
  title?: string;
  description?: string | null;
  testType?: string | null;
  scoringConfig?: unknown | null;
  media?: ClinicalTestMediaItem[] | null;
  tags?: string[] | null;
};

export type TestSet = {
  id: string;
  title: string;
  description: string | null;
  isArchived: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  items: TestSetItemWithTest[];
};

export type TestSetItemWithTest = {
  id: string;
  testSetId: string;
  testId: string;
  sortOrder: number;
  test: Pick<ClinicalTest, "id" | "title" | "testType" | "isArchived">;
};

export type TestSetFilter = {
  includeArchived?: boolean;
  search?: string | null;
};

export type CreateTestSetInput = {
  title: string;
  description?: string | null;
};

export type UpdateTestSetInput = {
  title?: string;
  description?: string | null;
};

export type TestSetItemInput = {
  testId: string;
  sortOrder: number;
};

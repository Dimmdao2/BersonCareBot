import type { PatientHomeBlockItemTargetType, PatientHomeCmsBlockCode } from "@/modules/patient-home/blocks";

export type PatientHomeBlockRecord = {
  id: string;
  code: PatientHomeCmsBlockCode;
  isVisible: boolean;
  sortOrder: number;
};

export type PatientHomeBlockItemRecord = {
  id: string;
  blockId: string;
  sortOrder: number;
  isVisible: boolean;
  targetType: PatientHomeBlockItemTargetType;
  targetRef: string;
};

export type PatientHomeBlocksPort = {
  listCmsBlocksWithItems: () => Promise<Array<{ block: PatientHomeBlockRecord; items: PatientHomeBlockItemRecord[] }>>;
  setBlockVisibleByCode: (code: PatientHomeCmsBlockCode, isVisible: boolean) => Promise<void>;
  setItemVisible: (itemId: string, isVisible: boolean) => Promise<void>;
  deleteItem: (itemId: string) => Promise<void>;
  reorderItemsInBlock: (blockCode: PatientHomeCmsBlockCode, orderedItemIds: string[]) => Promise<void>;
  insertItem: (
    blockCode: PatientHomeCmsBlockCode,
    input: { targetType: PatientHomeBlockItemTargetType; targetRef: string },
  ) => Promise<string>;
  findItemWithBlockCode: (itemId: string) => Promise<(PatientHomeBlockItemRecord & { blockCode: PatientHomeCmsBlockCode }) | null>;
};

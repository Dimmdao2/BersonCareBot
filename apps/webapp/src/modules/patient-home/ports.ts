export type PatientHomeBlockCode =
  | "daily_warmup"
  | "booking"
  | "situations"
  | "progress"
  | "next_reminder"
  | "mood_checkin"
  | "sos"
  | "plan"
  | "subscription_carousel"
  | "courses";

export type PatientHomeBlockItemTargetType =
  | "content_page"
  | "content_section"
  | "course"
  | "static_action";

export type PatientHomeBlockItem = {
  id: string;
  blockCode: PatientHomeBlockCode;
  targetType: PatientHomeBlockItemTargetType;
  targetRef: string;
  titleOverride: string | null;
  subtitleOverride: string | null;
  imageUrlOverride: string | null;
  badgeLabel: string | null;
  isVisible: boolean;
  sortOrder: number;
};

export type PatientHomeBlock = {
  code: PatientHomeBlockCode;
  title: string;
  description: string;
  isVisible: boolean;
  sortOrder: number;
  /** CMS media URL for the block leading icon; `null` uses the built-in Lucide fallback. */
  iconImageUrl: string | null;
  items: PatientHomeBlockItem[];
};

export type PatientHomeBlockItemAddInput = {
  blockCode: PatientHomeBlockCode;
  targetType: PatientHomeBlockItemTargetType;
  targetRef: string;
  titleOverride?: string | null;
  subtitleOverride?: string | null;
  imageUrlOverride?: string | null;
  badgeLabel?: string | null;
  isVisible?: boolean;
  sortOrder?: number;
};

export type PatientHomeBlockItemPatch = Partial<
  Pick<
    PatientHomeBlockItem,
    | "titleOverride"
    | "subtitleOverride"
    | "imageUrlOverride"
    | "badgeLabel"
    | "isVisible"
    | "sortOrder"
    | "targetRef"
    | "targetType"
  >
>;

export type PatientHomeBlocksPort = {
  listBlocksWithItems(): Promise<PatientHomeBlock[]>;
  setBlockVisibility(code: PatientHomeBlockCode, visible: boolean): Promise<void>;
  setBlockIcon(code: PatientHomeBlockCode, iconImageUrl: string | null): Promise<void>;
  reorderBlocks(orderedCodes: PatientHomeBlockCode[]): Promise<void>;
  addItem(input: PatientHomeBlockItemAddInput): Promise<string>;
  getItemById(id: string): Promise<PatientHomeBlockItem | null>;
  updateItem(id: string, patch: PatientHomeBlockItemPatch): Promise<void>;
  deleteItem(id: string): Promise<void>;
  reorderItems(blockCode: PatientHomeBlockCode, orderedItemIds: string[]): Promise<void>;
};

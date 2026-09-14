export const HUMAN_MERGE_FIO_FIELDS = ['last_name', 'first_name', 'patronymic'] as const;

export type HumanMergeFioField = (typeof HUMAN_MERGE_FIO_FIELDS)[number];

export type HumanMergeFioSelection =
  | { source: 'target' }
  | { source: 'duplicate' }
  | { source: 'custom'; value: string };

/**
 * The only authorization accepted by an automatic patient-account merge.
 * IDs bind the answer to the exact pair loaded under FOR UPDATE; omitted FIO fields are legal only
 * when the locked rows do not conflict for that field.
 */
export type HumanMergeDecision = {
  accountConfirmed: true;
  targetId: string;
  duplicateId: string;
  recognizedAccountId: string;
  fio: Partial<Record<HumanMergeFioField, HumanMergeFioSelection>>;
};

export type HumanMergeAccountSummary = {
  id: string;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  patronymic: string | null;
  createdAt: string;
};

export type HumanMergePrompt = {
  target: HumanMergeAccountSummary;
  duplicate: HumanMergeAccountSummary;
  foundAccountId: string;
  conflicts: HumanMergeFioField[];
};

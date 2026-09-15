export const HUMAN_MERGE_FIO_FIELDS = [
  'display_name',
  'last_name',
  'first_name',
  'patronymic',
] as const;

export type HumanMergeFioField = (typeof HUMAN_MERGE_FIO_FIELDS)[number];

declare const humanMergeCustomFioValueBrand: unique symbol;

export type HumanMergeCustomFioValue = string & {
  readonly [humanMergeCustomFioValueBrand]: true;
};

export type HumanMergeFioSelection =
  | { source: 'target' }
  | { source: 'duplicate' }
  | { source: 'custom'; value: HumanMergeCustomFioValue };

export type HumanMergeFioSelections = Partial<Record<HumanMergeFioField, HumanMergeFioSelection>>;

/**
 * The only authorization accepted by an automatic patient-account merge.
 * The prompt snapshot binds the answer to exactly what the person saw. Omitted FIO fields are legal
 * only when that snapshot and the rows locked for merge have no conflict for the field.
 */
export type HumanMergeDecision = {
  accountConfirmed: true;
  prompt: HumanMergePrompt;
  fio: HumanMergeFioSelections;
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

type HumanMergeAccountSummaryInput = Omit<HumanMergeAccountSummary, 'createdAt'> & {
  createdAt: string | Date;
};

function normalizedPart(value: string | null): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed || null;
}

export function isHumanMergeCustomFioValue(value: string): value is HumanMergeCustomFioValue {
  return value.trim().length > 0 && !/[A-Za-z]/.test(value);
}

export function createHumanMergeCustomFioValue(value: string): HumanMergeCustomFioValue {
  const normalized = value.trim();
  if (!isHumanMergeCustomFioValue(normalized)) {
    throw new Error('merge: custom FIO must be non-empty and contain no Latin letters');
  }
  return normalized;
}

export function createHumanMergePrompt(
  target: HumanMergeAccountSummaryInput,
  duplicate: HumanMergeAccountSummaryInput,
  foundAccountId: string,
): HumanMergePrompt {
  const structuredFields = HUMAN_MERGE_FIO_FIELDS.filter(
    (field): field is Exclude<HumanMergeFioField, 'display_name'> => field !== 'display_name',
  );
  const structuredConflicts = structuredFields.filter((field) => {
    const targetValue =
      field === 'last_name'
        ? target.lastName
        : field === 'first_name'
          ? target.firstName
          : target.patronymic;
    const duplicateValue =
      field === 'last_name'
        ? duplicate.lastName
        : field === 'first_name'
          ? duplicate.firstName
          : duplicate.patronymic;
    const left = normalizedPart(targetValue);
    const right = normalizedPart(duplicateValue);
    return left !== null && right !== null && left !== right;
  });
  const targetHasStructuredFio = structuredFields.some((field) =>
    normalizedPart(
      field === 'last_name'
        ? target.lastName
        : field === 'first_name'
          ? target.firstName
          : target.patronymic,
    ),
  );
  const duplicateHasStructuredFio = structuredFields.some((field) =>
    normalizedPart(
      field === 'last_name'
        ? duplicate.lastName
        : field === 'first_name'
          ? duplicate.firstName
          : duplicate.patronymic,
    ),
  );
  const targetDisplayName = normalizedPart(target.displayName);
  const duplicateDisplayName = normalizedPart(duplicate.displayName);
  const displayNameConflict =
    (!targetHasStructuredFio || !duplicateHasStructuredFio) &&
    targetDisplayName !== null &&
    duplicateDisplayName !== null &&
    targetDisplayName !== duplicateDisplayName;
  const conflicts: HumanMergeFioField[] = displayNameConflict
    ? ['display_name']
    : structuredConflicts;
  return {
    target: { ...target, createdAt: new Date(target.createdAt).toISOString() },
    duplicate: { ...duplicate, createdAt: new Date(duplicate.createdAt).toISOString() },
    foundAccountId,
    conflicts,
  };
}

function accountSummaryMatches(
  left: HumanMergeAccountSummary,
  right: HumanMergeAccountSummary,
): boolean {
  return (
    left.id === right.id &&
    left.displayName === right.displayName &&
    left.firstName === right.firstName &&
    left.lastName === right.lastName &&
    left.patronymic === right.patronymic &&
    left.createdAt === right.createdAt
  );
}

export function humanMergeDecisionMatchesPrompt(
  decision: HumanMergeDecision,
  prompt: HumanMergePrompt,
): boolean {
  return (
    decision.accountConfirmed &&
    decision.prompt.foundAccountId === prompt.foundAccountId &&
    accountSummaryMatches(decision.prompt.target, prompt.target) &&
    accountSummaryMatches(decision.prompt.duplicate, prompt.duplicate) &&
    decision.prompt.conflicts.length === prompt.conflicts.length &&
    decision.prompt.conflicts.every((field, index) => field === prompt.conflicts[index])
  );
}

export function createHumanMergeDecision(
  prompt: HumanMergePrompt,
  fio: HumanMergeFioSelections,
): HumanMergeDecision {
  return { accountConfirmed: true, prompt, fio };
}

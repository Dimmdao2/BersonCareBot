export const HUMAN_MERGE_FIO_FIELDS = [
  'display_name',
  'last_name',
  'first_name',
  'patronymic',
] as const;

export type HumanMergeFioField = (typeof HUMAN_MERGE_FIO_FIELDS)[number];

/** Разобранные части ФИО — всё, кроме сводной подписи `display_name`. */
export type HumanMergeStructuredFioField = Exclude<HumanMergeFioField, 'display_name'>;

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

/** Разобранная часть ФИО учётки по имени поля — один разбор вместо трёх вложенных тернарников. */
function structuredFioValue(
  account: Pick<HumanMergeAccountSummary, 'firstName' | 'lastName' | 'patronymic'>,
  field: HumanMergeStructuredFioField,
): string | null {
  return field === 'last_name'
    ? account.lastName
    : field === 'first_name'
      ? account.firstName
      : account.patronymic;
}

export function createHumanMergePrompt(
  target: HumanMergeAccountSummaryInput,
  duplicate: HumanMergeAccountSummaryInput,
  foundAccountId: string,
): HumanMergePrompt {
  const structuredFields = HUMAN_MERGE_FIO_FIELDS.filter(
    (field): field is HumanMergeStructuredFioField => field !== 'display_name',
  );
  const structuredConflicts = structuredFields.filter((field) => {
    const left = normalizedPart(structuredFioValue(target, field));
    const right = normalizedPart(structuredFioValue(duplicate, field));
    return left !== null && right !== null && left !== right;
  });
  const targetHasStructuredFio = structuredFields.some((field) =>
    normalizedPart(structuredFioValue(target, field)),
  );
  const duplicateHasStructuredFio = structuredFields.some((field) =>
    normalizedPart(structuredFioValue(duplicate, field)),
  );
  const targetDisplayName = normalizedPart(target.displayName);
  const duplicateDisplayName = normalizedPart(duplicate.displayName);
  const displayNameConflict =
    (!targetHasStructuredFio || !duplicateHasStructuredFio) &&
    targetDisplayName !== null &&
    duplicateDisplayName !== null &&
    targetDisplayName !== duplicateDisplayName;
  /**
   * §18а: выбранный человеком display-вариант может расходиться с разобранными частями второй
   * стороны — это тоже конфликт, и решает его человек. Поэтому каждая часть, которая есть ровно у
   * одной стороны, получает в диалоге свой вопрос: иначе выбор подписи молча стёр бы фамилию и имя
   * (или молча сохранил бы их вопреки выбору), а врач читал бы из `user_identity` не то, что выбрали.
   */
  const displayNameSideFields = structuredFields.filter((field) => {
    const left = normalizedPart(structuredFioValue(target, field));
    const right = normalizedPart(structuredFioValue(duplicate, field));
    return (left === null) !== (right === null);
  });
  const conflicts: HumanMergeFioField[] = displayNameConflict
    ? ['display_name', ...displayNameSideFields]
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

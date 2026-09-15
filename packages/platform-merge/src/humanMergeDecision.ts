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

/**
 * В какую сторону сливать пару, за которой стоит ответ человека (§18а).
 *
 * Строка конфликта хранит пару в поряде полей `anchor`/`candidate`, и этот порядок задаёт не
 * продукт, а уникальность: легаси-индекс ordered-пары может быть занят чужой строкой, и тогда
 * медицинская строка ложится наоборот. Ответ человека, наоборот, привязан к паре ровно в том
 * порядке, в каком человек её видел, — «целевая» и «дубль» в его выборе означают конкретные
 * учётки. Поэтому порядок берётся из ответа, когда ответ описывает ту же пару; иначе остаётся
 * порядок строки, и негодный ответ гасится дальше по пути обычным отказом.
 */
export function mergeOrientationForStoredDecision(
  row: { readonly anchorUserId: string; readonly candidateUserId: string },
  decision: HumanMergeDecision | null | undefined,
): { targetId: string; duplicateId: string } {
  const fromRow = { targetId: row.anchorUserId, duplicateId: row.candidateUserId };
  if (!decision) return fromRow;
  const shown = [decision.prompt.target.id, decision.prompt.duplicate.id].sort();
  const stored = [row.anchorUserId, row.candidateUserId].sort();
  if (shown[0] !== stored[0] || shown[1] !== stored[1]) return fromRow;
  return { targetId: decision.prompt.target.id, duplicateId: decision.prompt.duplicate.id };
}

function readAccountSummary(value: unknown): HumanMergeAccountSummary | null {
  if (typeof value !== 'object' || value === null) return null;
  const row = value as Record<string, unknown>;
  const text = (key: string): string | null | undefined =>
    row[key] === null ? null : typeof row[key] === 'string' ? (row[key] as string) : undefined;
  const id = text('id');
  const displayName = text('displayName');
  const createdAt = text('createdAt');
  const firstName = text('firstName');
  const lastName = text('lastName');
  const patronymic = text('patronymic');
  if (!id || displayName === undefined || displayName === null) return null;
  if (!createdAt) return null;
  if (firstName === undefined || lastName === undefined || patronymic === undefined) return null;
  return { id, displayName, firstName, lastName, patronymic, createdAt };
}

function readFioSelection(value: unknown): HumanMergeFioSelection | null {
  if (typeof value !== 'object' || value === null) return null;
  const row = value as Record<string, unknown>;
  if (row.source === 'target' || row.source === 'duplicate') return { source: row.source };
  if (row.source !== 'custom' || typeof row.value !== 'string') return null;
  const custom = row.value.trim();
  if (!isHumanMergeCustomFioValue(custom)) return null;
  return { source: 'custom', value: custom };
}

/**
 * Ответ человека, пролежавший в строке конфликта между его диалогом и решением врача (§18а + §18б).
 *
 * Разбирается здесь, рядом с определением формы, а не у читающего: хранилище отдаёт `unknown`, и
 * единственная защита от «поле переименовали, а старые строки остались» — отказ разбора. Негодная
 * запись становится `null`, и дверь врача отказывает вместо того, чтобы слить с чужой подписью.
 */
export function parseStoredHumanMergeDecision(value: unknown): HumanMergeDecision | null {
  if (typeof value !== 'object' || value === null) return null;
  const row = value as Record<string, unknown>;
  if (row.accountConfirmed !== true) return null;
  if (typeof row.prompt !== 'object' || row.prompt === null) return null;
  const prompt = row.prompt as Record<string, unknown>;
  const target = readAccountSummary(prompt.target);
  const duplicate = readAccountSummary(prompt.duplicate);
  if (!target || !duplicate) return null;
  if (typeof prompt.foundAccountId !== 'string' || !prompt.foundAccountId) return null;
  if (!Array.isArray(prompt.conflicts)) return null;
  const conflicts: HumanMergeFioField[] = [];
  for (const field of prompt.conflicts) {
    if (!HUMAN_MERGE_FIO_FIELDS.includes(field as HumanMergeFioField)) return null;
    conflicts.push(field as HumanMergeFioField);
  }
  const fio: HumanMergeFioSelections = {};
  const storedFio = typeof row.fio === 'object' && row.fio !== null ? row.fio : {};
  for (const [key, raw] of Object.entries(storedFio as Record<string, unknown>)) {
    if (!HUMAN_MERGE_FIO_FIELDS.includes(key as HumanMergeFioField)) return null;
    const selection = readFioSelection(raw);
    if (!selection) return null;
    fio[key as HumanMergeFioField] = selection;
  }
  return {
    accountConfirmed: true,
    prompt: { target, duplicate, foundAccountId: prompt.foundAccountId, conflicts },
    fio,
  };
}

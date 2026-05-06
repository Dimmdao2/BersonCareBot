import type { TreatmentProgramTemplateUsageSnapshot } from "./types";

export const USAGE_CONFIRMATION_REQUIRED = "USAGE_CONFIRMATION_REQUIRED" as const;

/** Конфликт при копировании описания комплекса в группу с уже заполненным описанием (POST expand из ЛФК). */
export const GROUP_DESCRIPTION_CONFLICT = "group_description_conflict" as const;

export class TreatmentProgramTemplateUsageConfirmationRequiredError extends Error {
  readonly code = USAGE_CONFIRMATION_REQUIRED;

  constructor(readonly usage: TreatmentProgramTemplateUsageSnapshot) {
    super(USAGE_CONFIRMATION_REQUIRED);
    this.name = "TreatmentProgramTemplateUsageConfirmationRequiredError";
  }
}

export function isTreatmentProgramTemplateUsageConfirmationRequiredError(
  e: unknown,
): e is TreatmentProgramTemplateUsageConfirmationRequiredError {
  return e instanceof TreatmentProgramTemplateUsageConfirmationRequiredError;
}

export class TreatmentProgramTemplateArchiveNotFoundError extends Error {
  constructor(message = "Шаблон программы не найден") {
    super(message);
    this.name = "TreatmentProgramTemplateArchiveNotFoundError";
  }
}

export function isTreatmentProgramTemplateArchiveNotFoundError(
  e: unknown,
): e is TreatmentProgramTemplateArchiveNotFoundError {
  return e instanceof TreatmentProgramTemplateArchiveNotFoundError;
}

export class TreatmentProgramTemplateAlreadyArchivedError extends Error {
  constructor() {
    super("Шаблон уже в архиве");
    this.name = "TreatmentProgramTemplateAlreadyArchivedError";
  }
}

export function isTreatmentProgramTemplateAlreadyArchivedError(
  e: unknown,
): e is TreatmentProgramTemplateAlreadyArchivedError {
  return e instanceof TreatmentProgramTemplateAlreadyArchivedError;
}

export class TreatmentProgramTemplateGroupDescriptionConflictError extends Error {
  readonly code = GROUP_DESCRIPTION_CONFLICT;

  constructor(
    message = "У группы уже есть описание. Снимите галочку или очистите описание группы, чтобы скопировать текст из комплекса.",
  ) {
    super(message);
    this.name = "TreatmentProgramTemplateGroupDescriptionConflictError";
  }
}

export function isTreatmentProgramTemplateGroupDescriptionConflictError(
  e: unknown,
): e is TreatmentProgramTemplateGroupDescriptionConflictError {
  return e instanceof TreatmentProgramTemplateGroupDescriptionConflictError;
}

/**
 * Ресурс не найден или не принадлежит контексту запроса (развёртывание комплекса ЛФК в шаблон программы).
 * Маршрут `POST .../items/from-lfk-complex` отвечает **404**.
 */
export class TreatmentProgramExpandNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TreatmentProgramExpandNotFoundError";
  }
}

export function isTreatmentProgramExpandNotFoundError(
  e: unknown,
): e is TreatmentProgramExpandNotFoundError {
  return e instanceof TreatmentProgramExpandNotFoundError;
}

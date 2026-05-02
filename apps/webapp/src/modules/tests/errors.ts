import type { ClinicalTestUsageSnapshot, TestSetUsageSnapshot } from "./types";

export const USAGE_CONFIRMATION_REQUIRED = "USAGE_CONFIRMATION_REQUIRED" as const;

export class ClinicalTestUsageConfirmationRequiredError extends Error {
  readonly code = USAGE_CONFIRMATION_REQUIRED;

  constructor(readonly usage: ClinicalTestUsageSnapshot) {
    super(USAGE_CONFIRMATION_REQUIRED);
    this.name = "ClinicalTestUsageConfirmationRequiredError";
  }
}

export function isClinicalTestUsageConfirmationRequiredError(
  e: unknown,
): e is ClinicalTestUsageConfirmationRequiredError {
  return e instanceof ClinicalTestUsageConfirmationRequiredError;
}

export class ClinicalTestArchiveNotFoundError extends Error {
  constructor(message = "Тест не найден") {
    super(message);
    this.name = "ClinicalTestArchiveNotFoundError";
  }
}

export function isClinicalTestArchiveNotFoundError(e: unknown): e is ClinicalTestArchiveNotFoundError {
  return e instanceof ClinicalTestArchiveNotFoundError;
}

export class ClinicalTestArchiveAlreadyArchivedError extends Error {
  constructor() {
    super("Тест уже в архиве");
    this.name = "ClinicalTestArchiveAlreadyArchivedError";
  }
}

export function isClinicalTestArchiveAlreadyArchivedError(e: unknown): e is ClinicalTestArchiveAlreadyArchivedError {
  return e instanceof ClinicalTestArchiveAlreadyArchivedError;
}

export class ClinicalTestUnarchiveNotArchivedError extends Error {
  constructor() {
    super("Тест не в архиве");
    this.name = "ClinicalTestUnarchiveNotArchivedError";
  }
}

export function isClinicalTestUnarchiveNotArchivedError(e: unknown): e is ClinicalTestUnarchiveNotArchivedError {
  return e instanceof ClinicalTestUnarchiveNotArchivedError;
}

export class TestSetUsageConfirmationRequiredError extends Error {
  readonly code = USAGE_CONFIRMATION_REQUIRED;

  constructor(readonly usage: TestSetUsageSnapshot) {
    super(USAGE_CONFIRMATION_REQUIRED);
    this.name = "TestSetUsageConfirmationRequiredError";
  }
}

export function isTestSetUsageConfirmationRequiredError(e: unknown): e is TestSetUsageConfirmationRequiredError {
  return e instanceof TestSetUsageConfirmationRequiredError;
}

export class TestSetArchiveNotFoundError extends Error {
  constructor(message = "Набор не найден") {
    super(message);
    this.name = "TestSetArchiveNotFoundError";
  }
}

export function isTestSetArchiveNotFoundError(e: unknown): e is TestSetArchiveNotFoundError {
  return e instanceof TestSetArchiveNotFoundError;
}

export class TestSetArchiveAlreadyArchivedError extends Error {
  constructor() {
    super("Набор уже в архиве");
    this.name = "TestSetArchiveAlreadyArchivedError";
  }
}

export function isTestSetArchiveAlreadyArchivedError(e: unknown): e is TestSetArchiveAlreadyArchivedError {
  return e instanceof TestSetArchiveAlreadyArchivedError;
}

export class TestSetUnarchiveNotArchivedError extends Error {
  constructor() {
    super("Набор не в архиве");
    this.name = "TestSetUnarchiveNotArchivedError";
  }
}

export function isTestSetUnarchiveNotArchivedError(e: unknown): e is TestSetUnarchiveNotArchivedError {
  return e instanceof TestSetUnarchiveNotArchivedError;
}

export const ORGANIZATION_NAME_MAX_LENGTH = 100;

export const ORGANIZATION_NAME_TOO_LONG_CODE = 'organization_name_too_long';
export const ORGANIZATION_NAME_TOO_LONG_MESSAGE = `Название клиники не должно быть длиннее ${ORGANIZATION_NAME_MAX_LENGTH} знаков.`;

export type OrganizationNameValidationResult =
  | { ok: true; value: string }
  | {
      ok: false;
      code: typeof ORGANIZATION_NAME_TOO_LONG_CODE;
      message: typeof ORGANIZATION_NAME_TOO_LONG_MESSAGE;
    };

/** Normalizes a clinic name at a user-input boundary without ever shortening it. */
export function validateOrganizationName(value: string): OrganizationNameValidationResult {
  const normalized = value.trim();
  if (normalized.length > ORGANIZATION_NAME_MAX_LENGTH) {
    return {
      ok: false,
      code: ORGANIZATION_NAME_TOO_LONG_CODE,
      message: ORGANIZATION_NAME_TOO_LONG_MESSAGE,
    };
  }
  return { ok: true, value: normalized };
}

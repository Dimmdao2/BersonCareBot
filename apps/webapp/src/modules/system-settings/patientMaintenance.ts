import {
  getPatientRuntimeBool,
  getPatientRuntimeValue,
} from '@/modules/system-settings/configAdapter';
import { isRuntimeSettingUnavailable } from '@/modules/system-settings/runtimeSettingUnavailable';
import type { PatientBusinessGate } from '@/modules/platform-access';
import { patientPathsAllowedDuringPhoneActivation } from '@/modules/platform-access';

const PATIENT_MAINTENANCE_MESSAGE_MAX = 500;

export function normalizePatientMaintenanceMessage(raw: string): string {
  const t = raw.trim();
  return t.length > PATIENT_MAINTENANCE_MESSAGE_MAX
    ? t.slice(0, PATIENT_MAINTENANCE_MESSAGE_MAX)
    : t;
}

/**
 * Normalizes an organization-scoped booking URL. Empty or invalid values omit the CTA.
 */
export function normalizePatientBookingUrl(raw: string | null): string | null {
  const t = (raw ?? '').trim();
  if (t.length === 0) return null;
  try {
    const u = new URL(t);
    if (u.protocol === 'http:' || u.protocol === 'https:') return t;
  } catch {
    /* fall through */
  }
  return null;
}

export type PatientMaintenanceConfig = {
  enabled: boolean;
  message: string;
  bookingUrl: string | null;
};

type PatientOrganizationResolution =
  | { ok: true; organizationId: string }
  | { ok: false; reason: 'no_active_enrollment' }
  | { ok: false; reason: 'organization_selection_required'; organizationIds: string[] };

export async function resolvePatientMaintenanceOrganizationId(
  patientOrganization: {
    resolveActiveOrganizationForPatient(
      platformUserId: string,
    ): Promise<PatientOrganizationResolution>;
  } | null,
  platformUserId: string,
): Promise<string | null> {
  if (!patientOrganization) return null;
  try {
    const resolved = await patientOrganization.resolveActiveOrganizationForPatient(platformUserId);
    return resolved.ok ? resolved.organizationId : null;
  } catch {
    return null;
  }
}

/**
 * Решение о полной замене patient shell на экран техработ.
 * Гейт по роли `client` остаётся в layout — врач/админ сюда не передаются.
 * Тестовые аккаунты (`test_account_identifiers`) видят полный patient UI даже при включённых техработах.
 */
export function patientMaintenanceReplacesPatientShell(
  maintenanceEnabled: boolean,
  skipOverlayForPath: boolean,
  isTestAccount: boolean,
): boolean {
  return maintenanceEnabled && !skipOverlayForPath && !isTestAccount;
}

/**
 * DB-backed patient maintenance flags (scope admin). No env fallbacks for these keys.
 * При выключенном режиме не читает message/booking из БД (одно чтение флага).
 * При включённом — читает message; booking URL опционален (нет строки → без CTA, без 500).
 */
export async function getPatientMaintenanceConfig(
  organizationId: string | null = null,
): Promise<PatientMaintenanceConfig> {
  const enabled = await getPatientRuntimeBool('patient_app_maintenance_enabled');
  if (!enabled) {
    return {
      enabled: false,
      message: '',
      bookingUrl: null,
    };
  }
  const messageRaw = await getPatientRuntimeValue('patient_app_maintenance_message');
  // Booking CTA is optional: missing/unavailable org URL must not take down the patient shell.
  // Fail-closed runtime read still applies to the provider; here we only omit the CTA.
  let bookingRaw: string | null = null;
  if (organizationId !== null) {
    try {
      bookingRaw = await getPatientRuntimeValue('patient_booking_url', organizationId);
    } catch (err) {
      if (!isRuntimeSettingUnavailable(err)) throw err;
      bookingRaw = null;
    }
  }
  return {
    enabled: true,
    message: normalizePatientMaintenanceMessage(messageRaw),
    bookingUrl: normalizePatientBookingUrl(bookingRaw),
  };
}

/**
 * Paths that must not be covered by the full-screen maintenance overlay (bind-phone, support, phone-activation allowlist).
 */
export function patientMaintenanceSkipsPath(params: {
  pathname: string;
  gate: PatientBusinessGate;
  legacyNoDatabase: boolean;
  sessionPhoneTrimmed: string | undefined;
}): boolean {
  const pathOnly = params.pathname.trim().split('?')[0] ?? '';
  if (
    pathOnly.startsWith('/app/patient/bind-phone') ||
    pathOnly.startsWith('/app/patient/help') ||
    pathOnly.startsWith('/app/patient/support')
  ) {
    return true;
  }

  if (
    params.gate === 'need_activation' &&
    patientPathsAllowedDuringPhoneActivation(params.pathname)
  ) {
    return true;
  }

  if (
    params.legacyNoDatabase &&
    !params.sessionPhoneTrimmed &&
    patientPathsAllowedDuringPhoneActivation(params.pathname)
  ) {
    return true;
  }

  return false;
}

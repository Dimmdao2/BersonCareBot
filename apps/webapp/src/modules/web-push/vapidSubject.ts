/**
 * Centralized VAPID subject derivation (PLAN S13 / Inventory §5.7).
 *
 * Previously duplicated verbatim across 6+ call sites:
 *   integratorNotifyChannels.ts, patientWebPushNotify.ts, notifyDoctorPatientMessageToStaff.ts,
 *   sendAdminIncidentStaffWebPush.ts, notifySpecialistTaskReminder.ts, notifyPatientDoctorReply.ts,
 *   platformUserReminderWebPushNotify.ts
 *
 * Single source of truth: derive the VAPID contact subject from the system SMTP `from` address.
 * Falls back to the DB-backed HTTPS `app_base_url` when SMTP is not configured.
 *
 * MUST be imported from here; do NOT re-derive inline (owner rule: single chokepoint, no dup).
 */

import type { SystemSettingsService } from "@/modules/system-settings/service";
import { smtpInnerFromValueJson } from "@/modules/system-settings/smtpOutboundPatch";

/**
 * Derives the VAPID subject string from `smtp_outbound.from` system setting.
 * Returns `"mailto:<from>"` when SMTP is configured with a valid email address,
 * otherwise the origin of the DB-backed HTTPS `app_base_url`. Missing/invalid
 * contact configuration fails closed instead of sending a provider-rejected JWT.
 */
export async function deriveVapidSubject(
  systemSettings: Pick<SystemSettingsService, "getSetting">,
): Promise<string | null> {
  const [smtp, appBaseUrl] = await Promise.all([
    systemSettings.getSetting("smtp_outbound", "admin"),
    systemSettings.getSetting("app_base_url", "admin"),
  ]);
  const smtpParsed = smtp?.valueJson ? smtpInnerFromValueJson(smtp.valueJson) : null;
  const appBaseUrlValue =
    appBaseUrl?.valueJson && typeof appBaseUrl.valueJson === "object" && "value" in appBaseUrl.valueJson
      ? (appBaseUrl.valueJson as { value: unknown }).value
      : null;
  return vapidSubjectFromSmtpParsed(
    smtpParsed,
    typeof appBaseUrlValue === "string" ? appBaseUrlValue : null,
  );
}

/**
 * Synchronous variant when the SMTP parsed result is already available (avoids a second DB read).
 * Pass the result of `smtpInnerFromValueJson(smtp.valueJson)` here.
 */
export function vapidSubjectFromSmtpParsed(
  smtpParsed: ReturnType<typeof smtpInnerFromValueJson> | null | undefined,
  appBaseUrl?: string | null,
): string | null {
  if (smtpParsed?.success === true && smtpParsed.data.from.includes("@")) {
    return `mailto:${smtpParsed.data.from}`;
  }
  try {
    const contactUrl = new URL(appBaseUrl?.trim() ?? "");
    if (contactUrl.protocol === "https:" && contactUrl.hostname) {
      return contactUrl.origin;
    }
  } catch {
    // Missing/invalid contact fails closed below.
  }
  return null;
}

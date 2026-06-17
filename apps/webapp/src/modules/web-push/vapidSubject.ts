/**
 * Centralized VAPID subject derivation (PLAN S13 / Inventory §5.7).
 *
 * Previously duplicated verbatim across 6+ call sites:
 *   integratorNotifyChannels.ts, patientWebPushNotify.ts, notifyDoctorPatientMessageToStaff.ts,
 *   sendAdminIncidentStaffWebPush.ts, notifySpecialistTaskReminder.ts, notifyPatientDoctorReply.ts,
 *   platformUserReminderWebPushNotify.ts
 *
 * Single source of truth: derive the VAPID `mailto:` subject from the system SMTP `from` address.
 * Falls back to `mailto:noreply@invalid` when SMTP is not configured.
 *
 * MUST be imported from here; do NOT re-derive inline (owner rule: single chokepoint, no dup).
 */

import type { SystemSettingsService } from "@/modules/system-settings/service";
import { smtpInnerFromValueJson } from "@/modules/system-settings/smtpOutboundPatch";

/**
 * Derives the VAPID subject string from `smtp_outbound.from` system setting.
 * Returns `"mailto:<from>"` when SMTP is configured with a valid email address,
 * otherwise `"mailto:noreply@invalid"` (a spec-compliant placeholder that lets
 * the push service accept the request but cannot be used for contact).
 */
export async function deriveVapidSubject(
  systemSettings: Pick<SystemSettingsService, "getSetting">,
): Promise<string> {
  const smtp = await systemSettings.getSetting("smtp_outbound", "admin");
  const smtpParsed = smtp?.valueJson ? smtpInnerFromValueJson(smtp.valueJson) : null;
  if (smtpParsed?.success === true && smtpParsed.data.from.includes("@")) {
    return `mailto:${smtpParsed.data.from}`;
  }
  return "mailto:noreply@invalid";
}

/**
 * Synchronous variant when the SMTP parsed result is already available (avoids a second DB read).
 * Pass the result of `smtpInnerFromValueJson(smtp.valueJson)` here.
 */
export function vapidSubjectFromSmtpParsed(
  smtpParsed: ReturnType<typeof smtpInnerFromValueJson> | null | undefined,
): string {
  if (smtpParsed?.success === true && smtpParsed.data.from.includes("@")) {
    return `mailto:${smtpParsed.data.from}`;
  }
  return "mailto:noreply@invalid";
}

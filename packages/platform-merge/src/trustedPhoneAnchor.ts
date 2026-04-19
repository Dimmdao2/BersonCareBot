/**
 * Minimal copy of TrustedPatientPhoneSource anchor for merge package (avoid webapp imports).
 */
export enum TrustedPatientPhoneSource {
  OtpCreateOrBind = "otp_create_or_bind",
  IntegratorUpsertFromProjection = "integrator_upsert_from_projection",
  IntegratorEnsureClientFromAppointment = "integrator_ensure_client_from_appointment",
  IntegratorUpdatePhone = "integrator_update_phone",
  OAuthYandexVerifiedPhone = "oauth_yandex_verified_phone",
  OAuthWebLoginVerifiedPhone = "oauth_web_login_verified_phone",
  PlatformUserMerge = "platform_user_merge",
  AdminManualProfilePatch = "admin_manual_profile_patch",
}

export function trustedPatientPhoneWriteAnchor(source: TrustedPatientPhoneSource): void {
  void source;
}

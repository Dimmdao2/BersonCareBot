import { notificationText } from '@/shared/notifications/notificationText';

type SecurityAction =
  | 'start_enrollment'
  | 'verify_enrollment'
  | 'confirm_recovery'
  | 'bind_specialist'
  | 'retry_provisioning'
  | 'revoke_sessions'
  | 'change_password'
  | 'login_factor'
  | 'email_password_login';

const actionFallback: Record<SecurityAction, string> = {
  start_enrollment: notificationText.authStartEnrollmentFallback,
  verify_enrollment: notificationText.authVerifyEnrollmentFallback,
  confirm_recovery: notificationText.authConfirmRecoveryFallback,
  bind_specialist: notificationText.authBindSpecialistFallback,
  retry_provisioning: notificationText.authRetryProvisioningFallback,
  revoke_sessions: notificationText.authRevokeSessionsFallback,
  change_password: notificationText.authChangePasswordFallback,
  login_factor: notificationText.authLoginFactorFallback,
  email_password_login: notificationText.authEmailPasswordLoginFallback,
};

/** Human-readable staff-security errors for browser surfaces. */
export function staffSecurityErrorText(error: string | undefined, action: SecurityAction): string {
  switch (error) {
    case 'wrong_current_password':
      return notificationText.authWrongCurrentPassword;
    case 'password_temporarily_locked':
      return notificationText.authPasswordTemporarilyLocked;
    case 'weak_new_password':
      return notificationText.authWeakNewPassword;
    case 'password_login_unavailable':
      return notificationText.authPasswordLoginUnavailable;
    case 'password_not_available_for_role':
      return notificationText.authPasswordNotAvailableForRole;
    case 'password_changed_session_reissue_failed':
      return notificationText.authPasswordChangedSessionReissueFailed;
    case 'rate_limited':
      return notificationText.authTooManyAttempts;
    case 'factor_locked':
      return notificationText.authFactorLocked;
    case 'invalid_factor':
      return notificationText.authCodeInvalidOrExpired;
    case 'invalid_recovery_code':
      return notificationText.authInvalidRecoveryCode;
    case 'invalid_credentials':
      return notificationText.authInvalidCredentialsSessionExpired;
    case 'expired_code':
      // G1 (safety audit): the route clears the login continuation before responding for this
      // code, so "введите код ещё раз" (the generic login_factor fallback) is guaranteed to fail
      // forever. Reuse the same text as `login_challenge_expired` — the correct next step really
      // is to log in again and request a fresh code.
      return notificationText.authLoginChallengeExpired;
    case 'too_many_attempts':
      // G1: this code arrives with HTTP 429 — never invite deepening the lockout.
      return notificationText.authTooManyAttempts;
    case 'invalid_code':
      return notificationText.authCodeInvalidOrExpired;
    case 'email_conflict':
      return notificationText.authInvalidCredentialsSessionExpired;
    // Role/portal mismatch (roleCanUsePortal, pre-session) reads to the browser as wrong
    // credentials on purpose: revealing "this account exists but has no access to this door"
    // would leak role information to anyone probing the wrong login form with guessed creds.
    case 'portal_access_denied':
      return notificationText.authInvalidCredentialsOrPortalDenied;
    case 'invalid_body':
      return notificationText.authInvalidBody;
    case 'enrollment_not_started':
      return notificationText.authEnrollmentNotStarted;
    case 'security_session_required':
    case 'verified_security_required':
      return notificationText.authSecuritySessionRequired;
    case 'verified_email_required':
      return notificationText.authVerifiedEmailRequired;
    case 'factor_already_enrolled':
      return notificationText.authFactorAlreadyEnrolled;
    case 'totp_enrollment_start_failed':
      return notificationText.authStartEnrollmentFallback;
    case 'owner_required':
      return notificationText.authOwnerRequired;
    case 'specialist_binding_failed':
      return notificationText.authBindSpecialistFallback;
    case 'auth_channel_disabled':
      return notificationText.authChannelDisabled;
    case 'signup_intent_not_found':
      return notificationText.authSignupIntentNotFound;
    case 'provisioning_pending':
      return notificationText.authProvisioningPending;
    case 'doctor_workspace_membership_required':
      return notificationText.authDoctorWorkspaceMembershipRequired;
    case 'security_setup_required':
      return notificationText.authSecuritySetupRequired;
    case 'login_challenge_expired':
      return notificationText.authLoginChallengeExpired;
    case 'factor_replacement_required':
      return notificationText.authFactorReplacementRequired;
    case 'unauthorized':
      return notificationText.authUnauthorized;
    case 'forbidden':
      return notificationText.authForbidden;
    case 'proxy_configuration':
      return notificationText.authProxyConfiguration;
    case 'password_change_failed':
      return notificationText.authChangePasswordFallback;
    case 'security_setup_pending':
      return notificationText.authStartEnrollmentFallback;
    default:
      return actionFallback[action];
  }
}

export function staffSecurityNetworkErrorText(action: SecurityAction): string {
  return `${actionFallback[action]} Проверьте соединение с интернетом.`;
}

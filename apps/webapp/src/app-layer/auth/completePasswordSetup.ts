import type { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { enterStaffSecuritySelfPrincipal } from '@/app-layer/principal/staffSecuritySelfPrincipal';
import { hashPin } from '@/modules/auth/pinHash';
import {
  isPasswordEligibleRole,
  PASSWORD_NOT_ALLOWED_FOR_ROLE_ERROR,
} from '@/modules/auth/passwordEligibility';
import { getRedirectPathForRole } from '@/modules/auth/redirectPolicy';
import { setSessionFromUser } from '@/modules/auth/service';
import { isPlatformUserUuid } from '@/shared/platform-user/isPlatformUserUuid';

type AppDeps = ReturnType<typeof buildAppDeps>;

export type CompletePasswordSetupResult =
  | Readonly<{ ok: true; redirectTo: string; role: 'client' | 'doctor' | 'admin' }>
  | Readonly<{
      ok: false;
      error: typeof PASSWORD_NOT_ALLOWED_FOR_ROLE_ERROR | 'server_error';
      status: 403 | 500;
    }>;

/** The single post-OTP write path for first-time password setup. */
export async function completePasswordSetupAfterVerification(params: {
  deps: AppDeps;
  userId: string;
  emailNormalized: string;
  password: string;
  principalSource: string;
}): Promise<CompletePasswordSetupResult> {
  if (!isPlatformUserUuid(params.userId)) {
    return { ok: false, error: 'server_error', status: 500 };
  }
  const sessionUser = await params.deps.userByPhone.findByUserId(params.userId);
  if (!sessionUser) {
    return { ok: false, error: 'server_error', status: 500 };
  }
  if (!isPasswordEligibleRole(sessionUser.role)) {
    return { ok: false, error: PASSWORD_NOT_ALLOWED_FOR_ROLE_ERROR, status: 403 };
  }

  enterStaffSecuritySelfPrincipal(params.userId, params.principalSource);
  const passwordHash = await hashPin(params.password);
  await params.deps.userPasswordCredentials.upsertPasswordHash(
    params.userId,
    params.emailNormalized,
    passwordHash,
  );

  await setSessionFromUser(sessionUser, 'email_setup_code');
  return {
    ok: true,
    redirectTo: getRedirectPathForRole(sessionUser.role),
    role: sessionUser.role,
  };
}

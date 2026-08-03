import type { AppSession, SessionUser } from '@/shared/types/session';
import type { StaffSecurityService } from '@/modules/staff-security/service';
import type { StaffSecurityStatus } from '@/modules/staff-security/ports';
import { issueStaffLoginContinuation } from '@/modules/auth/staffLoginContinuation';

type SessionOptions = {
  postLoginHints?: AppSession['postLoginHints'];
  staffSecurity?: AppSession['staffSecurity'];
};

export type VerifiedStaffPrimaryLoginPreparation =
  | { factorRequired: true }
  | { factorRequired: false; sessionOptions: SessionOptions };

export function isStaff(user: SessionUser): boolean {
  return user.role === 'doctor' || user.role === 'admin';
}

export async function prepareVerifiedPrimaryLoginWithStatus(input: {
  user: SessionUser;
  security: StaffSecurityStatus | null;
  staffSecurity: Pick<StaffSecurityService, 'beginLogin'>;
  postLoginHints?: AppSession['postLoginHints'];
}): Promise<VerifiedStaffPrimaryLoginPreparation> {
  const baseOptions: SessionOptions = input.postLoginHints
    ? { postLoginHints: input.postLoginHints }
    : {};

  if (!isStaff(input.user)) {
    return { factorRequired: false, sessionOptions: baseOptions };
  }

  if (input.security?.enrolled) {
    const challenge = await input.staffSecurity.beginLogin();
    if (!challenge.required) {
      throw new Error('staff_security_factor_required_state_mismatch');
    }
    await issueStaffLoginContinuation({
      userId: input.user.userId,
      token: challenge.token,
      expiresAt: challenge.expiresAt,
      ...(input.postLoginHints ? { postLoginHints: input.postLoginHints } : {}),
    });
    return { factorRequired: true };
  }

  return {
    factorRequired: false,
    sessionOptions: {
      ...baseOptions,
      ...(input.security ? { staffSecurity: { assurance: 'pending_enrollment' as const } } : {}),
    },
  };
}

export async function prepareVerifiedPrimaryLogin(input: {
  user: SessionUser;
  staffSecurity: Pick<StaffSecurityService, 'getStatus' | 'beginLogin'>;
  postLoginHints?: AppSession['postLoginHints'];
}): Promise<VerifiedStaffPrimaryLoginPreparation> {
  const security = isStaff(input.user) ? await input.staffSecurity.getStatus() : null;
  return prepareVerifiedPrimaryLoginWithStatus({ ...input, security });
}

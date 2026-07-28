import { cookies } from 'next/headers';
import { isProduction } from '@/config/env';

const COOKIE_NAME = 'bersoncare_patient_invite';
const CONTINUATION_MAX_AGE_SECONDS = 10 * 60;

const cookieOptions = {
  httpOnly: true as const,
  sameSite: 'lax' as const,
  secure: isProduction,
  path: '/join',
};

export async function issuePatientInviteContinuationCookie(continuation: string): Promise<void> {
  (await cookies()).set(COOKIE_NAME, continuation, {
    ...cookieOptions,
    maxAge: CONTINUATION_MAX_AGE_SECONDS,
  });
}

export async function readPatientInviteContinuationCookie(): Promise<string | null> {
  return (await cookies()).get(COOKIE_NAME)?.value ?? null;
}

export async function clearPatientInviteContinuationCookie(): Promise<void> {
  (await cookies()).set(COOKIE_NAME, '', { ...cookieOptions, maxAge: 0 });
}

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { isProduction } from '@/config/env';
import {
  parseVerifiedSignedOAuthState,
  type OAuthStatePurpose,
  type VerifiedOAuthState,
} from '@/modules/auth/oauthSignedState';

export const OAUTH_STATE_BINDING_COOKIE = 'bersoncare_oauth_state_binding';
export const OAUTH_STATE_BINDING_TTL_SECONDS = 10 * 60;

function hashBinding(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('base64url');
}

function cookieOptions(purpose: OAuthStatePurpose, maxAge: number) {
  const apple = purpose === 'apple';
  return {
    httpOnly: true as const,
    sameSite: apple ? ('none' as const) : ('lax' as const),
    secure: apple || isProduction,
    path: '/api/auth/oauth',
    maxAge,
  };
}

export async function issueOAuthStateBrowserBinding(
  purpose: OAuthStatePurpose,
): Promise<string> {
  const value = randomBytes(32).toString('base64url');
  (await cookies()).set(
    OAUTH_STATE_BINDING_COOKIE,
    value,
    cookieOptions(purpose, OAUTH_STATE_BINDING_TTL_SECONDS),
  );
  return hashBinding(value);
}

export async function consumeBrowserBoundOAuthState(
  token: string,
  expectedPurpose: OAuthStatePurpose,
): Promise<VerifiedOAuthState | null> {
  const cookieStore = await cookies();
  const binding = cookieStore.get(OAUTH_STATE_BINDING_COOKIE)?.value ?? null;

  // Consume before parsing or exchanging a provider code: every callback attempt gets one chance.
  cookieStore.set(
    OAUTH_STATE_BINDING_COOKIE,
    '',
    cookieOptions(expectedPurpose, 0),
  );

  const state = parseVerifiedSignedOAuthState(token, expectedPurpose);
  if (!state?.browserBindingHash || !binding) return null;

  const actualHash = Buffer.from(hashBinding(binding));
  const expectedHash = Buffer.from(state.browserBindingHash);
  if (actualHash.length !== expectedHash.length) return null;
  return timingSafeEqual(actualHash, expectedHash) ? state : null;
}

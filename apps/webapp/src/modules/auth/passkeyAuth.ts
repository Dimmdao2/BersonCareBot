import { randomBytes, randomUUID } from 'node:crypto';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { env } from '@/config/env';
import type { PasskeyStore } from '@/modules/auth/passkeyStore';

const PASSKEY_CHALLENGE_TTL_MS = 5 * 60 * 1000;

export type PasskeyRpConfig = {
  rpName: string;
  rpId: string;
  expectedOrigin: string;
};

export function getPasskeyRpConfig(): PasskeyRpConfig {
  const appUrl = new URL(env.APP_BASE_URL);
  if (
    appUrl.protocol !== 'https:' &&
    appUrl.hostname !== '127.0.0.1' &&
    appUrl.hostname !== 'localhost'
  ) {
    throw new Error('passkey_https_required');
  }
  return {
    rpName: 'BersonCare',
    rpId: appUrl.hostname,
    expectedOrigin: appUrl.origin,
  };
}

export async function beginPasskeyRegistration(
  userId: string,
  userDisplayName: string,
  store: PasskeyStore,
): Promise<{
  challengeId: string;
  options: Awaited<ReturnType<typeof generateRegistrationOptions>>;
}> {
  const config = getPasskeyRpConfig();
  const userHandle = await store.getOrCreateUserHandle(
    userId,
    randomBytes(32).toString('base64url'),
  );
  const exclusions = await store.listCredentialExclusions(userId);
  const options = await generateRegistrationOptions({
    rpName: config.rpName,
    rpID: config.rpId,
    userID: Buffer.from(userHandle, 'base64url'),
    userName: userHandle,
    userDisplayName,
    attestationType: 'none',
    authenticatorSelection: {
      residentKey: 'required',
      requireResidentKey: true,
      userVerification: 'required',
    },
    excludeCredentials: exclusions.map((entry) => ({
      id: entry.credentialId,
      transports: entry.transports,
    })),
  });
  const challengeId = randomUUID();
  const issued = await store.issueChallenge({
    id: challengeId,
    purpose: 'registration',
    userId,
    challenge: options.challenge,
    expectedOrigin: config.expectedOrigin,
    rpId: config.rpId,
    expiresAt: new Date(Date.now() + PASSKEY_CHALLENGE_TTL_MS).toISOString(),
  });
  if (!issued) throw new Error('passkey_challenge_not_issued');
  return { challengeId, options };
}

export async function finishPasskeyRegistration(
  input: {
    userId: string;
    challengeId: string;
    response: RegistrationResponseJSON;
  },
  store: PasskeyStore,
): Promise<boolean> {
  const challenge = await store.readChallenge(input.challengeId, 'registration');
  if (!challenge || challenge.userId !== input.userId) return false;

  const verified = await verifyRegistrationResponse({
    response: input.response,
    expectedChallenge: challenge.challenge,
    expectedOrigin: challenge.expectedOrigin,
    expectedRPID: challenge.rpId,
    requireUserVerification: true,
  });
  if (!verified.verified) return false;

  const { credential, credentialDeviceType, credentialBackedUp } = verified.registrationInfo;
  return store.completeRegistration({
    challengeId: input.challengeId,
    userId: input.userId,
    credentialId: credential.id,
    publicKey: Buffer.from(credential.publicKey).toString('base64url'),
    counter: credential.counter,
    transports: credential.transports ?? [],
    deviceType: credentialDeviceType,
    backedUp: credentialBackedUp,
  });
}

export async function beginPasskeyAuthentication(store: PasskeyStore): Promise<{
  challengeId: string;
  options: Awaited<ReturnType<typeof generateAuthenticationOptions>>;
}> {
  const config = getPasskeyRpConfig();
  const options = await generateAuthenticationOptions({
    rpID: config.rpId,
    userVerification: 'required',
  });
  const challengeId = randomUUID();
  const issued = await store.issueChallenge({
    id: challengeId,
    purpose: 'authentication',
    userId: null,
    challenge: options.challenge,
    expectedOrigin: config.expectedOrigin,
    rpId: config.rpId,
    expiresAt: new Date(Date.now() + PASSKEY_CHALLENGE_TTL_MS).toISOString(),
  });
  if (!issued) throw new Error('passkey_challenge_not_issued');
  return { challengeId, options };
}

export async function finishPasskeyAuthentication(
  input: {
    challengeId: string;
    response: AuthenticationResponseJSON;
  },
  store: PasskeyStore,
): Promise<string | null> {
  const [challenge, credential] = await Promise.all([
    store.readChallenge(input.challengeId, 'authentication'),
    store.readCredential(input.response.id),
  ]);
  if (!challenge || !credential) return null;
  if (input.response.response.userHandle !== credential.userHandle) return null;

  const verified = await verifyAuthenticationResponse({
    response: input.response,
    expectedChallenge: challenge.challenge,
    expectedOrigin: challenge.expectedOrigin,
    expectedRPID: challenge.rpId,
    credential: {
      id: credential.credentialId,
      publicKey: Buffer.from(credential.publicKey, 'base64url'),
      counter: credential.counter,
      transports: credential.transports,
    },
    requireUserVerification: true,
  });
  if (!verified.verified) return null;

  return store.completeAuthentication({
    challengeId: input.challengeId,
    credentialId: credential.credentialId,
    previousCounter: credential.counter,
    newCounter: verified.authenticationInfo.newCounter,
    deviceType: verified.authenticationInfo.credentialDeviceType,
    backedUp: verified.authenticationInfo.credentialBackedUp,
  });
}

import type { AuthenticatorTransportFuture, CredentialDeviceType } from '@simplewebauthn/server';

export type PasskeyChallengePurpose = 'registration' | 'authentication';

export type PasskeyChallenge = {
  userId: string | null;
  challenge: string;
  expectedOrigin: string;
  rpId: string;
  expiresAt: string;
};

export type PasskeyCredential = {
  credentialId: string;
  userId: string;
  userHandle: string;
  publicKey: string;
  counter: number;
  transports: AuthenticatorTransportFuture[];
  deviceType: CredentialDeviceType;
  backedUp: boolean;
};

export type PasskeyCredentialSummary = {
  credentialId: string;
  transports: AuthenticatorTransportFuture[];
  deviceType: CredentialDeviceType;
  backedUp: boolean;
  createdAt: string;
  lastUsedAt: string | null;
};

export type PasskeyStore = {
  getOrCreateUserHandle(userId: string, candidateHandle: string): Promise<string>;
  listCredentialExclusions(
    userId: string,
  ): Promise<Array<{ credentialId: string; transports: AuthenticatorTransportFuture[] }>>;
  listCredentials(userId: string): Promise<PasskeyCredentialSummary[]>;
  issueChallenge(input: {
    id: string;
    purpose: PasskeyChallengePurpose;
    userId: string | null;
    challenge: string;
    expectedOrigin: string;
    rpId: string;
    expiresAt: string;
  }): Promise<boolean>;
  readChallenge(id: string, purpose: PasskeyChallengePurpose): Promise<PasskeyChallenge | null>;
  readCredential(credentialId: string): Promise<PasskeyCredential | null>;
  completeRegistration(input: {
    challengeId: string;
    userId: string;
    credentialId: string;
    publicKey: string;
    counter: number;
    transports: AuthenticatorTransportFuture[];
    deviceType: CredentialDeviceType;
    backedUp: boolean;
  }): Promise<boolean>;
  completeAuthentication(input: {
    challengeId: string;
    credentialId: string;
    previousCounter: number;
    newCounter: number;
    deviceType: CredentialDeviceType;
    backedUp: boolean;
  }): Promise<string | null>;
  deleteCredential(userId: string, credentialId: string): Promise<boolean>;
};

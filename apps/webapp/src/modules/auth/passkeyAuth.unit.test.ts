import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PasskeyStore } from '@/modules/auth/passkeyStore';

const fakes = vi.hoisted(() => ({
  generateRegistrationOptions: vi.fn(),
  verifyRegistrationResponse: vi.fn(),
  generateAuthenticationOptions: vi.fn(),
  verifyAuthenticationResponse: vi.fn(),
}));

vi.mock('@simplewebauthn/server', () => ({
  generateRegistrationOptions: fakes.generateRegistrationOptions,
  verifyRegistrationResponse: fakes.verifyRegistrationResponse,
  generateAuthenticationOptions: fakes.generateAuthenticationOptions,
  verifyAuthenticationResponse: fakes.verifyAuthenticationResponse,
}));

import {
  beginPasskeyRegistration,
  finishPasskeyAuthentication,
  finishPasskeyRegistration,
} from '@/modules/auth/passkeyAuth';

function makeStore(): PasskeyStore {
  return {
    getOrCreateUserHandle: vi.fn().mockResolvedValue('a'.repeat(43)),
    listCredentialExclusions: vi.fn().mockResolvedValue([]),
    listCredentials: vi.fn().mockResolvedValue([]),
    issueChallenge: vi.fn().mockResolvedValue(true),
    readChallenge: vi.fn(),
    readCredential: vi.fn(),
    completeRegistration: vi.fn().mockResolvedValue(true),
    completeAuthentication: vi.fn().mockResolvedValue('00000000-0000-0000-0000-000000000002'),
    deleteCredential: vi.fn().mockResolvedValue(true),
  };
}

const registrationResponse = {
  id: 'credential-registration',
  rawId: 'credential-registration',
  type: 'public-key',
  response: {
    clientDataJSON: 'client-data-registration',
    attestationObject: 'attestation-registration',
    transports: ['internal'],
  },
  clientExtensionResults: {},
} as RegistrationResponseJSON;

const authenticationResponse = {
  id: 'credential-authentication',
  rawId: 'credential-authentication',
  type: 'public-key',
  response: {
    clientDataJSON: 'client-data-authentication',
    authenticatorData: 'authenticator-data',
    signature: 'signature-authentication',
    userHandle: 'a'.repeat(43),
  },
  clientExtensionResults: {},
} as AuthenticationResponseJSON;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('passkey ceremonies', () => {
  it('issues attestation-none registration bound to the configured RP origin and verified user', async () => {
    const store = makeStore();
    fakes.generateRegistrationOptions.mockResolvedValue({ challenge: 'c'.repeat(43) });

    await beginPasskeyRegistration('00000000-0000-0000-0000-000000000002', 'Доктор Тестовый', store);

    expect(fakes.generateRegistrationOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        rpID: '127.0.0.1',
        userDisplayName: 'Доктор Тестовый',
        attestationType: 'none',
        authenticatorSelection: expect.objectContaining({
          residentKey: 'required',
          userVerification: 'required',
        }),
      }),
    );
    expect(store.issueChallenge).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: 'registration',
        userId: '00000000-0000-0000-0000-000000000002',
        challenge: 'c'.repeat(43),
        expectedOrigin: 'http://127.0.0.1:5200',
        rpId: '127.0.0.1',
      }),
    );
  });

  it('does not verify or save enrollment when the one-time challenge belongs to another user', async () => {
    const store = makeStore();
    vi.mocked(store.readChallenge).mockResolvedValue({
      userId: '00000000-0000-0000-0000-000000000003',
      challenge: 'c'.repeat(43),
      expectedOrigin: 'https://app.example.test',
      rpId: 'app.example.test',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });

    await expect(
      finishPasskeyRegistration(
        {
          userId: '00000000-0000-0000-0000-000000000002',
          challengeId: '00000000-0000-4000-8000-000000000001',
          response: registrationResponse,
        },
        store,
      ),
    ).resolves.toBe(false);
    expect(fakes.verifyRegistrationResponse).not.toHaveBeenCalled();
    expect(store.completeRegistration).not.toHaveBeenCalled();
  });

  it('rejects a discoverable credential whose returned opaque userHandle is not its account handle', async () => {
    const store = makeStore();
    vi.mocked(store.readChallenge).mockResolvedValue({
      userId: null,
      challenge: 'c'.repeat(43),
      expectedOrigin: 'https://app.example.test',
      rpId: 'app.example.test',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    vi.mocked(store.readCredential).mockResolvedValue({
      credentialId: authenticationResponse.id,
      userId: '00000000-0000-0000-0000-000000000002',
      userHandle: 'b'.repeat(43),
      publicKey: 'cHVibGljLWtleS1mb3ItdGVzdA',
      counter: 0,
      transports: ['internal'],
      deviceType: 'singleDevice',
      backedUp: false,
    });

    await expect(
      finishPasskeyAuthentication(
        {
          challengeId: '00000000-0000-4000-8000-000000000001',
          response: authenticationResponse,
        },
        store,
      ),
    ).resolves.toBeNull();
    expect(fakes.verifyAuthenticationResponse).not.toHaveBeenCalled();
    expect(store.completeAuthentication).not.toHaveBeenCalled();
  });

  it('returns no session identity when atomic challenge consumption loses a replay race', async () => {
    const store = makeStore();
    vi.mocked(store.readChallenge).mockResolvedValue({
      userId: null,
      challenge: 'c'.repeat(43),
      expectedOrigin: 'https://app.example.test',
      rpId: 'app.example.test',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    vi.mocked(store.readCredential).mockResolvedValue({
      credentialId: authenticationResponse.id,
      userId: '00000000-0000-0000-0000-000000000002',
      userHandle: 'a'.repeat(43),
      publicKey: 'cHVibGljLWtleS1mb3ItdGVzdA',
      counter: 7,
      transports: ['internal'],
      deviceType: 'multiDevice',
      backedUp: true,
    });
    fakes.verifyAuthenticationResponse.mockResolvedValue({
      verified: true,
      authenticationInfo: {
        newCounter: 8,
        credentialDeviceType: 'multiDevice',
        credentialBackedUp: true,
      },
    });
    vi.mocked(store.completeAuthentication).mockResolvedValue(null);

    await expect(
      finishPasskeyAuthentication(
        {
          challengeId: '00000000-0000-4000-8000-000000000001',
          response: authenticationResponse,
        },
        store,
      ),
    ).resolves.toBeNull();
    expect(store.completeAuthentication).toHaveBeenCalledWith(
      expect.objectContaining({ previousCounter: 7, newCounter: 8 }),
    );
  });
});

import type { CredentialDeviceType } from '@simplewebauthn/server';

/**
 * Словарь transports принадлежит нашему хранилищу, а не библиотеке.
 *
 * SimpleWebAuthn 14 убрал `AuthenticatorTransportFuture` и оставил в DOM-типах только словарь
 * WebAuthn L3 (`ble | hybrid | internal | nfc | usb`), а на всех своих runtime-границах перешёл на
 * `string[]` — потому что transports приходят из браузера и закрытым union быть не могут. У нас в
 * `passkey_credentials` лежат ключи, зарегистрированные раньше: там встречаются ещё `cable`
 * (доспецификационное имя `hybrid`) и `smart-card`. Список ниже — ровно тот, что принимался до
 * обновления; сузить его значило бы молча терять подсказку у уже существующих ключей.
 */
export const PASSKEY_TRANSPORTS = [
  'ble',
  'cable',
  'hybrid',
  'internal',
  'nfc',
  'smart-card',
  'usb',
] as const;

export type PasskeyTransport = (typeof PASSKEY_TRANSPORTS)[number];

const PASSKEY_TRANSPORT_SET: ReadonlySet<string> = new Set(PASSKEY_TRANSPORTS);

/** Отбирает известные значения из чего угодно: и из строки БД, и из ответа браузера. */
export function parsePasskeyTransports(value: unknown): PasskeyTransport[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is PasskeyTransport =>
      typeof entry === 'string' && PASSKEY_TRANSPORT_SET.has(entry),
  );
}

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
  transports: PasskeyTransport[];
  deviceType: CredentialDeviceType;
  backedUp: boolean;
};

export type PasskeyCredentialSummary = {
  credentialId: string;
  transports: PasskeyTransport[];
  deviceType: CredentialDeviceType;
  backedUp: boolean;
  createdAt: string;
  lastUsedAt: string | null;
};

export type PasskeyStore = {
  getOrCreateUserHandle(userId: string, candidateHandle: string): Promise<string>;
  listCredentialExclusions(
    userId: string,
  ): Promise<Array<{ credentialId: string; transports: PasskeyTransport[] }>>;
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
    transports: PasskeyTransport[];
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

import { createHash, createHmac, randomUUID } from 'node:crypto';
import {
  createChallenge,
  randomInt,
  verifySolution,
  type Challenge,
  type Payload,
} from 'altcha-lib';
import { deriveKey } from 'altcha-lib/algorithms/pbkdf2';
import { z } from 'zod';
import { passwordIdentifierKey, type PasswordAltchaProof } from './passwordLoginProtection';
import type {
  PasswordAltchaChallenge,
  PasswordLoginProtectionPort,
} from './passwordLoginProtectionPort';

const MAX_PAYLOAD_LENGTH = 32_768;
const CHALLENGE_LIFETIME_MS = 5 * 60 * 1000;
const PURPOSE = 'password_login';

const payloadSchema = z.object({
  challenge: z.object({
    parameters: z.object({
      algorithm: z.string(),
      nonce: z.string(),
      salt: z.string(),
      cost: z.number().int(),
      keyLength: z.number().int(),
      keyPrefix: z.string(),
      expiresAt: z.number().int(),
      data: z.object({
        challengeId: z.string().uuid(),
        purpose: z.literal(PURPOSE),
        identifierKey: z.string().regex(/^password-email:v1:[0-9a-f]{64}$/),
      }),
    }),
    signature: z.string(),
  }),
  solution: z.object({
    counter: z.number().int().nonnegative(),
    derivedKey: z.string(),
    time: z.number().optional(),
  }),
});

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(',')}}`;
}

function challengeDigest(challenge: Challenge): string {
  return createHash('sha256').update(stableJson(challenge)).digest('hex');
}

function signatureSecret(rootSecret: string): string {
  return createHmac('sha256', rootSecret).update('password-altcha:signature:v1').digest('hex');
}

function decodePayload(rawPayload: string): Payload | null {
  if (rawPayload.length === 0 || rawPayload.length > MAX_PAYLOAD_LENGTH) return null;
  try {
    const decoded = Buffer.from(rawPayload, 'base64').toString('utf8');
    if (decoded.length > MAX_PAYLOAD_LENGTH) return null;
    const parsed = payloadSchema.safeParse(JSON.parse(decoded) as unknown);
    return parsed.success ? (parsed.data as Payload) : null;
  } catch {
    return null;
  }
}

export function createPasswordAltchaService(port: PasswordLoginProtectionPort) {
  return {
    async issue(emailNormalized: string): Promise<PasswordAltchaChallenge | null> {
      const rootSecret = await port.readAltchaRootSecret();
      if (!rootSecret) return null;

      const challengeId = randomUUID();
      const identifierKey = passwordIdentifierKey(emailNormalized);
      const expiresAt = new Date(Date.now() + CHALLENGE_LIFETIME_MS);
      const challenge = await createChallenge({
        algorithm: 'PBKDF2/SHA-256',
        cost: 5_000,
        counter: randomInt(10_000, 5_000),
        deriveKey,
        expiresAt,
        hmacSignatureSecret: signatureSecret(rootSecret),
        data: {
          challengeId,
          purpose: PURPOSE,
          identifierKey,
        },
      });
      const issued = await port.registerAltchaChallenge({
        emailNormalized,
        challengeId,
        challengeDigest: challengeDigest(challenge),
        expiresAt,
      });
      return issued ? { challenge, expiresAt: expiresAt.toISOString() } : null;
    },

    async verify(
      emailNormalized: string,
      rawPayload: string | undefined,
    ): Promise<PasswordAltchaProof | undefined> {
      if (!rawPayload) return undefined;
      const payload = decodePayload(rawPayload);
      if (!payload) return undefined;
      const data = payload.challenge.parameters.data;
      if (
        data?.purpose !== PURPOSE ||
        data.identifierKey !== passwordIdentifierKey(emailNormalized) ||
        typeof data.challengeId !== 'string'
      ) {
        return undefined;
      }

      const rootSecret = await port.readAltchaRootSecret();
      if (!rootSecret) return undefined;
      const result = await verifySolution({
        challenge: payload.challenge,
        solution: payload.solution,
        deriveKey,
        hmacSignatureSecret: signatureSecret(rootSecret),
      });
      if (!result.verified) return undefined;
      return {
        challengeId: data.challengeId,
        challengeDigest: challengeDigest(payload.challenge),
      };
    },
  };
}

export type PasswordAltchaService = ReturnType<typeof createPasswordAltchaService>;

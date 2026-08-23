import { createHash, createHmac, randomBytes, randomInt, randomUUID } from 'node:crypto';
import { env, integratorWebhookSecret } from '@/config/env';
import { normalizeEmail } from '@/modules/auth/emailAuth';
import { sendEmailAuthCode } from '@/modules/auth/emailSendPort';
import { OTP_RESEND_COOLDOWN_SEC } from '@/modules/auth/otpConstants';
import type { PatientInviteFailure, PatientInviteLifecycleCode, PatientInvitesPort } from './ports';
import { platformMailProfile } from '@/modules/auth/mailProfile';
import { PATIENT_DEFAULT_SURFACE } from '@/config/productSurfaces';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CONTINUATION_TTL_MS = 10 * 60 * 1000;
const PROOF_TTL_MS = 10 * 60 * 1000;
const PROOF_AUTHORIZATION_TTL_MS = 60 * 1000;

function invitePepper(): string {
  return integratorWebhookSecret() || env.SESSION_COOKIE_SECRET || 'test-patient-invite-pepper';
}

function hashOpaque(value: string, purpose: 'bearer' | 'continuation'): string {
  return createHash('sha256')
    .update(`patient-invite:${purpose}:v1:${value}:${invitePepper()}`)
    .digest('hex');
}

export function hashPatientInviteBearer(value: string): string {
  return hashOpaque(value, 'bearer');
}

export function hashPatientInviteContinuation(value: string): string {
  return hashOpaque(value, 'continuation');
}

function opaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

function generateEmailCode(): string {
  return String(randomInt(100000, 1000000));
}

function hashPatientInviteEmailCode(code: string): string {
  return createHash('sha256')
    .update(`patient-invite:email-code:v1:${code}:${invitePepper()}`)
    .digest('hex');
}

function proofAuthorization(input: {
  action: 'start' | 'verify' | 'claim';
  continuationHash: string;
  emailNormalized: string;
  codeHash: string;
  proofExpiresEpoch: number | null;
}) {
  const nonce = randomUUID();
  const expiresEpoch = Math.floor((Date.now() + PROOF_AUTHORIZATION_TTL_MS) / 1000);
  const canonical = [
    'patient-invite-proof',
    'v1',
    input.action,
    nonce,
    String(expiresEpoch),
    input.continuationHash,
    input.emailNormalized,
    input.codeHash,
    input.proofExpiresEpoch == null ? '' : String(input.proofExpiresEpoch),
  ].join('|');
  const secret = env.DB_PRINCIPAL_SIGNING_SECRET || invitePepper();
  return {
    authorizationNonce: nonce,
    authorizationExpiresEpoch: expiresEpoch,
    authorizationSignature: createHmac('sha256', secret).update(canonical).digest('hex'),
  };
}

function lifecycleFailure(code: PatientInviteLifecycleCode): PatientInviteFailure {
  return { ok: false, code };
}

export function createPatientInvitesService(deps: {
  port: PatientInvitesPort;
  sendEmailCode?: typeof sendEmailAuthCode;
}) {
  const sendEmailCode = deps.sendEmailCode ?? sendEmailAuthCode;

  return {
    getPortalStatus(organizationId: string, patientUserId: string) {
      return deps.port.getPortalStatus({ organizationId, patientUserId });
    },

    async issue(input: {
      organizationId: string;
      patientUserId: string;
      invitedEmail: string | null;
      createdByPlatformUserId: string;
    }) {
      const normalizedRecipient = input.invitedEmail ? normalizeEmail(input.invitedEmail) : '';
      const invitedEmailNormalized = normalizedRecipient || null;
      const recipientBinding = invitedEmailNormalized
        ? ('bound_email' as const)
        : ('unbound_email_claim' as const);
      const bearer = opaqueToken();
      const result = await deps.port.createReplacingPending({
        id: randomUUID(),
        organizationId: input.organizationId,
        patientUserId: input.patientUserId,
        tokenHash: hashPatientInviteBearer(bearer),
        invitedEmailNormalized,
        recipientBinding,
        expiresAt: new Date(Date.now() + INVITE_TTL_MS).toISOString(),
        createdByPlatformUserId: input.createdByPlatformUserId,
      });
      if (!result.ok) return result;
      return {
        ok: true as const,
        invite: result.invite,
        // Fragment never reaches the server. The browser exchanges this raw bearer once.
        relativeUrl: `/join/start#${bearer}`,
      };
    },

    revoke(input: {
      organizationId: string;
      patientUserId: string;
      inviteId: string;
      revokedByPlatformUserId: string;
    }) {
      return deps.port.revokePending(input);
    },

    async exchangeBearer(bearer: string) {
      if (bearer.length < 32) return lifecycleFailure('invalid_token');
      const continuation = opaqueToken();
      const result = await deps.port.exchangeBearer({
        tokenHash: hashPatientInviteBearer(bearer),
        continuationHash: hashPatientInviteContinuation(continuation),
        continuationExpiresAt: new Date(Date.now() + CONTINUATION_TTL_MS).toISOString(),
      });
      if (!result.ok) return result;
      return {
        ok: true as const,
        kind: 'patient' as const,
        continuation,
        preview: result.preview,
      };
    },

    lookupContinuation(continuation: string) {
      if (continuation.length < 32)
        return Promise.resolve(lifecycleFailure('invalid_continuation'));
      return deps.port.lookupContinuation(hashPatientInviteContinuation(continuation));
    },

    async startEmailProof(continuation: string, emailRaw: string) {
      const emailNormalized = normalizeEmail(emailRaw);
      if (!emailNormalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNormalized)) {
        return { ok: false as const, code: 'invalid_email' as const };
      }
      const continuationHash = hashPatientInviteContinuation(continuation);
      const code = generateEmailCode();
      const codeHash = hashPatientInviteEmailCode(code);
      const proofExpiresAt = new Date(Date.now() + PROOF_TTL_MS).toISOString();
      const started = await deps.port.startEmailProof({
        continuationHash,
        emailNormalized,
        codeHash,
        proofExpiresAt,
        ...proofAuthorization({
          action: 'start',
          continuationHash,
          emailNormalized,
          codeHash,
          proofExpiresEpoch: Math.floor(Date.parse(proofExpiresAt) / 1000),
        }),
      });
      if (!started.ok) return started;
      const sent = await sendEmailCode(
        emailNormalized,
        code,
        platformMailProfile(PATIENT_DEFAULT_SURFACE.name),
      );
      if (!sent.ok) {
        await deps.port.cancelEmailProof({ continuationHash, codeHash });
        return { ok: false as const, code: 'email_send_failed' as const };
      }
      return {
        ok: true as const,
        retryAfterSeconds: OTP_RESEND_COOLDOWN_SEC,
      };
    },

    verifyEmailProof(continuation: string, emailRaw: string, codeRaw: string) {
      const emailNormalized = normalizeEmail(emailRaw);
      const code = codeRaw.trim();
      if (!emailNormalized || !code) {
        return Promise.resolve({ ok: false as const, code: 'invalid_code' as const });
      }
      const continuationHash = hashPatientInviteContinuation(continuation);
      const codeHash = hashPatientInviteEmailCode(code);
      return deps.port.verifyEmailProof({
        continuationHash,
        emailNormalized,
        codeHash,
        ...proofAuthorization({
          action: 'verify',
          continuationHash,
          emailNormalized,
          codeHash,
          proofExpiresEpoch: null,
        }),
      });
    },

    redeemEmailProof(continuation: string, authenticatedPlatformUserId: string) {
      const continuationHash = hashPatientInviteContinuation(continuation);
      return deps.port.redeemEmailProof({
        continuationHash,
        authenticatedPlatformUserId,
      });
    },

    claimUnboundEmailProof(continuation: string, emailRaw: string) {
      const emailNormalized = normalizeEmail(emailRaw);
      const continuationHash = hashPatientInviteContinuation(continuation);
      return deps.port.claimUnboundEmailProof({
        continuationHash,
        emailNormalized,
        ...proofAuthorization({
          action: 'claim',
          continuationHash,
          emailNormalized,
          codeHash: '',
          proofExpiresEpoch: null,
        }),
      });
    },
  };
}

export type PatientInvitesService = ReturnType<typeof createPatientInvitesService>;

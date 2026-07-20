import { createHash, randomBytes, randomUUID } from "node:crypto";
import { env, integratorWebhookSecret } from "@/config/env";
import { normalizeEmail, startEmailChallenge, consumeEmailChallengeCode } from "@/modules/auth/emailAuth";
import type {
  PatientInviteFailure,
  PatientInviteLifecycleCode,
  PatientInvitesPort,
} from "./ports";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CONTINUATION_TTL_MS = 10 * 60 * 1000;

function invitePepper(): string {
  return integratorWebhookSecret() || env.SESSION_COOKIE_SECRET || "test-patient-invite-pepper";
}

function hashOpaque(value: string, purpose: "bearer" | "continuation"): string {
  return createHash("sha256")
    .update(`patient-invite:${purpose}:v1:${value}:${invitePepper()}`)
    .digest("hex");
}

export function hashPatientInviteBearer(value: string): string {
  return hashOpaque(value, "bearer");
}

export function hashPatientInviteContinuation(value: string): string {
  return hashOpaque(value, "continuation");
}

function opaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

function lifecycleFailure(code: PatientInviteLifecycleCode): PatientInviteFailure {
  return { ok: false, code };
}

type StartEmailChallenge = typeof startEmailChallenge;
type ConsumeEmailChallenge = typeof consumeEmailChallengeCode;

export function createPatientInvitesService(deps: {
  port: PatientInvitesPort;
  startEmailChallenge?: StartEmailChallenge;
  consumeEmailChallenge?: ConsumeEmailChallenge;
}) {
  const startChallenge = deps.startEmailChallenge ?? startEmailChallenge;
  const consumeChallenge = deps.consumeEmailChallenge ?? consumeEmailChallengeCode;

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
      const bearer = opaqueToken();
      const result = await deps.port.createReplacingPending({
        id: randomUUID(),
        organizationId: input.organizationId,
        patientUserId: input.patientUserId,
        tokenHash: hashPatientInviteBearer(bearer),
        invitedEmailNormalized: input.invitedEmail ? normalizeEmail(input.invitedEmail) : null,
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
      if (bearer.length < 32) return lifecycleFailure("invalid_token");
      const continuation = opaqueToken();
      const result = await deps.port.exchangeBearer({
        tokenHash: hashPatientInviteBearer(bearer),
        continuationHash: hashPatientInviteContinuation(continuation),
        continuationExpiresAt: new Date(Date.now() + CONTINUATION_TTL_MS).toISOString(),
      });
      if (!result.ok) return result;
      return {
        ok: true as const,
        kind: "patient" as const,
        continuation,
        preview: result.preview,
      };
    },

    lookupContinuation(continuation: string) {
      if (continuation.length < 32) return Promise.resolve(lifecycleFailure("invalid_continuation"));
      return deps.port.lookupContinuation(hashPatientInviteContinuation(continuation));
    },

    async startEmailProof(continuation: string, emailRaw: string) {
      const emailNormalized = normalizeEmail(emailRaw);
      if (!emailNormalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNormalized)) {
        return { ok: false as const, code: "invalid_email" as const };
      }
      const continuationHash = hashPatientInviteContinuation(continuation);
      const prepared = await deps.port.prepareEmailProof({ continuationHash, emailNormalized });
      if (!prepared.ok) return prepared;
      const challenge = await startChallenge(prepared.patientUserId, emailNormalized);
      if (!challenge.ok) return challenge;
      const bound = await deps.port.bindEmailChallenge({
        continuationHash,
        emailNormalized,
        challengeId: challenge.challengeId,
      });
      if (!bound) return lifecycleFailure("invalid_continuation");
      return {
        ok: true as const,
        retryAfterSeconds: challenge.retryAfterSeconds,
      };
    },

    async redeemEmailProof(continuation: string, code: string) {
      const continuationHash = hashPatientInviteContinuation(continuation);
      const proof = await deps.port.readEmailProof(continuationHash);
      if (!proof) return lifecycleFailure("invalid_continuation");
      const verified = await consumeChallenge(proof.patientUserId, proof.challengeId, code);
      if (!verified.ok) return verified;
      return deps.port.redeemEmailProof({
        continuationHash,
        challengeId: proof.challengeId,
        emailNormalized: proof.emailNormalized,
      });
    },
  };
}

export type PatientInvitesService = ReturnType<typeof createPatientInvitesService>;

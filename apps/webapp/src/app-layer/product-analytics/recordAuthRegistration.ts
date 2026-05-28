import { randomUUID } from "node:crypto";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getPool } from "@/app-layer/db/client";
import { writeAuditLog } from "@/app-layer/admin/auditLog";
import type { AuthRegistrationContactType } from "@/modules/auth/maskContactHint";
import { maskContactHint } from "@/modules/auth/maskContactHint";
import {
  classifyRegistrationErrorCode,
  type RegistrationErrorClass,
} from "@/modules/auth/registrationErrorClass";
import type { ProductAnalyticsEntryChannel } from "@/modules/product-analytics/types";
import { isPlatformUserUuid } from "@/shared/platform-user/isPlatformUserUuid";

export type AuthRegistrationAuthMethod =
  | "email_password"
  | "oauth_yandex"
  | "oauth_google"
  | "oauth_apple"
  | "phone_otp"
  | "messenger_bind"
  | "telegram_init"
  | "max_init"
  | "integrator_exchange";

export type AuthRegistrationStage =
  | "start"
  | "challenge_sent"
  | "confirm"
  | "callback"
  | "session_set";

export type RecordAuthRegistrationBase = {
  attemptId: string;
  authMethod: AuthRegistrationAuthMethod;
  stage: AuthRegistrationStage;
  entryChannel: ProductAnalyticsEntryChannel;
  contactType: AuthRegistrationContactType;
  contactValue?: string | null;
  userId?: string | null;
  challengeId?: string | null;
};

export type RecordAuthRegistrationAttemptParams = RecordAuthRegistrationBase;

export type RecordAuthRegistrationSuccessParams = RecordAuthRegistrationBase & {
  isNewAccount?: boolean;
};

export type RecordAuthRegistrationFailureParams = RecordAuthRegistrationBase & {
  errorCode: string;
  errorClass?: RegistrationErrorClass;
};

export function newRegistrationAttemptId(): string {
  return randomUUID();
}

export function registrationAttemptIdFromOAuthState(
  verified: { attemptId?: string } | null,
  fallback?: string,
): string {
  return verified?.attemptId?.trim() || fallback?.trim() || newRegistrationAttemptId();
}

function buildMetadata(
  params: RecordAuthRegistrationBase & {
    errorCode?: string;
    errorClass?: RegistrationErrorClass;
    isNewAccount?: boolean;
  },
): Record<string, unknown> {
  const contactHint = maskContactHint(params.contactType, params.contactValue ?? null);
  const meta: Record<string, unknown> = {
    attemptId: params.attemptId.trim(),
    authMethod: params.authMethod,
    stage: params.stage,
    contactType: params.contactType,
  };
  if (contactHint) meta.contactHint = contactHint;
  if (params.challengeId?.trim()) meta.challengeId = params.challengeId.trim();
  if (params.errorCode?.trim()) meta.errorCode = params.errorCode.trim();
  if (params.errorClass) meta.errorClass = params.errorClass;
  if (params.isNewAccount === true) meta.isNewAccount = true;
  return meta;
}

async function writeRegistrationEvent(
  eventType: "auth_register_attempt" | "auth_register_success" | "auth_register_failure",
  params: RecordAuthRegistrationBase & {
    errorCode?: string;
    errorClass?: RegistrationErrorClass;
    isNewAccount?: boolean;
  },
): Promise<void> {
  const attemptId = params.attemptId.trim();
  if (!attemptId) return;

  const userId = params.userId?.trim();
  const normalizedUserId =
    userId && isPlatformUserUuid(userId) ? userId : undefined;

  try {
    const deps = buildAppDeps();
    await deps.productAnalytics.recordEventsBatch([
      {
        eventType,
        entryChannel: params.entryChannel,
        userId: normalizedUserId ?? null,
        metadata: buildMetadata(params),
      },
    ]);
  } catch {
    /* analytics must not break auth */
  }

  if (
    eventType === "auth_register_failure" &&
    (params.errorClass ?? classifyRegistrationErrorCode(params.errorCode ?? "")) === "system"
  ) {
    try {
      const pool = getPool();
      await writeAuditLog(pool, {
        actorId: null,
        action: "auth_register_failure",
        targetId: attemptId,
        status: "error",
        details: buildMetadata(params),
      });
    } catch {
      /* audit must not break auth */
    }
  }
}

/** Best-effort registration funnel: attempt (must not throw into auth flow). */
export async function recordAuthRegistrationAttempt(
  params: RecordAuthRegistrationAttemptParams,
): Promise<void> {
  await writeRegistrationEvent("auth_register_attempt", params);
}

/** Best-effort registration funnel: success (must not throw into auth flow). */
export async function recordAuthRegistrationSuccess(
  params: RecordAuthRegistrationSuccessParams,
): Promise<void> {
  await writeRegistrationEvent("auth_register_success", params);
}

/** Best-effort registration funnel: failure (must not throw into auth flow). */
export async function recordAuthRegistrationFailure(
  params: RecordAuthRegistrationFailureParams,
): Promise<void> {
  const errorClass = params.errorClass ?? classifyRegistrationErrorCode(params.errorCode);
  await writeRegistrationEvent("auth_register_failure", { ...params, errorClass });
}

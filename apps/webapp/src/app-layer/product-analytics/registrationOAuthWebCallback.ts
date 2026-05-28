import type { AuthRegistrationAuthMethod } from "@/app-layer/product-analytics/recordAuthRegistration";
import {
  recordAuthRegistrationFailure,
  recordAuthRegistrationSuccess,
} from "@/app-layer/product-analytics/recordAuthRegistration";
import type { AccountOutcome } from "@/modules/auth/oauthYandexResolve";

type OAuthWebCallbackLogBase = {
  attemptId: string;
  authMethod: AuthRegistrationAuthMethod;
  contactValue: string;
};

export async function logOAuthWebCallbackFailure(
  base: OAuthWebCallbackLogBase,
  errorCode: string,
  stage: "callback" | "session_set" = "callback",
  userId?: string | null,
) {
  await recordAuthRegistrationFailure({
    ...base,
    stage,
    entryChannel: "browser",
    contactType: "oauth_provider",
    userId,
    errorCode,
  });
}

export async function logOAuthWebCallbackRegistrationSuccess(
  base: OAuthWebCallbackLogBase,
  accountOutcome: AccountOutcome,
  userId: string,
) {
  if (accountOutcome !== "created") return;
  await recordAuthRegistrationSuccess({
    ...base,
    stage: "session_set",
    entryChannel: "browser",
    contactType: "oauth_provider",
    userId,
    isNewAccount: true,
  });
}

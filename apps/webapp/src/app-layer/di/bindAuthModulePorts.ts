import { bindEmailAuthDbPort } from "@/modules/auth/emailAuth";
import { bindPhoneOtpLimitsDbPort } from "@/modules/auth/phoneOtpLimits";
import { bindDevBypassPlatformUserPhonePort } from "@/modules/auth/devBypassPlatformUserPhonePort";
import { bindAuthRateLimitDbPort } from "@/modules/auth/authRateLimits";
import { bindEmailSendPort } from "@/modules/auth/emailSendPort";
import { bindOAuthUserResolvePort } from "@/modules/auth/oauthUserResolvePort";
import { checkAndRecordAuthRateLimitEvent } from "@/infra/repos/pgAuthRateLimitEvents";
import { pgEmailAuthPort } from "@/infra/repos/pgEmailAuth";
import { pgPhoneOtpLimitsPort } from "@/infra/repos/pgPhoneOtpLimits";
import { pgDevBypassPlatformUserPhonePort } from "@/infra/repos/pgDevBypassPlatformUserPhone";
import { pgOAuthUserResolvePort } from "@/infra/repos/pgOAuthUserResolve";
import { sendEmailCodeViaIntegrator } from "@/infra/integrations/email/integratorEmailAdapter";

let bound = false;

/** Wire auth module DB ports from infra (composition root). Idempotent. */
export function ensureAuthModulePortsBound(): void {
  if (bound) return;
  bindAuthRateLimitDbPort({ checkAndRecord: checkAndRecordAuthRateLimitEvent });
  bindEmailAuthDbPort(pgEmailAuthPort);
  bindPhoneOtpLimitsDbPort(pgPhoneOtpLimitsPort);
  bindDevBypassPlatformUserPhonePort(pgDevBypassPlatformUserPhonePort);
  bindOAuthUserResolvePort(pgOAuthUserResolvePort);
  bindEmailSendPort({
    sendCode: async (to, code) => {
      const result = await sendEmailCodeViaIntegrator(to, code);
      return result.ok ? { ok: true } : { ok: false, error: result.error };
    },
  });
  bound = true;
}

/** Test-only: reset binding guard between cases. */
export function resetAuthModulePortsBindingForTests(): void {
  bound = false;
}

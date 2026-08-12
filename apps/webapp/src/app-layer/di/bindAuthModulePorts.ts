import { bindEmailAuthDbPort } from '@/modules/auth/emailAuth';
import { bindPhoneOtpLimitsDbPort } from '@/modules/auth/phoneOtpLimits';
import { bindDevBypassPlatformUserPhonePort } from '@/modules/auth/devBypassPlatformUserPhonePort';
import { bindDevBypassClinicAdminWorkspacePort } from '@/modules/auth/devBypassClinicAdminWorkspacePort';
import { bindAuthRateLimitDbPort } from '@/modules/auth/authRateLimits';
import { bindChannelLinkDbPort } from '@/modules/auth/channelLink';
import { bindEmailSendPort } from '@/modules/auth/emailSendPort';
import { bindEmailOtpDeliveryQueuePort } from '@/modules/auth/emailOtpDeliveryQueuePort';
import { bindOAuthUserResolvePort } from '@/modules/auth/oauthUserResolvePort';
import { bindSessionUserPort } from '@/modules/auth/sessionUserPort';
import {
  checkAndRecordAuthRateLimitEvent,
  recordAndCountAuthRateLimitEvent,
} from '@/infra/repos/pgAuthRateLimitEvents';
import { pgChannelLinkDbPort } from '@/infra/repos/pgChannelLinkDbPort';
import { pgEmailAuthPort } from '@/infra/repos/pgEmailAuth';
import { pgPhoneOtpLimitsPort } from '@/infra/repos/pgPhoneOtpLimits';
import { pgDevBypassPlatformUserPhonePort } from '@/infra/repos/pgDevBypassPlatformUserPhone';
import { pgDevBypassClinicAdminWorkspacePort } from '@/infra/repos/pgDevBypassClinicAdminWorkspace';
import { pgOAuthUserResolvePort } from '@/infra/repos/pgOAuthUserResolve';
import { pgUserByPhonePort } from '@/infra/repos/pgUserByPhone';
import { sendEmailCodeViaIntegrator } from '@/infra/integrations/email/integratorEmailAdapter';
import { enqueueAuthEmailOtpDelivery } from '@/infra/repos/pgAuthEmailOtpDeliveryQueue';

let bound = false;

/** Wire auth module DB ports from infra (composition root). Idempotent. */
export function ensureAuthModulePortsBound(): void {
  if (bound) return;
  bindAuthRateLimitDbPort({
    checkAndRecord: checkAndRecordAuthRateLimitEvent,
    recordAndCount: recordAndCountAuthRateLimitEvent,
  });
  bindEmailAuthDbPort(pgEmailAuthPort);
  bindPhoneOtpLimitsDbPort(pgPhoneOtpLimitsPort);
  bindDevBypassPlatformUserPhonePort(pgDevBypassPlatformUserPhonePort);
  bindDevBypassClinicAdminWorkspacePort(pgDevBypassClinicAdminWorkspacePort);
  bindOAuthUserResolvePort(pgOAuthUserResolvePort);
  bindSessionUserPort(pgUserByPhonePort);
  bindChannelLinkDbPort(pgChannelLinkDbPort);
  bindEmailSendPort({
    sendCode: async (to, code) => {
      const result = await sendEmailCodeViaIntegrator(to, code);
      return result.ok ? { ok: true } : { ok: false, error: result.error };
    },
  });
  bindEmailOtpDeliveryQueuePort({ enqueue: enqueueAuthEmailOtpDelivery });
  bound = true;
}

/** Test-only: reset binding guard between cases. */
export function resetAuthModulePortsBindingForTests(): void {
  bound = false;
}

import { getAppBaseUrl } from "@/modules/system-settings/integrationRuntime";
import type {
  EmailSetupAccessPort,
  RequestContactEmailSetupParams,
  RequestContactEmailSetupResult,
} from "@/modules/auth/emailSetupAccess/ports";
import { createEmailSetupTokensService } from "@/modules/auth/emailSetupTokens/service";
import type { EmailSetupTokensPort } from "@/modules/auth/emailSetupTokens/ports";
import { sendEmailSetupLinkViaIntegrator } from "@/infra/integrations/email/integratorEmailAdapter";

const SETUP_EMAIL_SUBJECT = "Подтвердите email и создайте доступ к кабинету BersonCare";

function buildSetupEmailText(setupUrl: string): string {
  return [
    "Здравствуйте!",
    "",
    "Для вас создан доступ к личному кабинету BersonCare.",
    "Подтвердите email и задайте пароль по ссылке (действует 24 часа):",
    "",
    setupUrl,
    "",
    "Если вы не запрашивали письмо, просто проигнорируйте его.",
  ].join("\n");
}

export function createPgEmailSetupAccessPort(tokensPort: EmailSetupTokensPort): EmailSetupAccessPort {
  const tokensService = createEmailSetupTokensService(tokensPort);

  return {
    async requestContactEmailSetup(
      params: RequestContactEmailSetupParams,
    ): Promise<RequestContactEmailSetupResult> {
      const issued = await tokensService.issueEmailSetupToken({
        userId: params.userId,
        emailNormalized: params.emailNormalized,
        source: params.source,
        createdByUserId: params.createdByUserId,
      });
      if (!issued.ok) {
        return { ok: false, reason: "not_configured" };
      }

      const appBase = (await getAppBaseUrl()).replace(/\/$/, "");
      if (!appBase) {
        await tokensService.rollbackIssuedToken(issued.tokenId);
        return { ok: false, reason: "not_configured" };
      }

      const setupUrl = `${appBase}/app/auth/email-setup?token=${encodeURIComponent(issued.tokenPlain)}`;
      const sent = await sendEmailSetupLinkViaIntegrator(
        params.emailNormalized,
        SETUP_EMAIL_SUBJECT,
        buildSetupEmailText(setupUrl),
      );
      if (!sent.ok) {
        await tokensService.rollbackIssuedToken(issued.tokenId);
        return { ok: false, reason: "not_configured" };
      }

      return { ok: true, status: "enqueued" };
    },
  };
}

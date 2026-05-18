/**
 * Проверка настройки исходящей почты: `smtp_outbound` в БД или legacy SMTP_* в env.
 * Запуск: `pnpm run mail:check` из `apps/integrator`.
 */
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env') });

import { createDbPort } from '../db/client.js';
import { resolveSmtpOutboundConfig } from '../../config/smtpOutbound.js';
import { isResolvedMailerConfigured } from '../../integrations/email/mailer.js';

async function main(): Promise<void> {
  try {
    const db = createDbPort();
    const resolved = await resolveSmtpOutboundConfig(db);

    if (isResolvedMailerConfigured(resolved)) {
      console.log('Mailer configured (system_settings smtp_outbound or SMTP_* env fallback).');
      console.log(`  SMTP: ${resolved.smtpHost}:${resolved.smtpPort} (secure: ${resolved.smtpSecure})`);
      console.log(`  From: ${resolved.fromAddress}`);
    } else {
      console.log('Mailer not configured (emails will not be sent).');
      console.log(
        'Set SMTP in Admin Settings (smtp_outbound) or MAIL_FROM / SMTP_HOST / SMTP_USER / SMTP_PASS in env.',
      );
    }
  } catch (err) {
    console.error('mail:check failed', err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  }
}

void main();

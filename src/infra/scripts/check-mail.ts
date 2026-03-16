/**
 * Проверка настройки мэйлера (SMTP). Выводит, заданы ли MAIL_FROM и сервер в env.
 * Реальную отправку не выполняет до настройки конкретного сервера.
 * Запуск: pnpm run mail:check
 */
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env') });

import { isMailerConfigured, emailConfig } from '../../integrations/email/index.js';

function main(): void {
  if (isMailerConfigured()) {
    console.log('Mailer configured.');
    console.log(`  SMTP: ${emailConfig.smtpHost}:${emailConfig.smtpPort} (secure: ${emailConfig.smtpSecure})`);
    console.log(`  From: ${emailConfig.fromAddress}`);
  } else {
    console.log('Mailer not configured (emails will not be sent).');
    console.log('Set MAIL_FROM, SMTP_HOST, SMTP_USER, SMTP_PASS in .env to enable.');
  }
}

main();

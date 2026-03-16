import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { defineIntegrationConfig, loadIntegrationEnv } from '../config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const EmailConfigSchema = z.object({
  /** When true, SMTP_HOST and credentials are set and mailer will send. */
  configured: z.boolean(),
  smtpHost: z.string(),
  smtpPort: z.coerce.number().int().min(1).max(65535),
  smtpSecure: z.boolean(),
  smtpUser: z.string(),
  smtpPass: z.string(),
  fromAddress: z.string().email().or(z.literal('')),
});

function loadEmailConfigFromEnv(): z.input<typeof EmailConfigSchema> {
  loadIntegrationEnv(__dirname, 'MAIL_');
  loadIntegrationEnv(__dirname, 'SMTP_');

  const host = process.env.SMTP_HOST?.trim() ?? process.env.MAIL_HOST?.trim() ?? '';
  const portRaw = process.env.SMTP_PORT?.trim() ?? process.env.MAIL_PORT?.trim() ?? '587';
  const secureRaw = process.env.SMTP_SECURE?.trim() ?? process.env.MAIL_SECURE?.trim() ?? '';
  const user = process.env.SMTP_USER?.trim() ?? process.env.MAIL_USER?.trim() ?? '';
  const pass = process.env.SMTP_PASS?.trim() ?? process.env.MAIL_PASS?.trim() ?? '';
  const from = process.env.MAIL_FROM?.trim() ?? process.env.SMTP_FROM?.trim() ?? '';

  const configured =
    host.length > 0 && user.length > 0 && pass.length > 0 && from.length > 0;

  const port = Number(portRaw);
  const smtpPort = Number.isFinite(port) && port > 0 ? port : 587;
  const smtpSecure =
    /^(1|true|yes)$/i.test(secureRaw) || smtpPort === 465;

  return {
    configured,
    smtpHost: host || 'localhost',
    smtpPort,
    smtpSecure,
    smtpUser: user,
    smtpPass: pass,
    fromAddress: from,
  };
}

export const emailConfig = defineIntegrationConfig(
  'email',
  EmailConfigSchema,
  loadEmailConfigFromEnv(),
);

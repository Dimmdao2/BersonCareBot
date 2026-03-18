import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

/**
 * Load KEY=value from integrationDir/.env for keys starting with envPrefix.
 * Does not overwrite existing non-empty process.env (so systemd/EnvironmentFile wins).
 */
export function loadIntegrationEnv(integrationDir: string, envPrefix: string): void {
  const envPath = join(integrationDir, '.env');
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!key.startsWith(envPrefix)) continue;
    const existing = process.env[key]?.trim();
    if (existing !== undefined && existing !== '') continue; // keep systemd/env value
    process.env[key] = value;
  }
}

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : 'root';
      return `${path}: ${issue.message}`;
    })
    .join('; ');
}

/**
 * Validates integration-local config declared next to adapter code.
 * Secrets live in source by explicit project decision.
 */
export function defineIntegrationConfig<const TSchema extends z.ZodTypeAny>(
  integrationId: string,
  schema: TSchema,
  raw: z.input<TSchema>,
): z.output<TSchema> {
  const parsed = schema.safeParse(raw);
  if (parsed.success) return parsed.data;

  throw new Error(`Invalid ${integrationId} integration config: ${formatIssues(parsed.error)}`);
}

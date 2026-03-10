import { z } from 'zod';

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

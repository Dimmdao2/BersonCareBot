import { z } from "zod";

export const integratorMergeBodySchema = z.object({
  targetId: z.string().uuid(),
  duplicateId: z.string().uuid(),
  dryRun: z.boolean().optional(),
});

export const platformUserMergePrecheckRowSchema = z.object({
  id: z.string().uuid(),
  role: z.string(),
  merged_into_id: z.string().uuid().nullable(),
  integrator_user_id: z.string().nullable(),
});

export const integratorMergeHttpErrorSchema = z.object({
  error: z.string().optional(),
  missingIntegratorUserIds: z.array(z.string()).optional(),
  message: z.string().optional(),
  ok: z.boolean().optional(),
});

export function parseIntegratorMergeHttpError(
  bodyText: string,
): z.infer<typeof integratorMergeHttpErrorSchema> | null {
  try {
    const json: unknown = JSON.parse(bodyText);
    const parsed = integratorMergeHttpErrorSchema.safeParse(json);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Full integrator HTTP body for operator-facing `details` (legacy parity: any JSON value, else raw text). */
export function parseIntegratorMergeHttpDetails(bodyText: string): unknown {
  try {
    const json: unknown = JSON.parse(bodyText);
    if (json !== null && typeof json === "object" && !Array.isArray(json)) {
      integratorMergeHttpErrorSchema.safeParse(json);
    }
    return json;
  } catch {
    return bodyText;
  }
}

export function integratorUserIdNumericKey(id: string): string {
  return String(BigInt(id.trim()));
}

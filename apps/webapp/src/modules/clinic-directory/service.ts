import type { ClinicDirectoryPort } from "./ports";

export type ClinicDirectoryService = {
  resolveOrganizationIdBySlug(slug: string): Promise<string | null>;
};

/** Public slug charset: lower-case ascii letters, digits and hyphens, matching the DB check constraint. */
const SLUG_PATTERN = /^[a-z0-9-]{1,120}$/;

export function createClinicDirectoryService(port: ClinicDirectoryPort): ClinicDirectoryService {
  return {
    async resolveOrganizationIdBySlug(slugRaw: string) {
      const slug = slugRaw.trim().toLowerCase();
      // Reject obviously-invalid input before it reaches the DB chokepoint; still fail-closed
      // (null), never throws, so callers cannot distinguish malformed input from unknown slug.
      if (!SLUG_PATTERN.test(slug)) return null;
      return port.resolveOrganizationIdBySlug(slug);
    },
  };
}

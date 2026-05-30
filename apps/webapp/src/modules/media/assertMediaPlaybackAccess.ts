import type { AppSession } from "@/shared/types/session";
import {
  canAccessProgramSubmissionMedia,
  type ProgramSubmissionAccessRow,
} from "@/modules/media/programSubmissionPlaybackAccess";

/**
 * Phase-04 baseline: authenticated session required.
 * When `accessRow` is provided, enforces program_item_submission ACL (P14).
 */
export function assertMediaPlaybackAccess(
  session: AppSession | null,
  accessRow?: ProgramSubmissionAccessRow | null,
): session is AppSession {
  if (session == null) return false;
  if (accessRow && !canAccessProgramSubmissionMedia(session, accessRow)) return false;
  return true;
}

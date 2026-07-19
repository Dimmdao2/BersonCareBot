import { canAccessDoctor } from "@/modules/roles/service";
import type { AppSession } from "@/shared/types/session";

export type ProgramSubmissionAccessRow = {
  usagePurpose: string | null;
  uploadedBy: string;
};

/**
 * P14: submission media — uploader patient or doctor/admin only.
 * Precondition: the repository already restricted the row to the active organization.
 */
export function canAccessProgramSubmissionMedia(
  session: AppSession,
  row: ProgramSubmissionAccessRow,
): boolean {
  if (row.usagePurpose !== "program_item_submission") return true;
  if (session.user.userId === row.uploadedBy) return true;
  if (session.user.role === "admin" || canAccessDoctor(session.user.role)) return true;
  return false;
}

import type { LegacyBranchProjectionPort } from "./ports";

/** Map Rubitime branch id → legacy `branches.id` for `appointment_records.branch_id` FK. */
export async function resolveLegacyBranchIdForProjection(
  branches: LegacyBranchProjectionPort | null | undefined,
  rubitimeBranchIdSnapshot: string | null | undefined,
  branchTitle: string | null | undefined,
): Promise<string | null> {
  const rb = rubitimeBranchIdSnapshot?.trim();
  if (!rb || !branches) return null;
  const integratorBranchId = Number(rb);
  if (!Number.isFinite(integratorBranchId)) return null;
  try {
    const { branchId } = await branches.upsertFromProjection({
      integratorBranchId,
      name: branchTitle ?? null,
    });
    return branchId;
  } catch {
    return null;
  }
}

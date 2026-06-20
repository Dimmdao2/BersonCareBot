import { apiJson } from "@/shared/lib/apiJson";

/**
 * Doctor-self-scoped bootstrap for the «График работы» editor.
 *
 * The editor previously bootstrapped via the admin booking-engine overview, which 403s for
 * the `doctor` role (solo owner logs in as a doctor). This reads the doctor-accessible
 * overview instead and resolves the doctor's own specialist. It never creates a specialist
 * (catalog setup is admin-only) — absence surfaces as a clear "not configured" state.
 */

export type DoctorScheduleBranch = {
  id: string;
  title: string;
  shortTitle: string | null;
  isActive: boolean;
};

type DoctorOverviewResponse = {
  ok?: boolean;
  organizationId: string;
  organization: { id: string; title: string } | null;
  branches: {
    id: string;
    title: string;
    shortTitle: string | null;
    isActive: boolean;
  }[];
  specialists: { id: string; fullName: string; isActive: boolean }[];
};

export type DoctorScheduleBootstrap = {
  organizationTitle: string | undefined;
  branches: DoctorScheduleBranch[];
  /** The doctor's own specialist id, or null when the org has no specialist yet. */
  specialistId: string | null;
};

const OVERVIEW = "/api/doctor/booking-engine/overview";

export async function fetchDoctorScheduleBootstrap(): Promise<DoctorScheduleBootstrap | null> {
  let overview: DoctorOverviewResponse;
  try {
    overview = await apiJson<DoctorOverviewResponse>(OVERVIEW);
  } catch (e) {
    if (e instanceof Error && e.message === "booking_engine_unavailable") return null;
    throw e;
  }
  const branches = overview.branches
    .filter((b) => b.isActive)
    .map((b) => ({ id: b.id, title: b.title, shortTitle: b.shortTitle, isActive: b.isActive }));
  const ownSpecialist =
    overview.specialists.find((s) => s.isActive) ?? overview.specialists[0] ?? null;
  return {
    organizationTitle: overview.organization?.title,
    branches,
    specialistId: ownSpecialist?.id ?? null,
  };
}

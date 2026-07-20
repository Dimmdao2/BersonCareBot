import { z } from "zod";
import { routePaths } from "@/app-layer/routes/paths";

const organizationIdSchema = z.string().uuid();

export function parsePatientReminderOrganizationTarget(raw: string | undefined): string | null {
  const parsed = organizationIdSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function buildPatientReminderOrganizationOpener(
  kind: "daily-warmup" | "plan-start-lesson",
  organizationId: string,
): string {
  const search = new URLSearchParams({
    kind: "organization_go",
    organizationId,
    goKind: kind,
  });
  return `/api/patient/organization-context/open?${search.toString()}`;
}

export function addPatientOrganizationChangedNotice(path: string, changed: boolean): string {
  if (!changed) return path;
  const url = new URL(path, "http://patient.local");
  url.searchParams.set("organizationChanged", "1");
  return `${url.pathname}${url.search}`;
}

export function patientOrganizationRecoveryPath(
  reason: "reminder_target_missing" | "organization_unavailable",
): string {
  return `${routePaths.patientOrganizations}?reason=${reason}`;
}

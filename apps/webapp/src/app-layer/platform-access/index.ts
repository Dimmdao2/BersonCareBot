import { ensurePlatformAccessPortsBound } from "@/app-layer/di/bindPlatformAccessPorts";
import type { AppSession } from "@/shared/types/session";
import type { EntitlementsService } from "@/modules/entitlements/service";
import {
  canViewPatientAuthOnlySection as canViewPatientAuthOnlySectionModule,
  filterPatientSectionPages as filterPatientSectionPagesModule,
  patientClientBusinessGate as patientClientBusinessGateModule,
  resolvePatientCanViewAuthOnlyContent as resolvePatientCanViewAuthOnlyContentModule,
  resolvePatientCanViewContent as resolvePatientCanViewContentModule,
  resolvePlatformAccessContext as resolvePlatformAccessContextModule,
  type ResolvePlatformAccessContextInput,
} from "@/modules/platform-access";

export type { PatientBusinessGate } from "@/modules/platform-access";
export type { PlatformAccessContext } from "@/modules/platform-access";

type PageRow = { slug: string; requiresAuth: boolean };

export async function resolvePlatformAccessContext(input: ResolvePlatformAccessContextInput) {
  ensurePlatformAccessPortsBound();
  return resolvePlatformAccessContextModule(input);
}

export async function patientClientBusinessGate(session: AppSession) {
  ensurePlatformAccessPortsBound();
  return patientClientBusinessGateModule(session);
}

export async function resolvePatientCanViewAuthOnlyContent(session: AppSession | null): Promise<boolean> {
  ensurePlatformAccessPortsBound();
  return resolvePatientCanViewAuthOnlyContentModule(session);
}

export async function resolvePatientCanViewContent(
  session: AppSession | null,
  contentSlug: string,
  entitlements: EntitlementsService | null,
): Promise<boolean> {
  ensurePlatformAccessPortsBound();
  return resolvePatientCanViewContentModule(session, contentSlug, entitlements);
}

export async function canViewPatientAuthOnlySection(
  session: AppSession | null,
  sectionRequiresAuth: boolean,
  pagesInSection: PageRow[],
  entitlements: EntitlementsService | null,
): Promise<boolean> {
  ensurePlatformAccessPortsBound();
  return canViewPatientAuthOnlySectionModule(session, sectionRequiresAuth, pagesInSection, entitlements);
}

export async function filterPatientSectionPages<T extends PageRow>(
  session: AppSession | null,
  pages: T[],
  entitlements: EntitlementsService | null,
): Promise<T[]> {
  ensurePlatformAccessPortsBound();
  return filterPatientSectionPagesModule(session, pages, entitlements);
}

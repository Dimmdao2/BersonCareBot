import type { AppSession } from "@/shared/types/session";
import type { EntitlementsService } from "@/modules/entitlements/service";
import { resolvePatientCanViewAuthOnlyContent } from "./resolvePatientCanViewAuthOnlyContent";

type PageRow = { slug: string; requiresAuth: boolean };

export async function canViewPatientAuthOnlySection(
  session: AppSession | null,
  sectionRequiresAuth: boolean,
  pagesInSection: PageRow[],
  entitlements: EntitlementsService | null,
): Promise<boolean> {
  if (!sectionRequiresAuth) return true;
  if (await resolvePatientCanViewAuthOnlyContent(session)) return true;
  if (!session?.user?.userId || session.user.role !== "client" || !entitlements) return false;
  for (const page of pagesInSection) {
    if (!page.requiresAuth) continue;
    if (await entitlements.hasActiveContentGrant(session.user.userId, page.slug)) return true;
  }
  return false;
}

export async function filterPatientSectionPages<T extends PageRow>(
  session: AppSession | null,
  pages: T[],
  entitlements: EntitlementsService | null,
): Promise<T[]> {
  const tierOk = await resolvePatientCanViewAuthOnlyContent(session);
  if (tierOk) return pages;
  const out: T[] = [];
  for (const page of pages) {
    if (!page.requiresAuth) {
      out.push(page);
      continue;
    }
    if (session?.user?.userId && session.user.role === "client" && entitlements) {
      if (await entitlements.hasActiveContentGrant(session.user.userId, page.slug)) {
        out.push(page);
      }
    }
  }
  return out;
}

import { and, eq, isNull, ne, or } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import { getCurrentDbPrincipalOrganizationId } from "@bersoncare/db-principal";
import { createPgOrgEntitlementsPort } from "@/infra/repos/pgOrgEntitlements";
import { isMechanicEnabled } from "@/modules/org-entitlements/service";
import { clinicalTests } from "../../../db/schema/clinicalTests";
import { recommendations } from "../../../db/schema/recommendations";
import {
  contentPages,
  lfkComplexTemplates,
  lfkExercises,
} from "../../../db/schema/schema";
import type { TreatmentProgramItemRefValidationPort } from "@/modules/treatment-program/ports";
import type { TreatmentProgramItemType, TreatmentProgramLibraryPickType } from "@/modules/treatment-program/types";
import {
  LESSON_CONTENT_SECTION,
  LESSON_CONTENT_SECTION_LEGACY,
} from "@/modules/treatment-program/types";

function notFound(type: TreatmentProgramLibraryPickType): Error {
  return new Error(`Объект для типа «${type}» не найден или недоступен`);
}

/** Валидация полиморфной ссылки `item_ref_id` по типу — без FK в БД. */
export function createPgTreatmentProgramItemRefValidationPort(): TreatmentProgramItemRefValidationPort {
  const orgEntitlements = createPgOrgEntitlementsPort();
  return {
    async assertItemRefExists(type: TreatmentProgramLibraryPickType, itemRefId: string, organizationId?: string): Promise<void> {
      const db = getDrizzle();
      const scopedOrganizationId = organizationId ?? getCurrentDbPrincipalOrganizationId();
      if (!scopedOrganizationId) throw notFound(type);
      switch (type) {
        case "exercise": {
          const includePlatformBase = await isMechanicEnabled(
            orgEntitlements,
            scopedOrganizationId,
            "exercise_catalog",
          );
          const row = await db.query.lfkExercises.findFirst({
            where: and(
              eq(lfkExercises.id, itemRefId),
              eq(lfkExercises.isArchived, false),
              or(
                and(
                  eq(lfkExercises.ownerKind, "organization"),
                  eq(lfkExercises.organizationId, scopedOrganizationId),
                ),
                includePlatformBase
                  ? and(eq(lfkExercises.ownerKind, "platform"), isNull(lfkExercises.organizationId))
                  : undefined,
              ),
            ),
          });
          if (!row) throw notFound(type);
          return;
        }
        case "lfk_complex": {
          const includePlatformBase = await isMechanicEnabled(
            orgEntitlements,
            scopedOrganizationId,
            "exercise_catalog",
          );
          const row = await db.query.lfkComplexTemplates.findFirst({
            where: and(
              eq(lfkComplexTemplates.id, itemRefId),
              ne(lfkComplexTemplates.status, "archived"),
              or(
                and(
                  eq(lfkComplexTemplates.ownerKind, "organization"),
                  eq(lfkComplexTemplates.organizationId, scopedOrganizationId),
                ),
                includePlatformBase
                  ? and(eq(lfkComplexTemplates.ownerKind, "platform"), isNull(lfkComplexTemplates.organizationId))
                  : undefined,
              ),
            ),
          });
          if (!row) throw notFound(type);
          return;
        }
        case "clinical_test": {
          const row = await db.query.clinicalTests.findFirst({
            where: and(eq(clinicalTests.id, itemRefId), eq(clinicalTests.organizationId, scopedOrganizationId), eq(clinicalTests.isArchived, false)),
          });
          if (!row) throw notFound(type);
          return;
        }
        case "recommendation": {
          const row = await db.query.recommendations.findFirst({
            where: and(eq(recommendations.id, itemRefId), eq(recommendations.organizationId, scopedOrganizationId), eq(recommendations.isArchived, false)),
          });
          if (!row) throw notFound(type);
          return;
        }
        case "lesson": {
          const row = await db.query.contentPages.findFirst({
            where: and(
              eq(contentPages.id, itemRefId),
              eq(contentPages.organizationId, scopedOrganizationId),
              or(
                eq(contentPages.section, LESSON_CONTENT_SECTION),
                eq(contentPages.section, LESSON_CONTENT_SECTION_LEGACY),
              ),
              isNull(contentPages.deletedAt),
            ),
          });
          if (!row) throw notFound(type);
          return;
        }
        default: {
          const _x: never = type;
          throw new Error(`Неизвестный тип элемента: ${String(_x)}`);
        }
      }
    },
  };
}

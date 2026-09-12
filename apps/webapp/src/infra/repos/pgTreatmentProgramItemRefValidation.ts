import { and, eq, isNull, ne, or, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { getDrizzle } from '@/app-layer/db/drizzle';
import { getCurrentDbPrincipalOrganizationId } from '@bersoncare/db-principal';
import { createPgOrgEntitlementsPort } from '@/infra/repos/pgOrgEntitlements';
import { isMechanicEnabled } from '@/modules/org-entitlements/service';
import { clinicalTests } from '../../../db/schema/clinicalTests';
import { recommendations } from '../../../db/schema/recommendations';
import { contentPages, lfkComplexTemplates, lfkExercises } from '../../../db/schema/schema';
import type { TreatmentProgramItemRefValidationPort } from '@/modules/treatment-program/ports';
import type {
  TreatmentProgramItemType,
  TreatmentProgramLibraryPickType,
} from '@/modules/treatment-program/types';
import {
  LESSON_CONTENT_SECTION,
  LESSON_CONTENT_SECTION_LEGACY,
} from '@/modules/treatment-program/types';

function notFound(type: TreatmentProgramLibraryPickType): Error {
  return new Error(`Объект для типа «${type}» не найден или недоступен`);
}

/**
 * Владение строкой каталога при проверке ссылки: своя строка организации ИЛИ платформенная база,
 * когда тариф `exercise_catalog` её открыл.
 *
 * Вынесено в одно место осознанно: пока условие переписывалось в каждую ветку `switch` руками, две
 * ветки из четырёх (`clinical_test`, `recommendation`) остались без платформенного слоя — врач
 * получал 500 на материал, который библиотека этапа сама ему и предложила (S0б, 12.09.2026).
 */
export function itemRefOwnershipPredicate(
  ownerKind: AnyPgColumn,
  organizationId: AnyPgColumn,
  scopedOrganizationId: string,
  includePlatformBase: boolean,
): SQL | undefined {
  return or(
    and(eq(ownerKind, 'organization'), eq(organizationId, scopedOrganizationId)),
    includePlatformBase ? and(eq(ownerKind, 'platform'), isNull(organizationId)) : undefined,
  );
}

/** Валидация полиморфной ссылки `item_ref_id` по типу — без FK в БД. */
export function createPgTreatmentProgramItemRefValidationPort(): TreatmentProgramItemRefValidationPort {
  const orgEntitlements = createPgOrgEntitlementsPort();
  return {
    async assertItemRefExists(
      type: TreatmentProgramLibraryPickType,
      itemRefId: string,
      organizationId?: string,
    ): Promise<void> {
      const db = getDrizzle();
      const scopedOrganizationId = organizationId ?? getCurrentDbPrincipalOrganizationId();
      if (!scopedOrganizationId) throw notFound(type);
      switch (type) {
        case 'exercise': {
          const includePlatformBase = await isMechanicEnabled(
            orgEntitlements,
            scopedOrganizationId,
            'exercise_catalog',
          );
          const row = await db.query.lfkExercises.findFirst({
            where: and(
              eq(lfkExercises.id, itemRefId),
              eq(lfkExercises.isArchived, false),
              eq(lfkExercises.catalogScope, 'catalog'),
              itemRefOwnershipPredicate(
                lfkExercises.ownerKind,
                lfkExercises.organizationId,
                scopedOrganizationId,
                includePlatformBase,
              ),
            ),
          });
          if (!row) throw notFound(type);
          return;
        }
        case 'lfk_complex': {
          const includePlatformBase = await isMechanicEnabled(
            orgEntitlements,
            scopedOrganizationId,
            'exercise_catalog',
          );
          const row = await db.query.lfkComplexTemplates.findFirst({
            where: and(
              eq(lfkComplexTemplates.id, itemRefId),
              ne(lfkComplexTemplates.status, 'archived'),
              itemRefOwnershipPredicate(
                lfkComplexTemplates.ownerKind,
                lfkComplexTemplates.organizationId,
                scopedOrganizationId,
                includePlatformBase,
              ),
            ),
          });
          if (!row) throw notFound(type);
          return;
        }
        case 'clinical_test': {
          const includePlatformBase = await isMechanicEnabled(
            orgEntitlements,
            scopedOrganizationId,
            'exercise_catalog',
          );
          const row = await db.query.clinicalTests.findFirst({
            where: and(
              eq(clinicalTests.id, itemRefId),
              eq(clinicalTests.isArchived, false),
              itemRefOwnershipPredicate(
                clinicalTests.ownerKind,
                clinicalTests.organizationId,
                scopedOrganizationId,
                includePlatformBase,
              ),
            ),
          });
          if (!row) throw notFound(type);
          return;
        }
        case 'recommendation': {
          const includePlatformBase = await isMechanicEnabled(
            orgEntitlements,
            scopedOrganizationId,
            'exercise_catalog',
          );
          const row = await db.query.recommendations.findFirst({
            where: and(
              eq(recommendations.id, itemRefId),
              eq(recommendations.isArchived, false),
              itemRefOwnershipPredicate(
                recommendations.ownerKind,
                recommendations.organizationId,
                scopedOrganizationId,
                includePlatformBase,
              ),
            ),
          });
          if (!row) throw notFound(type);
          return;
        }
        case 'lesson': {
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

import type { PatientHomeBlock, PatientHomeBlockCode, PatientHomeBlockItem } from "./ports";
import {
  type KnownPatientHomeRefs,
  listUnresolvedPatientHomeBlockItems,
} from "./patientHomeUnresolvedRefs";

export type PatientHomeBlockRuntimeStatusKind = "hidden" | "empty" | "ready";

export type PatientHomeBlockRuntimeStatus = {
  blockCode: PatientHomeBlockCode;
  kind: PatientHomeBlockRuntimeStatusKind;
  visibleResolvedItems: number;
  visibleConfiguredItems: number;
  unresolvedConfiguredItems: number;
};

const CMS_RUNTIME_BLOCKS = new Set<PatientHomeBlockCode>([
  "situations",
  "subscription_carousel",
  "sos",
  "courses",
  "daily_warmup",
]);

export type PatientHomeResolverSyncContext = {
  /** Как у резолверов пациента: гость не видит auth-only контент. */
  canViewAuthOnlyContent: boolean;
  /** Slug раздела виден пациенту только если раздел есть и `isVisible`. */
  patientVisibleSectionSlugs: ReadonlySet<string>;
  sectionRequiresAuthBySlug: ReadonlyMap<string, boolean>;
  existingPageSlugs: ReadonlySet<string>;
  pageRequiresAuthBySlug: ReadonlyMap<string, boolean>;
  publishedCourseIds: ReadonlySet<string>;
};

export function buildPatientHomeResolverSyncContext(input: {
  sections: Array<{ slug: string; isVisible: boolean; requiresAuth: boolean }>;
  pages: Array<{ slug: string; requiresAuth: boolean }>;
  courses: Array<{ id: string; status: string }>;
  canViewAuthOnlyContent?: boolean;
}): PatientHomeResolverSyncContext {
  const canViewAuthOnlyContent = input.canViewAuthOnlyContent ?? true;
  const patientVisibleSectionSlugs = new Set(
    input.sections.filter((s) => s.isVisible).map((s) => s.slug),
  );
  const sectionRequiresAuthBySlug = new Map(
    input.sections.map((s) => [s.slug, s.requiresAuth] as const),
  );
  const existingPageSlugs = new Set(input.pages.map((p) => p.slug));
  const pageRequiresAuthBySlug = new Map(
    input.pages.map((p) => [p.slug, p.requiresAuth] as const),
  );
  const publishedCourseIds = new Set(
    input.courses.filter((c) => c.status === "published").map((c) => c.id),
  );
  return {
    canViewAuthOnlyContent,
    patientVisibleSectionSlugs,
    sectionRequiresAuthBySlug,
    existingPageSlugs,
    pageRequiresAuthBySlug,
    publishedCourseIds,
  };
}

function sortVisibleItems(items: PatientHomeBlockItem[]): PatientHomeBlockItem[] {
  return [...items]
    .filter((i) => i.isVisible)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
}

function authOk(requiresAuth: boolean | undefined, canViewAuthOnlyContent: boolean): boolean {
  if (requiresAuth === undefined) return false;
  return !requiresAuth || canViewAuthOnlyContent;
}

/**
 * Синхронная проверка «элемент даст карточку/строку на главной пациента» по тем же правилам,
 * что async-резолверы в `patientHomeResolvers.ts` (без запросов в БД).
 */
export function isPatientHomeItemRuntimeResolvedOnHome(
  blockCode: PatientHomeBlockCode,
  item: PatientHomeBlockItem,
  ctx: PatientHomeResolverSyncContext,
): boolean {
  if (!item.isVisible) return false;

  switch (blockCode) {
    case "situations": {
      if (item.targetType !== "content_section") return false;
      const slug = item.targetRef.trim();
      if (!slug) return false;
      if (!ctx.patientVisibleSectionSlugs.has(slug)) return false;
      const req = ctx.sectionRequiresAuthBySlug.get(slug);
      return authOk(req, ctx.canViewAuthOnlyContent);
    }
    case "daily_warmup": {
      if (item.targetType !== "content_page") return false;
      const slug = item.targetRef.trim();
      if (!slug || !ctx.existingPageSlugs.has(slug)) return false;
      const req = ctx.pageRequiresAuthBySlug.get(slug);
      return authOk(req, ctx.canViewAuthOnlyContent);
    }
    case "courses": {
      if (item.targetType !== "course") return false;
      const id = item.targetRef.trim();
      if (!id) return false;
      return ctx.publishedCourseIds.has(id);
    }
    case "sos": {
      if (item.targetType === "content_section") {
        const slug = item.targetRef.trim();
        if (!slug || !ctx.patientVisibleSectionSlugs.has(slug)) return false;
        const req = ctx.sectionRequiresAuthBySlug.get(slug);
        return authOk(req, ctx.canViewAuthOnlyContent);
      }
      if (item.targetType === "content_page") {
        const slug = item.targetRef.trim();
        if (!slug || !ctx.existingPageSlugs.has(slug)) return false;
        const req = ctx.pageRequiresAuthBySlug.get(slug);
        return authOk(req, ctx.canViewAuthOnlyContent);
      }
      return false;
    }
    case "subscription_carousel": {
      if (item.targetType === "content_section") {
        const slug = item.targetRef.trim();
        if (!slug || !ctx.patientVisibleSectionSlugs.has(slug)) return false;
        const req = ctx.sectionRequiresAuthBySlug.get(slug);
        return authOk(req, ctx.canViewAuthOnlyContent);
      }
      if (item.targetType === "content_page") {
        const slug = item.targetRef.trim();
        if (!slug || !ctx.existingPageSlugs.has(slug)) return false;
        const req = ctx.pageRequiresAuthBySlug.get(slug);
        return authOk(req, ctx.canViewAuthOnlyContent);
      }
      if (item.targetType === "course") {
        const id = item.targetRef.trim();
        if (!id) return false;
        return ctx.publishedCourseIds.has(id);
      }
      return false;
    }
    default:
      return false;
  }
}

function isCmsRuntimeBlock(code: PatientHomeBlockCode): boolean {
  return CMS_RUNTIME_BLOCKS.has(code);
}

export function computePatientHomeBlockRuntimeStatus(
  block: PatientHomeBlock,
  args: { knownRefs: KnownPatientHomeRefs; resolverSync: PatientHomeResolverSyncContext },
): PatientHomeBlockRuntimeStatus {
  const visibleConfiguredItems = block.items.filter((i) => i.isVisible).length;
  const unresolvedConfiguredItems = listUnresolvedPatientHomeBlockItems(block, args.knownRefs).length;

  if (!block.isVisible) {
    const visibleResolvedItems = isCmsRuntimeBlock(block.code)
      ? sortVisibleItems(block.items).filter((i) =>
          isPatientHomeItemRuntimeResolvedOnHome(block.code, i, args.resolverSync),
        ).length
      : 0;
    return {
      blockCode: block.code,
      kind: "hidden",
      visibleResolvedItems,
      visibleConfiguredItems,
      unresolvedConfiguredItems,
    };
  }

  if (!isCmsRuntimeBlock(block.code)) {
    return {
      blockCode: block.code,
      kind: "ready",
      visibleResolvedItems: 0,
      visibleConfiguredItems,
      unresolvedConfiguredItems,
    };
  }

  const visibleResolvedItems = sortVisibleItems(block.items).filter((i) =>
    isPatientHomeItemRuntimeResolvedOnHome(block.code, i, args.resolverSync),
  ).length;

  const kind: PatientHomeBlockRuntimeStatusKind =
    visibleResolvedItems === 0 ? "empty" : "ready";

  return {
    blockCode: block.code,
    kind,
    visibleResolvedItems,
    visibleConfiguredItems,
    unresolvedConfiguredItems,
  };
}

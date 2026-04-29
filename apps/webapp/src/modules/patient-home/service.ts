import type { ContentPagesPort } from "@/infra/repos/pgContentPages";
import type { ContentSectionRow, ContentSectionsPort } from "@/infra/repos/pgContentSections";
import type { CoursesPort } from "@/modules/courses/ports";
import type { PatientHomeBlockItemRecord, PatientHomeBlocksPort } from "@/modules/patient-home/ports";
import {
  PATIENT_HOME_CMS_BLOCK_CODES,
  type PatientHomeBlockItemTargetType,
  type PatientHomeCmsBlockCode,
} from "@/modules/patient-home/blocks";
import type { PatientHomeEditorItemRow } from "@/modules/patient-home/patientHomeEditorDemo";
import { routePaths } from "@/app-layer/routes/paths";

export function patientHomeBlockAllowsTargetType(
  code: PatientHomeCmsBlockCode,
  t: PatientHomeBlockItemTargetType,
): boolean {
  switch (code) {
    case "situations":
      return t === "content_section";
    case "daily_warmup":
      return t === "content_page";
    case "subscription_carousel":
      return true;
    case "sos":
      return t === "content_section" || t === "content_page";
    case "courses":
      return t === "course";
    default: {
      const _x: never = code;
      return _x;
    }
  }
}

type PatientHomeServiceDeps = {
  blocks: PatientHomeBlocksPort;
  contentSections: ContentSectionsPort;
  contentPages: ContentPagesPort;
  courses: CoursesPort;
};

export type PatientHomeRuntimeContext = {
  canViewAuthOnlyContent: boolean;
};

export type PatientHomeRuntimeCarouselItem = {
  id: string;
  title: string;
  subtitle?: string | null;
  href: string;
  imageUrl?: string | null;
  badgeLabel?: string | null;
};

export type PatientHomeRuntimeCourseItem = {
  id: string;
  title: string;
  subtitle?: string | null;
  href: string;
};

export type ResolvedPatientHomeSos = {
  title: string;
  description: string;
  href: string;
  imageUrl: string | null;
};

function warmupHref(slug: string): string {
  return `/app/patient/content/${encodeURIComponent(slug)}?from=daily_warmup`;
}

export function createPatientHomeService(deps: PatientHomeServiceDeps) {
  const { blocks, contentSections, contentPages, courses } = deps;

  async function resolveEditorItemRow(item: PatientHomeBlockItemRecord): Promise<PatientHomeEditorItemRow> {
    const { targetType, targetRef } = item;
    const ref = targetRef.trim();
    if (targetType === "content_section") {
      const sec = await contentSections.getBySlug(ref);
      return {
        id: item.id,
        targetType,
        targetRef: ref,
        title: sec?.title ?? `Неразрешённый раздел (${ref})`,
        isVisible: item.isVisible,
        resolved: Boolean(sec),
      };
    }
    if (targetType === "content_page") {
      const page = await contentPages.getBySlugAllowUnpublished(ref);
      const ok = Boolean(page) && !page?.deletedAt && !page?.archivedAt;
      return {
        id: item.id,
        targetType,
        targetRef: ref,
        title: page?.title ?? `Неразрешённый материал (${ref})`,
        isVisible: item.isVisible,
        resolved: ok,
      };
    }
    if (targetType === "course") {
      const c = await courses.getById(ref);
      const published = Boolean(c && c.status === "published");
      return {
        id: item.id,
        targetType,
        targetRef: ref,
        title: c?.title ?? `Неразрешённый курс (${ref})`,
        isVisible: item.isVisible,
        resolved: published,
      };
    }
    const _e: never = targetType;
    return _e;
  }

  async function getCmsBlockSnapshot(code: PatientHomeCmsBlockCode): Promise<{
    blockVisible: boolean;
    items: PatientHomeEditorItemRow[];
  }> {
    const all = await blocks.listCmsBlocksWithItems();
    const hit = all.find((x) => x.block.code === code);
    if (!hit) {
      return { blockVisible: true, items: [] };
    }
    const rows = await Promise.all(hit.items.map((it) => resolveEditorItemRow(it)));
    return { blockVisible: hit.block.isVisible, items: rows };
  }

  async function listAllCmsBlockSnapshots(): Promise<
    Record<PatientHomeCmsBlockCode, { blockVisible: boolean; items: PatientHomeEditorItemRow[] }>
  > {
    const entries = await Promise.all(
      PATIENT_HOME_CMS_BLOCK_CODES.map(async (code) => [code, await getCmsBlockSnapshot(code)] as const),
    );
    return Object.fromEntries(entries) as Record<
      PatientHomeCmsBlockCode,
      { blockVisible: boolean; items: PatientHomeEditorItemRow[] }
    >;
  }

  async function itemDuplicateInBlock(
    blockCode: PatientHomeCmsBlockCode,
    targetType: PatientHomeBlockItemTargetType,
    targetRef: string,
    excludeItemId?: string,
  ): Promise<boolean> {
    const snap = await getCmsBlockSnapshot(blockCode);
    const ref = targetRef.trim();
    return snap.items.some(
      (i) =>
        i.targetType === targetType &&
        i.targetRef.trim() === ref &&
        (!excludeItemId || i.id !== excludeItemId),
    );
  }

  /** Пациентский runtime: только опубликованное и с учётом видимости разделов. */
  async function resolveSituationSections(
    items: PatientHomeEditorItemRow[],
    ctx: PatientHomeRuntimeContext,
  ): Promise<ContentSectionRow[]> {
    const out: ContentSectionRow[] = [];
    for (const it of items) {
      if (!it.isVisible) continue;
      if (it.targetType !== "content_section") continue;
      const sec = await contentSections.getBySlug(it.targetRef.trim());
      if (!sec || !sec.isVisible) continue;
      if (sec.requiresAuth && !ctx.canViewAuthOnlyContent) continue;
      out.push(sec);
    }
    return out;
  }

  async function resolveDailyWarmupHero(
    items: PatientHomeEditorItemRow[],
    ctx: PatientHomeRuntimeContext,
  ): Promise<{
    title: string;
    summary: string;
    href: string;
    imageUrl: string | null;
    durationMinutes: number | null;
  } | null> {
    const pages = items.filter((i) => i.isVisible && i.targetType === "content_page");
    for (const it of pages) {
      const page = await contentPages.getBySlug(it.targetRef.trim());
      if (!page) continue;
      if (page.requiresAuth && !ctx.canViewAuthOnlyContent) continue;
      return {
        title: page.title,
        summary: page.summary?.trim() || "Короткая разминка перед нагрузкой — мягкий старт для суставов и дыхания.",
        href: warmupHref(page.slug),
        imageUrl: page.imageUrl,
        durationMinutes: null,
      };
    }
    return null;
  }

  async function resolveSubscriptionCarousel(
    items: PatientHomeEditorItemRow[],
    ctx: PatientHomeRuntimeContext,
  ): Promise<PatientHomeRuntimeCarouselItem[]> {
    const out: PatientHomeRuntimeCarouselItem[] = [];
    for (const it of items) {
      if (!it.isVisible) continue;
      if (it.targetType === "content_section") {
        const sec = await contentSections.getBySlug(it.targetRef.trim());
        if (!sec?.isVisible) continue;
        if (sec.requiresAuth && !ctx.canViewAuthOnlyContent) continue;
        out.push({
          id: `sub-sec-${sec.slug}`,
          title: sec.title,
          subtitle: sec.description?.trim() || null,
          href: `/app/patient/sections/${encodeURIComponent(sec.slug)}`,
          imageUrl: sec.coverImageUrl ?? sec.iconImageUrl ?? null,
          badgeLabel: "Раздел",
        });
      } else if (it.targetType === "content_page") {
        const page = await contentPages.getBySlug(it.targetRef.trim());
        if (!page) continue;
        if (page.requiresAuth && !ctx.canViewAuthOnlyContent) continue;
        out.push({
          id: `sub-page-${page.slug}`,
          title: page.title,
          subtitle: page.summary?.trim() || null,
          href: `/app/patient/content/${encodeURIComponent(page.slug)}`,
          imageUrl: page.imageUrl,
          badgeLabel: "Материал",
        });
      } else if (it.targetType === "course") {
        const rows = await courses.listPublished();
        const c = rows.find((r) => r.id === it.targetRef.trim());
        if (!c) continue;
        let introContentSlug: string | null = null;
        if (c.introLessonPageId) {
          const p = await contentPages.getById(c.introLessonPageId);
          if (p?.isPublished && !p.archivedAt && !p.deletedAt) introContentSlug = p.slug;
        }
        out.push({
          id: `sub-course-${c.id}`,
          title: c.title,
          subtitle: c.description,
          href: introContentSlug
            ? `/app/patient/content/${encodeURIComponent(introContentSlug)}`
            : routePaths.patientCourses,
          imageUrl: null,
          badgeLabel: "Курс",
        });
      }
    }
    return out;
  }

  async function resolveSosCard(
    items: PatientHomeEditorItemRow[],
    ctx: PatientHomeRuntimeContext,
    fallbackTopics: { id: string; summary: string }[],
  ): Promise<ResolvedPatientHomeSos | null> {
    for (const it of items) {
      if (!it.isVisible) continue;
      if (it.targetType === "content_page") {
        const page = await contentPages.getBySlug(it.targetRef.trim());
        if (!page) continue;
        if (page.requiresAuth && !ctx.canViewAuthOnlyContent) continue;
        return {
          title: page.title,
          description: page.summary?.trim() || "Памятка",
          href: `/app/patient/content/${encodeURIComponent(page.slug)}`,
          imageUrl: page.imageUrl,
        };
      }
      if (it.targetType === "content_section") {
        const sec = await contentSections.getBySlug(it.targetRef.trim());
        if (!sec?.isVisible) continue;
        if (sec.requiresAuth && !ctx.canViewAuthOnlyContent) continue;
        return {
          title: sec.title,
          description: sec.description?.trim() || "Раздел",
          href: `/app/patient/sections/${encodeURIComponent(sec.slug)}`,
          imageUrl: sec.coverImageUrl ?? sec.iconImageUrl ?? null,
        };
      }
    }
    const topic = fallbackTopics[0] ?? null;
    if (!topic) return null;
    const pageRow = await contentPages.getBySlug(topic.id);
    return {
      title: "Если болит сейчас",
      description: topic.summary,
      href: `/app/patient/content/${encodeURIComponent(topic.id)}`,
      imageUrl: pageRow?.imageUrl ?? null,
    };
  }

  async function resolveCourseRowItems(
    items: PatientHomeEditorItemRow[],
    ctx: PatientHomeRuntimeContext,
  ): Promise<PatientHomeRuntimeCourseItem[]> {
    if (!ctx.canViewAuthOnlyContent) return [];
    const published = await courses.listPublished();
    const out: PatientHomeRuntimeCourseItem[] = [];
    for (const it of items) {
      if (!it.isVisible || it.targetType !== "course") continue;
      const c = published.find((r) => r.id === it.targetRef.trim());
      if (!c) continue;
      let introContentSlug: string | null = null;
      if (c.introLessonPageId) {
        const p = await contentPages.getById(c.introLessonPageId);
        if (p?.isPublished && !p.archivedAt && !p.deletedAt) introContentSlug = p.slug;
      }
      out.push({
        id: c.id,
        title: c.title,
        subtitle: c.description,
        href: introContentSlug
          ? `/app/patient/content/${encodeURIComponent(introContentSlug)}`
          : routePaths.patientCourses,
      });
    }
    return out;
  }

  return {
    resolveEditorItemRow,
    getCmsBlockSnapshot,
    listAllCmsBlockSnapshots,
    itemDuplicateInBlock,
    patientHomeBlockAllowsTargetType,
    resolveSituationSections,
    resolveDailyWarmupHero,
    resolveSubscriptionCarousel,
    resolveSosCard,
    resolveCourseRowItems,
    async setCmsBlockVisible(code: PatientHomeCmsBlockCode, visible: boolean) {
      await blocks.setBlockVisibleByCode(code, visible);
    },
    async reorderCmsBlockItems(blockCode: PatientHomeCmsBlockCode, orderedItemIds: string[]) {
      await blocks.reorderItemsInBlock(blockCode, orderedItemIds);
    },
    async setCmsItemVisible(itemId: string, visible: boolean) {
      await blocks.setItemVisible(itemId, visible);
    },
    async deleteCmsItem(itemId: string) {
      await blocks.deleteItem(itemId);
    },
    async addCmsBlockItem(
      blockCode: PatientHomeCmsBlockCode,
      targetType: PatientHomeBlockItemTargetType,
      targetRef: string,
    ) {
      if (!patientHomeBlockAllowsTargetType(blockCode, targetType)) {
        throw new Error("invalid_target_type_for_block");
      }
      if (await itemDuplicateInBlock(blockCode, targetType, targetRef)) {
        throw new Error("duplicate_block_item");
      }
      return blocks.insertItem(blockCode, { targetType, targetRef });
    },
    async listRefreshedEditorItemsForBlock(blockCode: PatientHomeCmsBlockCode) {
      const snap = await getCmsBlockSnapshot(blockCode);
      return snap.items;
    },
    async assertItemBelongsToBlock(itemId: string, blockCode: PatientHomeCmsBlockCode): Promise<boolean> {
      const row = await blocks.findItemWithBlockCode(itemId);
      return Boolean(row && row.blockCode === blockCode);
    },
  };
}

export type PatientHomeService = ReturnType<typeof createPatientHomeService>;

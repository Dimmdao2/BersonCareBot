import type { PatientHomeBlockItem } from "./ports";

export type PatientHomeResolverDeps = {
  contentSections: {
    getBySlug(slug: string): Promise<{
      slug: string;
      title: string;
      description: string;
      isVisible: boolean;
      requiresAuth: boolean;
      iconImageUrl: string | null;
      coverImageUrl: string | null;
    } | null>;
  };
  contentPages: {
    getBySlug(slug: string): Promise<{
      slug: string;
      title: string;
      summary: string;
      requiresAuth: boolean;
      imageUrl: string | null;
    } | null>;
  };
  courses: {
    getCourseForDoctor(id: string): Promise<{
      id: string;
      title: string;
      description: string | null;
      status: string;
    } | null>;
  };
};

export type ResolvedSituationChip = {
  itemId: string;
  slug: string;
  title: string;
  imageUrl: string | null;
  href: string;
};

export type ResolvedCarouselCard = {
  itemId: string;
  title: string;
  subtitle: string | null;
  imageUrl: string | null;
  badgeLabel: string;
  href: string;
};

export type ResolvedSosCard = {
  itemId: string;
  title: string;
  subtitle: string | null;
  imageUrl: string | null;
  href: string;
};

export type ResolvedCourseCard = {
  itemId: string;
  courseId: string;
  title: string;
  subtitle: string | null;
  href: string;
};

function sortItems(items: PatientHomeBlockItem[]): PatientHomeBlockItem[] {
  return [...items]
    .filter((i) => i.isVisible)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
}

export async function resolveSituationChips(
  items: PatientHomeBlockItem[],
  deps: PatientHomeResolverDeps,
  canViewAuthOnlyContent: boolean,
): Promise<ResolvedSituationChip[]> {
  const out: ResolvedSituationChip[] = [];
  for (const item of sortItems(items)) {
    if (item.targetType !== "content_section") continue;
    const slug = item.targetRef.trim();
    if (!slug) continue;
    const row = await deps.contentSections.getBySlug(slug);
    if (!row?.isVisible) continue;
    if (row.requiresAuth && !canViewAuthOnlyContent) continue;
    out.push({
      itemId: item.id,
      slug: row.slug,
      title: item.titleOverride?.trim() || row.title,
      imageUrl: item.imageUrlOverride ?? row.iconImageUrl ?? row.coverImageUrl,
      href: `/app/patient/sections/${encodeURIComponent(row.slug)}`,
    });
  }
  return out;
}

const DEFAULT_SUBSCRIPTION_BADGE = "По подписке";

export async function resolveSubscriptionCarouselCards(
  items: PatientHomeBlockItem[],
  deps: PatientHomeResolverDeps,
  canViewAuthOnlyContent: boolean,
): Promise<ResolvedCarouselCard[]> {
  const out: ResolvedCarouselCard[] = [];
  for (const item of sortItems(items)) {
    const badge = item.badgeLabel?.trim() || DEFAULT_SUBSCRIPTION_BADGE;
    if (item.targetType === "content_section") {
      const slug = item.targetRef.trim();
      if (!slug) continue;
      const row = await deps.contentSections.getBySlug(slug);
      if (!row?.isVisible) continue;
      if (row.requiresAuth && !canViewAuthOnlyContent) continue;
      out.push({
        itemId: item.id,
        title: item.titleOverride?.trim() || row.title,
        subtitle: item.subtitleOverride?.trim() || row.description || null,
        imageUrl: item.imageUrlOverride ?? row.coverImageUrl ?? row.iconImageUrl,
        badgeLabel: badge,
        href: `/app/patient/sections/${encodeURIComponent(row.slug)}`,
      });
      continue;
    }
    if (item.targetType === "content_page") {
      const slug = item.targetRef.trim();
      if (!slug) continue;
      const row = await deps.contentPages.getBySlug(slug);
      if (!row) continue;
      if (row.requiresAuth && !canViewAuthOnlyContent) continue;
      out.push({
        itemId: item.id,
        title: item.titleOverride?.trim() || row.title,
        subtitle: item.subtitleOverride?.trim() || row.summary || null,
        imageUrl: item.imageUrlOverride ?? row.imageUrl,
        badgeLabel: badge,
        href: `/app/patient/content/${encodeURIComponent(row.slug)}`,
      });
      continue;
    }
    if (item.targetType === "course") {
      const id = item.targetRef.trim();
      if (!id) continue;
      const row = await deps.courses.getCourseForDoctor(id);
      if (!row || row.status !== "published") continue;
      out.push({
        itemId: item.id,
        title: item.titleOverride?.trim() || row.title,
        subtitle: item.subtitleOverride?.trim() || row.description || null,
        imageUrl: item.imageUrlOverride,
        badgeLabel: badge,
        href: `/app/patient/courses?highlight=${encodeURIComponent(row.id)}`,
      });
    }
  }
  return out;
}

export async function resolveSosCard(
  items: PatientHomeBlockItem[],
  deps: PatientHomeResolverDeps,
  canViewAuthOnlyContent: boolean,
): Promise<ResolvedSosCard | null> {
  for (const item of sortItems(items)) {
    if (item.targetType === "content_section") {
      const slug = item.targetRef.trim();
      if (!slug) continue;
      const row = await deps.contentSections.getBySlug(slug);
      if (!row?.isVisible) continue;
      if (row.requiresAuth && !canViewAuthOnlyContent) continue;
      return {
        itemId: item.id,
        title: item.titleOverride?.trim() || row.title,
        subtitle: item.subtitleOverride?.trim() || row.description || null,
        imageUrl: item.imageUrlOverride ?? row.coverImageUrl ?? row.iconImageUrl,
        href: `/app/patient/sections/${encodeURIComponent(row.slug)}`,
      };
    }
    if (item.targetType === "content_page") {
      const slug = item.targetRef.trim();
      if (!slug) continue;
      const row = await deps.contentPages.getBySlug(slug);
      if (!row) continue;
      if (row.requiresAuth && !canViewAuthOnlyContent) continue;
      return {
        itemId: item.id,
        title: item.titleOverride?.trim() || row.title,
        subtitle: item.subtitleOverride?.trim() || row.summary || null,
        imageUrl: item.imageUrlOverride ?? row.imageUrl,
        href: `/app/patient/content/${encodeURIComponent(row.slug)}`,
      };
    }
  }
  return null;
}

export async function resolveCourseRowCards(
  items: PatientHomeBlockItem[],
  deps: PatientHomeResolverDeps,
): Promise<ResolvedCourseCard[]> {
  const out: ResolvedCourseCard[] = [];
  for (const item of sortItems(items)) {
    if (item.targetType !== "course") continue;
    const id = item.targetRef.trim();
    if (!id) continue;
    const row = await deps.courses.getCourseForDoctor(id);
    if (!row || row.status !== "published") continue;
    out.push({
      itemId: item.id,
      courseId: row.id,
      title: item.titleOverride?.trim() || row.title,
      subtitle: item.subtitleOverride?.trim() || row.description || null,
      href: `/app/patient/courses?highlight=${encodeURIComponent(row.id)}`,
    });
  }
  return out;
}

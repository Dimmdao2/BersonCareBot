import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import { contentPages } from "../../../db/schema/schema";

export type ContentPageRow = {
  id: string;
  section: string;
  slug: string;
  title: string;
  summary: string;
  /** Primary stored content (Markdown). */
  bodyMd: string;
  /** Legacy HTML; used when `bodyMd` is empty. */
  bodyHtml: string;
  sortOrder: number;
  isPublished: boolean;
  /** Если true — только tier patient. */
  requiresAuth: boolean;
  videoUrl: string | null;
  videoType: string | null;
  imageUrl: string | null;
  archivedAt: string | null;
  deletedAt: string | null;
  /** Промо-материал: FK на courses(id), null если не связано. */
  linkedCourseId: string | null;
};

export type ListContentPagesBySectionOpts = {
  /** Если false — только страницы без `requires_auth` (каталог для гостя). @default true */
  viewAuthOnlyPages?: boolean;
};

export type ContentPageLifecyclePatch = {
  isPublished?: boolean;
  archivedAt?: string | null;
  deletedAt?: string | null;
  requiresAuth?: boolean;
};

export type ContentPageUpsertInput = Omit<ContentPageRow, "id" | "archivedAt" | "deletedAt" | "linkedCourseId"> & {
  id?: string;
  linkedCourseId?: string | null;
};

export type ContentPagesPort = {
  listBySection: (section: string, opts?: ListContentPagesBySectionOpts) => Promise<ContentPageRow[]>;
  getBySlug: (slug: string) => Promise<ContentPageRow | null>;
  getById: (id: string) => Promise<ContentPageRow | null>;
  listAll: () => Promise<ContentPageRow[]>;
  upsert: (page: ContentPageUpsertInput) => Promise<string>;
  updateLifecycle: (id: string, patch: ContentPageLifecyclePatch) => Promise<void>;
  /** Устанавливает sort_order по порядку id (0..n-1) только для строк с данным section. */
  reorderInSection: (section: string, orderedIds: string[]) => Promise<void>;
  countPagesWithSectionSlug: (sectionSlug: string) => Promise<number>;
};

const patientVisible = and(
  eq(contentPages.isPublished, true),
  isNull(contentPages.archivedAt),
  isNull(contentPages.deletedAt),
);

function mapDrizzleRow(row: typeof contentPages.$inferSelect): ContentPageRow {
  return {
    id: row.id,
    section: row.section,
    slug: row.slug,
    title: row.title,
    summary: row.summary ?? "",
    bodyMd: row.bodyMd ?? "",
    bodyHtml: row.bodyHtml ?? "",
    sortOrder: row.sortOrder,
    isPublished: row.isPublished,
    requiresAuth: row.requiresAuth,
    videoUrl: row.videoUrl ?? null,
    videoType: row.videoType ?? null,
    imageUrl: row.imageUrl ?? null,
    archivedAt: row.archivedAt ?? null,
    deletedAt: row.deletedAt ?? null,
    linkedCourseId: row.linkedCourseId ?? null,
  };
}

export function createPgContentPagesPort(): ContentPagesPort {
  return {
    async listBySection(section, opts?: ListContentPagesBySectionOpts) {
      const db = getDrizzle();
      const viewAuthOnlyPages = opts?.viewAuthOnlyPages !== false;
      const conds = [
        eq(contentPages.section, section),
        patientVisible,
        ...(viewAuthOnlyPages ? [] : [eq(contentPages.requiresAuth, false)]),
      ];
      const rows = await db
        .select()
        .from(contentPages)
        .where(and(...conds))
        .orderBy(asc(contentPages.sortOrder), asc(contentPages.title));
      return rows.map(mapDrizzleRow);
    },

    async getBySlug(slug) {
      const db = getDrizzle();
      const rows = await db
        .select()
        .from(contentPages)
        .where(and(eq(contentPages.slug, slug), patientVisible))
        .orderBy(asc(contentPages.section))
        .limit(1);
      return rows[0] ? mapDrizzleRow(rows[0]) : null;
    },

    async getById(id) {
      const db = getDrizzle();
      const rows = await db.select().from(contentPages).where(eq(contentPages.id, id)).limit(1);
      return rows[0] ? mapDrizzleRow(rows[0]) : null;
    },

    async listAll() {
      const db = getDrizzle();
      const rows = await db
        .select()
        .from(contentPages)
        .orderBy(asc(contentPages.section), asc(contentPages.sortOrder), asc(contentPages.title));
      return rows.map(mapDrizzleRow);
    },

    async upsert(page) {
      const db = getDrizzle();
      const linked =
        page.linkedCourseId !== undefined && page.linkedCourseId !== null && page.linkedCourseId.trim()
          ? page.linkedCourseId.trim()
          : null;
      const values = {
        section: page.section,
        slug: page.slug,
        title: page.title,
        summary: page.summary,
        bodyMd: page.bodyMd,
        bodyHtml: page.bodyHtml,
        sortOrder: page.sortOrder,
        isPublished: page.isPublished,
        requiresAuth: page.requiresAuth ?? false,
        videoUrl: page.videoUrl,
        videoType: page.videoType,
        imageUrl: page.imageUrl,
        linkedCourseId: linked,
        updatedAt: sql`now()` as unknown as string,
      };
      const rows = await db
        .insert(contentPages)
        .values(values)
        .onConflictDoUpdate({
          target: [contentPages.section, contentPages.slug],
          set: {
            title: page.title,
            summary: page.summary,
            bodyMd: page.bodyMd,
            bodyHtml: page.bodyHtml,
            sortOrder: page.sortOrder,
            isPublished: page.isPublished,
            requiresAuth: page.requiresAuth ?? false,
            videoUrl: page.videoUrl,
            videoType: page.videoType,
            imageUrl: page.imageUrl,
            linkedCourseId: linked,
            updatedAt: sql`now()` as unknown as string,
          },
        })
        .returning({ id: contentPages.id });
      const id = rows[0]?.id;
      if (!id) throw new Error("content_pages upsert returned no id");
      return id;
    },

    async updateLifecycle(id, patch) {
      const db = getDrizzle();
      const setPayload: Partial<typeof contentPages.$inferInsert> = {
        updatedAt: sql`now()` as unknown as string,
      };
      if (patch.isPublished !== undefined) setPayload.isPublished = patch.isPublished;
      if (patch.archivedAt !== undefined) setPayload.archivedAt = patch.archivedAt;
      if (patch.deletedAt !== undefined) setPayload.deletedAt = patch.deletedAt;
      if (patch.requiresAuth !== undefined) setPayload.requiresAuth = patch.requiresAuth;
      if (Object.keys(setPayload).length <= 1) return;
      await db.update(contentPages).set(setPayload).where(eq(contentPages.id, id));
    },

    async reorderInSection(section, orderedIds) {
      if (orderedIds.length === 0) return;
      const db = getDrizzle();
      await db.transaction(async (tx) => {
        const check = await tx
          .select({ id: contentPages.id })
          .from(contentPages)
          .where(eq(contentPages.section, section));
        const inDb = new Set(check.map((r) => r.id));
        if (inDb.size !== orderedIds.length) {
          throw new Error("reorder: count mismatch");
        }
        for (const rowId of orderedIds) {
          if (!inDb.has(rowId)) {
            throw new Error("reorder: unknown id");
          }
        }
        for (let i = 0; i < orderedIds.length; i++) {
          await tx
            .update(contentPages)
            .set({
              sortOrder: i,
              updatedAt: sql`now()` as unknown as string,
            })
            .where(and(eq(contentPages.id, orderedIds[i]!), eq(contentPages.section, section)));
        }
      });
    },

    async countPagesWithSectionSlug(sectionSlug) {
      const db = getDrizzle();
      const rows = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(contentPages)
        .where(eq(contentPages.section, sectionSlug));
      return Number(rows[0]?.count ?? 0);
    },
  };
}

/** Сброс in-memory хранилища между тестами (Vitest). */
export function resetInMemoryContentPagesStoreForTests(): void {
  inMemoryContentPagesStore.length = 0;
}

const inMemoryContentPagesStore: ContentPageRow[] = [];

export const inMemoryContentPagesPort: ContentPagesPort = {
  async listBySection(section, opts) {
    const viewAuthOnlyPages = opts?.viewAuthOnlyPages !== false;
    return inMemoryContentPagesStore
      .filter(
        (p) =>
          p.section === section &&
          p.isPublished &&
          !p.archivedAt &&
          !p.deletedAt &&
          (viewAuthOnlyPages || !p.requiresAuth),
      )
      .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, "ru"));
  },

  async getBySlug(slug) {
    const candidates = inMemoryContentPagesStore.filter(
      (p) => p.slug === slug && p.isPublished && !p.archivedAt && !p.deletedAt,
    );
    candidates.sort((a, b) => a.section.localeCompare(b.section, "ru"));
    return candidates[0] ?? null;
  },

  async getById(id) {
    return inMemoryContentPagesStore.find((p) => p.id === id) ?? null;
  },

  async listAll() {
    return [...inMemoryContentPagesStore].sort(
      (a, b) =>
        a.section.localeCompare(b.section, "ru") || a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, "ru"),
    );
  },

  async upsert(page) {
    const linked = page.linkedCourseId?.trim() ? page.linkedCourseId.trim() : null;
    const existingIdx = inMemoryContentPagesStore.findIndex((p) => p.section === page.section && p.slug === page.slug);
    const archivedAt: string | null = null;
    const deletedAt: string | null = null;
    if (existingIdx >= 0) {
      const prev = inMemoryContentPagesStore[existingIdx]!;
      inMemoryContentPagesStore[existingIdx] = {
        ...prev,
        title: page.title,
        summary: page.summary,
        bodyMd: page.bodyMd,
        bodyHtml: page.bodyHtml,
        sortOrder: page.sortOrder,
        isPublished: page.isPublished,
        requiresAuth: page.requiresAuth ?? false,
        videoUrl: page.videoUrl,
        videoType: page.videoType,
        imageUrl: page.imageUrl,
        linkedCourseId: linked,
      };
      return prev.id;
    }
    const id = page.id ?? crypto.randomUUID();
    inMemoryContentPagesStore.push({
      id,
      section: page.section,
      slug: page.slug,
      title: page.title,
      summary: page.summary,
      bodyMd: page.bodyMd,
      bodyHtml: page.bodyHtml,
      sortOrder: page.sortOrder,
      isPublished: page.isPublished,
      requiresAuth: page.requiresAuth ?? false,
      videoUrl: page.videoUrl,
      videoType: page.videoType,
      imageUrl: page.imageUrl,
      archivedAt,
      deletedAt,
      linkedCourseId: linked,
    });
    return id;
  },

  async updateLifecycle(id, patch) {
    const p = inMemoryContentPagesStore.find((x) => x.id === id);
    if (!p) return;
    if (patch.isPublished !== undefined) p.isPublished = patch.isPublished;
    if (patch.archivedAt !== undefined) p.archivedAt = patch.archivedAt;
    if (patch.deletedAt !== undefined) p.deletedAt = patch.deletedAt;
    if (patch.requiresAuth !== undefined) p.requiresAuth = patch.requiresAuth;
  },

  async reorderInSection(section, orderedIds) {
    const inSection = inMemoryContentPagesStore.filter((p) => p.section === section);
    if (inSection.length !== orderedIds.length) throw new Error("reorder: count mismatch");
    const set = new Set(inSection.map((p) => p.id));
    for (const rowId of orderedIds) {
      if (!set.has(rowId)) throw new Error("reorder: unknown id");
    }
    for (let i = 0; i < orderedIds.length; i++) {
      const p = inMemoryContentPagesStore.find((x) => x.id === orderedIds[i]);
      if (p) p.sortOrder = i;
    }
  },

  async countPagesWithSectionSlug(sectionSlug) {
    return inMemoryContentPagesStore.filter((p) => p.section === sectionSlug).length;
  },
};

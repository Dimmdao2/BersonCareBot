import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { getCurrentDbPrincipalOrganizationId } from '@bersoncare/db-principal';
import { getDrizzle } from '@/app-layer/db/drizzle';
import { runDrizzleMutationTransaction } from '@/infra/db/drizzleMutationTx';
import type {
  ContentPageLifecyclePatch,
  ContentPageRow,
  ContentPagesPort,
  ContentPageUpsertInput,
  ListContentPagesBySectionOpts,
} from '@/modules/content-catalog/ports';
import { contentPages, contentSections } from '../../../db/schema/schema';
import { courses as coursesTable } from '../../../db/schema/courses';

export type {
  ContentPageLifecyclePatch,
  ContentPageRow,
  ContentPagesPort,
  ContentPageUpsertInput,
  ListContentPagesBySectionOpts,
} from '@/modules/content-catalog/ports';

const patientVisible = and(
  eq(contentPages.isPublished, true),
  isNull(contentPages.archivedAt),
  isNull(contentPages.deletedAt),
);

function currentPrincipalOrganizationId(): string {
  const principalOrganizationId = getCurrentDbPrincipalOrganizationId();
  if (!principalOrganizationId) {
    throw new Error('organization_principal_required');
  }
  return principalOrganizationId;
}

/**
 * Content remains publicly resolvable for anonymous legacy routes. Once an
 * authenticated patient or doctor principal is present, every read is limited
 * to that tenant just like the write path.
 */
function currentReadOrganizationId(): string | null {
  return getCurrentDbPrincipalOrganizationId() ?? null;
}

function currentWriteOrganizationId(...fallbacks: (string | null | undefined)[]): string {
  const principalOrganizationId = currentPrincipalOrganizationId();
  const fallbackOrganizationIds = fallbacks.filter((x): x is string => Boolean(x));
  const fallbackOrganizationId = fallbackOrganizationIds[0] ?? null;
  const hasFallbackMismatch = fallbackOrganizationIds.some((id) => id !== fallbackOrganizationId);
  if (
    hasFallbackMismatch ||
    (fallbackOrganizationId && principalOrganizationId !== fallbackOrganizationId)
  ) {
    throw new Error('organization_principal_mismatch');
  }
  return principalOrganizationId;
}

type ContentPagesMutationTx = ReturnType<typeof getDrizzle>;

async function assertContentPageSectionOrganization(
  tx: ContentPagesMutationTx,
  section: string,
): Promise<void> {
  const [row] = await tx
    .select({ organizationId: contentSections.organizationId })
    .from(contentSections)
    .where(eq(contentSections.slug, section))
    .limit(1);
  currentWriteOrganizationId(row?.organizationId);
}

async function assertLinkedCourseOrganization(
  tx: ContentPagesMutationTx,
  linkedCourseId: string | null,
): Promise<void> {
  if (!linkedCourseId) return;
  const [row] = await tx
    .select({ organizationId: coursesTable.organizationId })
    .from(coursesTable)
    .where(eq(coursesTable.id, linkedCourseId))
    .limit(1);
  currentWriteOrganizationId(row?.organizationId);
}

function mapDrizzleRow(row: typeof contentPages.$inferSelect): ContentPageRow {
  return {
    id: row.id,
    organizationId: row.organizationId ?? null,
    section: row.section,
    slug: row.slug,
    title: row.title,
    summary: row.summary ?? '',
    bodyMd: row.bodyMd ?? '',
    bodyHtml: row.bodyHtml ?? '',
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
      const organizationId = currentReadOrganizationId();
      const conds = [
        eq(contentPages.section, section),
        patientVisible,
        ...(viewAuthOnlyPages ? [] : [eq(contentPages.requiresAuth, false)]),
        ...(organizationId ? [eq(contentPages.organizationId, organizationId)] : []),
      ];
      const rows = await db
        .select()
        .from(contentPages)
        .where(and(...conds))
        .orderBy(asc(contentPages.sortOrder), asc(contentPages.title));
      return rows.map(mapDrizzleRow);
    },

    async getBySlug(slug, options) {
      const db = getDrizzle();
      const organizationId = options?.organizationId ?? currentReadOrganizationId();
      const rows = await db
        .select()
        .from(contentPages)
        .where(
          and(
            eq(contentPages.slug, slug),
            patientVisible,
            ...(organizationId ? [eq(contentPages.organizationId, organizationId)] : []),
          ),
        )
        .orderBy(asc(contentPages.section))
        .limit(1);
      return rows[0] ? mapDrizzleRow(rows[0]) : null;
    },

    async getById(id, options) {
      const db = getDrizzle();
      const organizationId = options?.organizationId ?? currentReadOrganizationId();
      const rows = await db
        .select()
        .from(contentPages)
        .where(
          and(
            eq(contentPages.id, id),
            ...(organizationId ? [eq(contentPages.organizationId, organizationId)] : []),
          ),
        )
        .limit(1);
      return rows[0] ? mapDrizzleRow(rows[0]) : null;
    },

    async listMetaByIds(ids) {
      const unique = [...new Set(ids.filter((x) => Boolean(x?.trim())))];
      if (unique.length === 0) return [];
      const db = getDrizzle();
      const organizationId = currentReadOrganizationId();
      const rows = await db
        .select({ id: contentPages.id, title: contentPages.title, slug: contentPages.slug })
        .from(contentPages)
        .where(
          and(
            inArray(contentPages.id, unique),
            ...(organizationId ? [eq(contentPages.organizationId, organizationId)] : []),
          ),
        );
      return rows.map((r) => ({ id: r.id, title: r.title, slug: r.slug }));
    },

    async listAll() {
      const db = getDrizzle();
      const organizationId = currentReadOrganizationId();
      const rows = await db
        .select()
        .from(contentPages)
        .where(organizationId ? eq(contentPages.organizationId, organizationId) : undefined)
        .orderBy(asc(contentPages.section), asc(contentPages.sortOrder), asc(contentPages.title));
      return rows.map(mapDrizzleRow);
    },

    async upsert(page) {
      const organizationId = currentPrincipalOrganizationId();
      const linked =
        page.linkedCourseId !== undefined &&
        page.linkedCourseId !== null &&
        page.linkedCourseId.trim()
          ? page.linkedCourseId.trim()
          : null;
      const values = {
        organizationId,
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
      const rows = await runDrizzleMutationTransaction(async (tx) => {
        await assertContentPageSectionOrganization(tx, page.section);
        await assertLinkedCourseOrganization(tx, linked);
        const [existing] = await tx
          .select({ organizationId: contentPages.organizationId })
          .from(contentPages)
          .where(and(eq(contentPages.section, page.section), eq(contentPages.slug, page.slug)))
          .limit(1);
        currentWriteOrganizationId(existing?.organizationId);
        return tx
          .insert(contentPages)
          .values(values)
          .onConflictDoUpdate({
            target: [contentPages.section, contentPages.slug],
            set: {
              organizationId,
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
      });
      const id = rows[0]?.id;
      if (!id) throw new Error('content_pages upsert returned no id');
      return id;
    },

    async updateFull(id, page) {
      const organizationId = currentPrincipalOrganizationId();
      const linked =
        page.linkedCourseId !== undefined &&
        page.linkedCourseId !== null &&
        page.linkedCourseId.trim()
          ? page.linkedCourseId.trim()
          : null;
      await runDrizzleMutationTransaction(async (tx) => {
        const [existing] = await tx
          .select({ organizationId: contentPages.organizationId })
          .from(contentPages)
          .where(eq(contentPages.id, id))
          .limit(1);
        currentWriteOrganizationId(existing?.organizationId);
        await assertContentPageSectionOrganization(tx, page.section);
        await assertLinkedCourseOrganization(tx, linked);
        await tx
          .update(contentPages)
          .set({
            organizationId,
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
          })
          .where(eq(contentPages.id, id));
      });
    },

    async updateLifecycle(id, patch) {
      const organizationId = currentPrincipalOrganizationId();
      const setPayload: Partial<typeof contentPages.$inferInsert> = {
        organizationId,
        updatedAt: sql`now()` as unknown as string,
      };
      if (patch.isPublished !== undefined) setPayload.isPublished = patch.isPublished;
      if (patch.archivedAt !== undefined) setPayload.archivedAt = patch.archivedAt;
      if (patch.deletedAt !== undefined) setPayload.deletedAt = patch.deletedAt;
      if (patch.requiresAuth !== undefined) setPayload.requiresAuth = patch.requiresAuth;
      if (Object.keys(setPayload).length <= 2) return;
      await runDrizzleMutationTransaction(async (tx) => {
        const [existing] = await tx
          .select({ organizationId: contentPages.organizationId })
          .from(contentPages)
          .where(eq(contentPages.id, id))
          .limit(1);
        currentWriteOrganizationId(existing?.organizationId);
        await tx.update(contentPages).set(setPayload).where(eq(contentPages.id, id));
      });
    },

    async reorderInSection(section, orderedIds) {
      if (orderedIds.length === 0) return;
      const organizationId = currentPrincipalOrganizationId();
      await runDrizzleMutationTransaction(async (tx) => {
        await assertContentPageSectionOrganization(tx, section);
        const check = await tx
          .select({ id: contentPages.id, organizationId: contentPages.organizationId })
          .from(contentPages)
          .where(eq(contentPages.section, section));
        for (const row of check) {
          currentWriteOrganizationId(row.organizationId);
        }
        const inDb = new Set(check.map((r) => r.id));
        if (inDb.size !== orderedIds.length) {
          throw new Error('reorder: count mismatch');
        }
        for (const rowId of orderedIds) {
          if (!inDb.has(rowId)) {
            throw new Error('reorder: unknown id');
          }
        }
        for (let i = 0; i < orderedIds.length; i++) {
          await tx
            .update(contentPages)
            .set({
              organizationId,
              sortOrder: i,
              updatedAt: sql`now()` as unknown as string,
            })
            .where(and(eq(contentPages.id, orderedIds[i]!), eq(contentPages.section, section)));
        }
      });
    },

    async countPagesWithSectionSlug(sectionSlug) {
      const db = getDrizzle();
      const organizationId = currentReadOrganizationId();
      const rows = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(contentPages)
        .where(
          and(
            eq(contentPages.section, sectionSlug),
            ...(organizationId ? [eq(contentPages.organizationId, organizationId)] : []),
          ),
        );
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
      .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, 'ru'));
  },

  async getBySlug(slug, options) {
    const candidates = inMemoryContentPagesStore.filter(
      (p) =>
        p.slug === slug &&
        p.isPublished &&
        !p.archivedAt &&
        !p.deletedAt &&
        (options?.organizationId === undefined || p.organizationId === options.organizationId),
    );
    candidates.sort((a, b) => a.section.localeCompare(b.section, 'ru'));
    return candidates[0] ?? null;
  },

  async getById(id, options) {
    return (
      inMemoryContentPagesStore.find(
        (p) =>
          p.id === id &&
          (options?.organizationId === undefined || p.organizationId === options.organizationId),
      ) ?? null
    );
  },

  async listMetaByIds(ids) {
    const set = new Set(ids);
    return inMemoryContentPagesStore
      .filter((p) => set.has(p.id))
      .map((p) => ({ id: p.id, title: p.title, slug: p.slug }));
  },

  async listAll() {
    return [...inMemoryContentPagesStore].sort(
      (a, b) =>
        a.section.localeCompare(b.section, 'ru') ||
        a.sortOrder - b.sortOrder ||
        a.title.localeCompare(b.title, 'ru'),
    );
  },

  async upsert(page) {
    const linked = page.linkedCourseId?.trim() ? page.linkedCourseId.trim() : null;
    const existingIdx = inMemoryContentPagesStore.findIndex(
      (p) => p.section === page.section && p.slug === page.slug,
    );
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

  async updateFull(id, page) {
    const linked = page.linkedCourseId?.trim() ? page.linkedCourseId.trim() : null;
    const p = inMemoryContentPagesStore.find((x) => x.id === id);
    if (!p) return;
    p.section = page.section;
    p.slug = page.slug;
    p.title = page.title;
    p.summary = page.summary;
    p.bodyMd = page.bodyMd;
    p.bodyHtml = page.bodyHtml;
    p.sortOrder = page.sortOrder;
    p.isPublished = page.isPublished;
    p.requiresAuth = page.requiresAuth ?? false;
    p.videoUrl = page.videoUrl;
    p.videoType = page.videoType;
    p.imageUrl = page.imageUrl;
    p.linkedCourseId = linked;
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
    if (inSection.length !== orderedIds.length) throw new Error('reorder: count mismatch');
    const set = new Set(inSection.map((p) => p.id));
    for (const rowId of orderedIds) {
      if (!set.has(rowId)) throw new Error('reorder: unknown id');
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

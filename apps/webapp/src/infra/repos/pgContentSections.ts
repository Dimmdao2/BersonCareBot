import { and, asc, eq, sql } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import { contentSections } from "../../../db/schema";

export type ContentSectionRow = {
  id: string;
  slug: string;
  title: string;
  description: string;
  sortOrder: number;
  isVisible: boolean;
  /** Если true — только tier patient (см. `requires_auth` в БД). */
  requiresAuth: boolean;
  coverImageUrl: string | null;
  iconImageUrl: string | null;
};

export type ListVisibleContentSectionsOpts = {
  /**
   * Если false — только разделы без `requires_auth` (гость / onboarding).
   * Если true — все с `is_visible` (как раньше по смыслу для tier patient).
   * @default true
   */
  viewAuthOnlySections?: boolean;
};

export type ContentSectionsPort = {
  listVisible: (opts?: ListVisibleContentSectionsOpts) => Promise<ContentSectionRow[]>;
  listAll: () => Promise<ContentSectionRow[]>;
  getBySlug: (slug: string) => Promise<ContentSectionRow | null>;
  upsert: (section: Omit<ContentSectionRow, "id"> & { id?: string }) => Promise<string>;
  update: (
    slug: string,
    patch: Partial<
      Pick<
        ContentSectionRow,
        "title" | "description" | "sortOrder" | "isVisible" | "requiresAuth" | "coverImageUrl" | "iconImageUrl"
      >
    >,
  ) => Promise<void>;
  /** Выставить `sort_order` по порядку slug (0..n-1) в одной транзакции. */
  reorderSlugs: (orderedSlugs: string[]) => Promise<void>;
};

function mapRow(row: typeof contentSections.$inferSelect): ContentSectionRow {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description ?? "",
    sortOrder: row.sortOrder,
    isVisible: row.isVisible,
    requiresAuth: Boolean(row.requiresAuth),
    coverImageUrl: row.coverImageUrl ?? null,
    iconImageUrl: row.iconImageUrl ?? null,
  };
}

export function createPgContentSectionsPort(): ContentSectionsPort {
  return {
    async listVisible(opts?: ListVisibleContentSectionsOpts) {
      const db = getDrizzle();
      const viewAuthOnlySections = opts?.viewAuthOnlySections !== false;
      const whereClause = viewAuthOnlySections
        ? eq(contentSections.isVisible, true)
        : and(eq(contentSections.isVisible, true), eq(contentSections.requiresAuth, false));
      const rows = await db
        .select()
        .from(contentSections)
        .where(whereClause)
        .orderBy(asc(contentSections.sortOrder), asc(contentSections.title));
      return rows.map(mapRow);
    },
    async listAll() {
      const db = getDrizzle();
      const rows = await db
        .select()
        .from(contentSections)
        .orderBy(asc(contentSections.sortOrder), asc(contentSections.title));
      return rows.map(mapRow);
    },
    async getBySlug(slug) {
      const db = getDrizzle();
      const rows = await db.select().from(contentSections).where(eq(contentSections.slug, slug)).limit(1);
      const row = rows[0];
      return row ? mapRow(row) : null;
    },
    async upsert(section) {
      const db = getDrizzle();
      const values = {
        slug: section.slug,
        title: section.title,
        description: section.description,
        sortOrder: section.sortOrder,
        isVisible: section.isVisible,
        requiresAuth: section.requiresAuth ?? false,
        coverImageUrl: section.coverImageUrl ?? null,
        iconImageUrl: section.iconImageUrl ?? null,
        updatedAt: sql`now()` as unknown as string,
      };
      const rows = await db
        .insert(contentSections)
        .values(values)
        .onConflictDoUpdate({
          target: contentSections.slug,
          set: {
            title: section.title,
            description: section.description,
            sortOrder: section.sortOrder,
            isVisible: section.isVisible,
            requiresAuth: section.requiresAuth ?? false,
            coverImageUrl: section.coverImageUrl ?? null,
            iconImageUrl: section.iconImageUrl ?? null,
            updatedAt: sql`now()` as unknown as string,
          },
        })
        .returning({ id: contentSections.id });
      const id = rows[0]?.id;
      if (!id) throw new Error("content_sections upsert returned no id");
      return id;
    },
    async update(slug, patch) {
      const setPayload: Partial<typeof contentSections.$inferInsert> = {
        updatedAt: sql`now()` as unknown as string,
      };
      if (patch.title !== undefined) setPayload.title = patch.title;
      if (patch.description !== undefined) setPayload.description = patch.description;
      if (patch.sortOrder !== undefined) setPayload.sortOrder = patch.sortOrder;
      if (patch.isVisible !== undefined) setPayload.isVisible = patch.isVisible;
      if (patch.requiresAuth !== undefined) setPayload.requiresAuth = patch.requiresAuth;
      if (patch.coverImageUrl !== undefined) setPayload.coverImageUrl = patch.coverImageUrl;
      if (patch.iconImageUrl !== undefined) setPayload.iconImageUrl = patch.iconImageUrl;
      if (Object.keys(setPayload).length <= 1) return;
      const db = getDrizzle();
      await db.update(contentSections).set(setPayload).where(eq(contentSections.slug, slug));
    },
    async reorderSlugs(orderedSlugs) {
      const slugs = orderedSlugs.map((s) => String(s).trim()).filter(Boolean);
      if (slugs.length === 0) return;
      const db = getDrizzle();
      await db.transaction(async (tx) => {
        for (let i = 0; i < slugs.length; i += 1) {
          await tx
            .update(contentSections)
            .set({
              sortOrder: i,
              updatedAt: sql`now()` as unknown as string,
            })
            .where(eq(contentSections.slug, slugs[i]!));
        }
      });
    },
  };
}

/** Пустой порт без БД (как `inMemoryContentPagesPort`). */
export const inMemoryContentSectionsPort: ContentSectionsPort = {
  listVisible: async () => [],
  listAll: async () => [],
  getBySlug: async () => null,
  upsert: async () => "",
  update: async () => {},
  reorderSlugs: async () => {},
};

/** Изолированный in-memory порт для unit-тестов. */
export function createInMemoryContentSectionsPort(): ContentSectionsPort {
  const memory = new Map<string, ContentSectionRow>();
  return {
    async listVisible(opts?: ListVisibleContentSectionsOpts) {
      const viewAuthOnlySections = opts?.viewAuthOnlySections !== false;
      return [...memory.values()]
        .filter((r) => r.isVisible && (viewAuthOnlySections || !r.requiresAuth))
        .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
    },
    async listAll() {
      return [...memory.values()].sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
    },
    async getBySlug(slug) {
      return memory.get(slug) ?? null;
    },
    async upsert(section) {
      const id = section.id ?? `mem-${section.slug}`;
      const row: ContentSectionRow = {
        id,
        slug: section.slug,
        title: section.title,
        description: section.description,
        sortOrder: section.sortOrder,
        isVisible: section.isVisible,
        requiresAuth: section.requiresAuth ?? false,
        coverImageUrl: section.coverImageUrl ?? null,
        iconImageUrl: section.iconImageUrl ?? null,
      };
      memory.set(section.slug, row);
      return id;
    },
    async update(slug, patch) {
      const cur = memory.get(slug);
      if (!cur) return;
      memory.set(slug, {
        ...cur,
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.sortOrder !== undefined ? { sortOrder: patch.sortOrder } : {}),
        ...(patch.isVisible !== undefined ? { isVisible: patch.isVisible } : {}),
        ...(patch.requiresAuth !== undefined ? { requiresAuth: patch.requiresAuth } : {}),
        ...(patch.coverImageUrl !== undefined ? { coverImageUrl: patch.coverImageUrl } : {}),
        ...(patch.iconImageUrl !== undefined ? { iconImageUrl: patch.iconImageUrl } : {}),
      });
    },
    async reorderSlugs(orderedSlugs) {
      const slugs = orderedSlugs.map((s) => String(s).trim()).filter(Boolean);
      for (let i = 0; i < slugs.length; i += 1) {
        const slug = slugs[i]!;
        const cur = memory.get(slug);
        if (cur) memory.set(slug, { ...cur, sortOrder: i });
      }
    },
  };
}

import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import type {
  ContentSectionRow,
  ContentSectionsListFilter,
  ContentSectionsPort,
  ContentSectionUpsertInput,
  ListVisibleContentSectionsOpts,
  RenameSectionSlugResult,
} from "@/modules/content-sections/ports";
import {
  isImmutableSystemSectionSlug,
  isContentSectionKind,
  isSystemParentCode,
  isValidSectionTaxonomy,
} from "@/modules/content-sections/types";
import { validateContentSectionSlug } from "@/shared/lib/contentSectionSlug";
import { contentPages, contentSectionSlugHistory, contentSections, patientHomeBlockItems } from "../../../db/schema";

export type {
  ContentSectionRow,
  ContentSectionsListFilter,
  ContentSectionsPort,
  ContentSectionUpsertInput,
  ListVisibleContentSectionsOpts,
  RenameSectionSlugResult,
} from "@/modules/content-sections/ports";

function normalizeKind(value: string | null | undefined): ContentSectionRow["kind"] {
  return isContentSectionKind(value) ? value : "article";
}

function mapRow(row: typeof contentSections.$inferSelect): ContentSectionRow {
  const kind = normalizeKind(row.kind);
  const raw = row.systemParentCode;
  let systemParentCode: ContentSectionRow["systemParentCode"] = null;
  if (kind === "system" && isSystemParentCode(raw)) {
    systemParentCode = raw;
  }
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
    kind,
    systemParentCode: kind === "article" ? null : systemParentCode,
  };
}

function taxonomyFilterConditions(filter?: ContentSectionsListFilter) {
  const parts: ReturnType<typeof eq>[] = [];
  if (filter?.kind !== undefined) {
    parts.push(eq(contentSections.kind, filter.kind));
  }
  if (filter?.systemParentCode !== undefined) {
    if (filter.systemParentCode === null) {
      parts.push(isNull(contentSections.systemParentCode));
    } else {
      parts.push(eq(contentSections.systemParentCode, filter.systemParentCode));
    }
  }
  return parts;
}

export function createPgContentSectionsPort(): ContentSectionsPort {
  return {
    async listVisible(opts?: ListVisibleContentSectionsOpts) {
      const db = getDrizzle();
      const viewAuthOnlySections = opts?.viewAuthOnlySections !== false;
      const vis = viewAuthOnlySections
        ? eq(contentSections.isVisible, true)
        : and(eq(contentSections.isVisible, true), eq(contentSections.requiresAuth, false));
      const tax = taxonomyFilterConditions(
        opts?.kind !== undefined || opts?.systemParentCode !== undefined
          ? { kind: opts.kind, systemParentCode: opts.systemParentCode }
          : undefined,
      );
      const whereClause = tax.length > 0 ? and(vis, ...tax) : vis;
      const rows = await db
        .select()
        .from(contentSections)
        .where(whereClause)
        .orderBy(asc(contentSections.sortOrder), asc(contentSections.title));
      return rows.map(mapRow);
    },
    async listAll(filter?: ContentSectionsListFilter) {
      const db = getDrizzle();
      const tax = taxonomyFilterConditions(filter);
      const whereClause = tax.length > 0 ? and(...tax) : undefined;
      const base = db.select().from(contentSections).orderBy(asc(contentSections.sortOrder), asc(contentSections.title));
      const rows = whereClause ? await base.where(whereClause) : await base;
      return rows.map(mapRow);
    },
    async getBySlug(slug) {
      const db = getDrizzle();
      const rows = await db.select().from(contentSections).where(eq(contentSections.slug, slug)).limit(1);
      const row = rows[0];
      return row ? mapRow(row) : null;
    },
    async upsert(section: ContentSectionUpsertInput) {
      const kind = section.kind ?? "article";
      const systemParentCode = kind === "article" ? null : (section.systemParentCode ?? null);
      if (!isValidSectionTaxonomy(kind, systemParentCode)) {
        throw new Error("invalid_content_section_taxonomy");
      }
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
        kind,
        systemParentCode,
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
            kind,
            systemParentCode,
            updatedAt: sql`now()` as unknown as string,
          },
        })
        .returning({ id: contentSections.id });
      const id = rows[0]?.id;
      if (!id) throw new Error("content_sections upsert returned no id");
      return id;
    },
    async update(slug, patch) {
      const db = getDrizzle();
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
      if (patch.kind !== undefined || patch.systemParentCode !== undefined) {
        const curRows = await db.select().from(contentSections).where(eq(contentSections.slug, slug)).limit(1);
        const cur = curRows[0];
        if (!cur) return;
        const nextKind = patch.kind !== undefined ? patch.kind : normalizeKind(cur.kind);
        const curParent =
          cur.systemParentCode != null && isSystemParentCode(cur.systemParentCode)
            ? cur.systemParentCode
            : null;
        const nextParent =
          patch.systemParentCode !== undefined
            ? patch.systemParentCode
            : nextKind === "system"
              ? curParent
              : null;
        const resolvedParent = nextKind === "article" ? null : nextParent;
        if (!isValidSectionTaxonomy(nextKind, resolvedParent)) {
          throw new Error("invalid_content_section_taxonomy");
        }
        setPayload.kind = nextKind;
        setPayload.systemParentCode = resolvedParent;
      }
      if (Object.keys(setPayload).length <= 1) return;
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
    async getRedirectNewSlugForOldSlug(oldSlug) {
      const key = oldSlug.trim();
      if (!key) return null;
      const db = getDrizzle();
      const rows = await db
        .select({ newSlug: contentSectionSlugHistory.newSlug })
        .from(contentSectionSlugHistory)
        .where(eq(contentSectionSlugHistory.oldSlug, key))
        .limit(1);
      return rows[0]?.newSlug ?? null;
    },
    async renameSectionSlug(oldSlug, newSlug, opts) {
      const vOld = validateContentSectionSlug(oldSlug);
      const vNew = validateContentSectionSlug(newSlug);
      if (!vOld.ok) return { ok: false, error: vOld.error };
      if (!vNew.ok) return { ok: false, error: vNew.error };
      const o = vOld.slug;
      const n = vNew.slug;
      if (o === n) return { ok: false, error: "Новый slug совпадает с текущим" };

      try {
        const db = getDrizzle();
        return await db.transaction(async (tx): Promise<RenameSectionSlugResult> => {
          const existingRows = await tx.select().from(contentSections).where(eq(contentSections.slug, o)).limit(1);
          const existingRow = existingRows[0];
          if (!existingRow) {
            return { ok: false, error: "Раздел с исходным slug не найден" };
          }
          if (isImmutableSystemSectionSlug(o)) {
            return { ok: false, error: "Slug встроенного раздела нельзя переименовать" };
          }

          const taken = await tx
            .select({ id: contentSections.id })
            .from(contentSections)
            .where(eq(contentSections.slug, n))
            .limit(1);
          if (taken.length > 0) {
            return { ok: false, error: "Раздел с таким slug уже существует" };
          }

          await tx
            .update(contentPages)
            .set({ section: n, updatedAt: sql`now()` as unknown as string })
            .where(eq(contentPages.section, o));

          await tx
            .update(patientHomeBlockItems)
            .set({ targetRef: n, updatedAt: sql`now()` as unknown as string })
            .where(and(eq(patientHomeBlockItems.targetType, "content_section"), eq(patientHomeBlockItems.targetRef, o)));

          const updated = await tx
            .update(contentSections)
            .set({ slug: n, updatedAt: sql`now()` as unknown as string })
            .where(eq(contentSections.slug, o))
            .returning({ id: contentSections.id });
          if (updated.length === 0) {
            return { ok: false, error: "Раздел с исходным slug не найден" };
          }

          await tx.insert(contentSectionSlugHistory).values({
            oldSlug: o,
            newSlug: n,
            changedByUserId: opts?.changedByUserId?.trim() || null,
          });

          return { ok: true, newSlug: n };
        });
      } catch (err) {
        const code = typeof err === "object" && err !== null ? (err as { code?: string }).code : undefined;
        if (code === "23505") {
          return { ok: false, error: "Раздел с таким slug уже существует" };
        }
        console.error("renameSectionSlug failed:", err);
        return { ok: false, error: "Не удалось переименовать slug. Попробуйте ещё раз." };
      }
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
  renameSectionSlug: async () => ({
    ok: false,
    error: "Переименование slug недоступно в режиме без БД",
  }),
  getRedirectNewSlugForOldSlug: async () => null,
};

/** Изолированный in-memory порт для unit-тестов. */
export function createInMemoryContentSectionsPort(): ContentSectionsPort {
  const memory = new Map<string, ContentSectionRow>();
  const slugRedirects = new Map<string, string>();

  function matchesFilter(row: ContentSectionRow, filter?: ContentSectionsListFilter): boolean {
    if (!filter) return true;
    if (filter.kind !== undefined && row.kind !== filter.kind) return false;
    if (filter.systemParentCode !== undefined) {
      const want = filter.systemParentCode;
      const have = row.systemParentCode;
      if (want === null && have !== null) return false;
      if (want !== null && want !== undefined && have !== want) return false;
    }
    return true;
  }

  return {
    async listVisible(opts?: ListVisibleContentSectionsOpts) {
      const viewAuthOnlySections = opts?.viewAuthOnlySections !== false;
      const filter: ContentSectionsListFilter | undefined =
        opts?.kind !== undefined || opts?.systemParentCode !== undefined
          ? { kind: opts.kind, systemParentCode: opts.systemParentCode }
          : undefined;
      return [...memory.values()]
        .filter((r) => r.isVisible && (viewAuthOnlySections || !r.requiresAuth))
        .filter((r) => matchesFilter(r, filter))
        .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
    },
    async listAll(filter?: ContentSectionsListFilter) {
      return [...memory.values()]
        .filter((r) => matchesFilter(r, filter))
        .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
    },
    async getBySlug(slug) {
      return memory.get(slug) ?? null;
    },
    async upsert(section: ContentSectionUpsertInput) {
      const kind = section.kind ?? "article";
      const systemParentCode = kind === "article" ? null : (section.systemParentCode ?? null);
      if (!isValidSectionTaxonomy(kind, systemParentCode)) {
        throw new Error("invalid_content_section_taxonomy");
      }
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
        kind,
        systemParentCode,
      };
      memory.set(section.slug, row);
      return id;
    },
    async update(slug, patch) {
      const cur = memory.get(slug);
      if (!cur) return;
      const nextKind = patch.kind ?? cur.kind;
      const nextParent =
        patch.systemParentCode !== undefined
          ? patch.systemParentCode
          : nextKind === "article"
            ? null
            : cur.systemParentCode;
      const resolvedParent = nextKind === "article" ? null : nextParent;
      if (patch.kind !== undefined || patch.systemParentCode !== undefined) {
        if (!isValidSectionTaxonomy(nextKind, resolvedParent)) {
          throw new Error("invalid_content_section_taxonomy");
        }
      }
      memory.set(slug, {
        ...cur,
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.sortOrder !== undefined ? { sortOrder: patch.sortOrder } : {}),
        ...(patch.isVisible !== undefined ? { isVisible: patch.isVisible } : {}),
        ...(patch.requiresAuth !== undefined ? { requiresAuth: patch.requiresAuth } : {}),
        ...(patch.coverImageUrl !== undefined ? { coverImageUrl: patch.coverImageUrl } : {}),
        ...(patch.iconImageUrl !== undefined ? { iconImageUrl: patch.iconImageUrl } : {}),
        ...(patch.kind !== undefined || patch.systemParentCode !== undefined
          ? { kind: nextKind, systemParentCode: resolvedParent }
          : {}),
      });
    },
    async reorderSlugs(orderedSlugs) {
      const slugs = orderedSlugs.map((s) => String(s).trim()).filter(Boolean);
      for (let i = 0; i < slugs.length; i += 1) {
        const s = slugs[i]!;
        const cur = memory.get(s);
        if (cur) memory.set(s, { ...cur, sortOrder: i });
      }
    },
    async getRedirectNewSlugForOldSlug(oldSlug) {
      return slugRedirects.get(oldSlug.trim()) ?? null;
    },
    async renameSectionSlug(oldSlug, newSlug) {
      const vOld = validateContentSectionSlug(oldSlug);
      const vNew = validateContentSectionSlug(newSlug);
      if (!vOld.ok) return { ok: false, error: vOld.error };
      if (!vNew.ok) return { ok: false, error: vNew.error };
      const o = vOld.slug;
      const n = vNew.slug;
      if (o === n) return { ok: false, error: "Новый slug совпадает с текущим" };
      const cur = memory.get(o);
      if (!cur) return { ok: false, error: "Раздел с исходным slug не найден" };
      if (isImmutableSystemSectionSlug(o)) {
        return { ok: false, error: "Slug встроенного раздела нельзя переименовать" };
      }
      if (memory.has(n)) return { ok: false, error: "Раздел с таким slug уже существует" };
      memory.delete(o);
      memory.set(n, { ...cur, slug: n });
      slugRedirects.set(o, n);
      return { ok: true, newSlug: n };
    },
  };
}

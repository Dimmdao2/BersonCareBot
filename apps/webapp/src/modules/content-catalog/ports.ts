export type ContentPageRow = {
  id: string;
  organizationId?: string | null;
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

export type ContentPageUpsertInput = Omit<
  ContentPageRow,
  'id' | 'archivedAt' | 'deletedAt' | 'linkedCourseId'
> & {
  id?: string;
  linkedCourseId?: string | null;
};

/** Content-page persistence required by content consumers; implementations live in infra/repos. */
export type ContentPagesPort = {
  listBySection: (
    section: string,
    opts?: ListContentPagesBySectionOpts,
  ) => Promise<ContentPageRow[]>;
  getBySlug: (
    slug: string,
    options?: { organizationId?: string },
  ) => Promise<ContentPageRow | null>;
  getById: (id: string, options?: { organizationId?: string }) => Promise<ContentPageRow | null>;
  listAll: () => Promise<ContentPageRow[]>;
  upsert: (page: ContentPageUpsertInput) => Promise<string>;
  updateFull: (id: string, page: ContentPageUpsertInput) => Promise<void>;
  updateLifecycle: (id: string, patch: ContentPageLifecyclePatch) => Promise<void>;
  reorderInSection: (section: string, orderedIds: string[]) => Promise<void>;
  countPagesWithSectionSlug: (sectionSlug: string) => Promise<number>;
  listMetaByIds: (ids: string[]) => Promise<Array<{ id: string; title: string; slug: string }>>;
};

import type { ContentSectionKind, SystemParentCode } from "./types";

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
  kind: ContentSectionKind;
  systemParentCode: SystemParentCode | null;
};

export type ListVisibleContentSectionsOpts = {
  /**
   * Если false — только разделы без `requires_auth` (гость / onboarding).
   * Если true — все с `is_visible` (как раньше по смыслу для tier patient).
   * @default true
   */
  viewAuthOnlySections?: boolean;
  kind?: ContentSectionKind;
  /** When set, filter by cluster; use explicit `null` only via listAll filter object if needed. */
  systemParentCode?: SystemParentCode | null;
};

export type ContentSectionsListFilter = {
  kind?: ContentSectionKind;
  systemParentCode?: SystemParentCode | null;
};

/** Create/update payload: `kind` / `systemParentCode` default to article + null when omitted. */
export type ContentSectionUpsertInput = Omit<ContentSectionRow, "id" | "kind" | "systemParentCode"> & {
  id?: string;
  kind?: ContentSectionKind;
  systemParentCode?: SystemParentCode | null;
};

export type RenameSectionSlugResult = { ok: true; newSlug: string } | { ok: false; error: string };

export type DeleteSectionWithPageReassignResult =
  | { ok: true; movedPageCount: number }
  | { ok: false; error: string };

export type ContentSectionsPort = {
  listVisible: (opts?: ListVisibleContentSectionsOpts) => Promise<ContentSectionRow[]>;
  listAll: (filter?: ContentSectionsListFilter) => Promise<ContentSectionRow[]>;
  getBySlug: (slug: string) => Promise<ContentSectionRow | null>;
  upsert: (section: ContentSectionUpsertInput) => Promise<string>;
  update: (
    slug: string,
    patch: Partial<
      Pick<
        ContentSectionRow,
        | "title"
        | "description"
        | "sortOrder"
        | "isVisible"
        | "requiresAuth"
        | "coverImageUrl"
        | "iconImageUrl"
        | "kind"
        | "systemParentCode"
      >
    >,
  ) => Promise<void>;
  /** Выставить `sort_order` по порядку slug (0..n-1) в одной транзакции. */
  reorderSlugs: (orderedSlugs: string[]) => Promise<void>;
  /** Атомарное переименование slug раздела с обновлением зависимых ссылок и истории редиректа. */
  renameSectionSlug: (
    oldSlug: string,
    newSlug: string,
    opts?: { changedByUserId?: string | null },
  ) => Promise<RenameSectionSlugResult>;
  /** Один шаг цепочки редиректа: куда вести URL с устаревшим slug. */
  getRedirectNewSlugForOldSlug: (oldSlug: string) => Promise<string | null>;
  /**
   * Удалить раздел: все страницы переносятся в служебный раздел `unassignedSectionSlug` (коллизии slug — суффикс `-moved-from-…`).
   * Ссылки patient-home на раздел (`content_section`) обновляются на тот же sentinel.
   */
  deleteSectionWithPageReassign: (
    sectionSlug: string,
    unassignedSectionSlug?: string,
  ) => Promise<DeleteSectionWithPageReassignResult>;
};

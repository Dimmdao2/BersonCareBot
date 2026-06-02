import type { ContentSectionKind, SystemParentCode } from "./types";
import { isHelpSectionSlug } from "./types";

/** Logical content page roles (ROADMAP_2 §3.3 / §1.7). Stored implicitly via `content_pages.section` + section taxonomy. */
export const CONTENT_PAGE_ROLES = ["help_article", "thematic_article", "system_cluster_page"] as const;
export type ContentPageRole = (typeof CONTENT_PAGE_ROLES)[number];

export function isContentPageRole(value: string | null | undefined): value is ContentPageRole {
  if (value == null || value === "") return false;
  return (CONTENT_PAGE_ROLES as readonly string[]).includes(value);
}

export function contentPageRoleForSection(
  sectionSlug: string,
  sectionKind: ContentSectionKind,
  systemParentCode: SystemParentCode | null,
): ContentPageRole {
  if (isHelpSectionSlug(sectionSlug)) return "help_article";
  if (sectionKind === "system") return "system_cluster_page";
  if (sectionKind === "article") return "thematic_article";
  return "system_cluster_page";
}

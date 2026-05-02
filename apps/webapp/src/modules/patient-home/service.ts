import { z } from "zod";
import {
  PATIENT_HOME_BLOCK_CODES,
  allowedTargetTypesForBlock,
  canManageItemsForBlock,
  isPatientHomeContentPageCandidateForBlock,
  isPatientHomeContentSectionCandidateForBlock,
  isTargetTypeAllowedForBlock,
  supportsConfigurablePatientHomeBlockIcon,
} from "./blocks";
import type {
  PatientHomeBlock,
  PatientHomeBlockCode,
  PatientHomeBlockItem,
  PatientHomeBlockItemAddInput,
  PatientHomeBlockItemPatch,
  PatientHomeBlockItemTargetType,
  PatientHomeBlocksPort,
} from "./ports";
import type { ContentSectionKind, SystemParentCode } from "@/modules/content-sections/types";

type Candidate = {
  targetType: PatientHomeBlockItemTargetType;
  targetRef: string;
  title: string;
  subtitle: string | null;
  imageUrl: string | null;
};

type PatientHomeServiceDeps = {
  port: PatientHomeBlocksPort;
  contentPages: {
    listAll(): Promise<
      Array<{
        slug: string;
        title: string;
        summary: string;
        imageUrl: string | null;
        section: string;
        isPublished: boolean;
        archivedAt: string | null;
        deletedAt: string | null;
      }>
    >;
    getBySlug(slug: string): Promise<{
      slug: string;
      section: string;
      isPublished: boolean;
      archivedAt: string | null;
      deletedAt: string | null;
    } | null>;
  };
  contentSections: {
    listAll(): Promise<
      Array<{
        slug: string;
        title: string;
        description: string;
        iconImageUrl?: string | null;
        coverImageUrl?: string | null;
        kind: ContentSectionKind;
        systemParentCode: SystemParentCode | null;
      }>
    >;
    getBySlug(slug: string): Promise<{
      slug: string;
      kind: ContentSectionKind;
      systemParentCode: SystemParentCode | null;
    } | null>;
  };
  courses: {
    listCoursesForDoctor(filter?: { includeArchived?: boolean }): Promise<Array<{ id: string; title: string; description: string | null }>>;
    getCourseForDoctor(id: string): Promise<{ id: string; status: string } | null>;
  };
};

function assertKnownBlockCodes(codes: string[]): asserts codes is PatientHomeBlockCode[] {
  const bad = codes.find((code) => !(PATIENT_HOME_BLOCK_CODES as readonly string[]).includes(code));
  if (bad) throw new Error(`invalid_block_code:${bad}`);
}

function parseBlockCode(value: string): PatientHomeBlockCode {
  assertKnownBlockCodes([value]);
  return value as PatientHomeBlockCode;
}

function assertManageableBlock(code: PatientHomeBlockCode): void {
  if (!canManageItemsForBlock(code)) {
    throw new Error(`items_not_supported_for_block:${code}`);
  }
}

function sanitizeNullable(value?: string | null): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function assertCourseTargetRef(ref: string): void {
  if (!z.string().uuid().safeParse(ref).success) {
    throw new Error("invalid_course_id");
  }
}

async function assertCmsTargetExists(
  deps: PatientHomeServiceDeps,
  blockCode: PatientHomeBlockCode,
  targetType: PatientHomeBlockItemTargetType,
  targetRef: string,
): Promise<void> {
  const sections = await deps.contentSections.listAll();
  const sectionMap = new Map(
    sections.map((s) => [s.slug, { kind: s.kind, systemParentCode: s.systemParentCode }] as const),
  );

  if (targetType === "content_page") {
    const pages = await deps.contentPages.listAll();
    const row = pages.find((p) => p.slug === targetRef);
    if (!row) throw new Error("target_content_page_not_found");
    if (!isPatientHomeContentPageCandidateForBlock(blockCode, row, sectionMap)) {
      throw new Error("target_content_page_not_allowed_for_block");
    }
    return;
  }
  if (targetType === "content_section") {
    const row = await deps.contentSections.getBySlug(targetRef);
    if (!row) throw new Error("target_content_section_not_found");
    if (
      !isPatientHomeContentSectionCandidateForBlock(blockCode, {
        kind: row.kind,
        systemParentCode: row.systemParentCode,
      })
    ) {
      throw new Error("target_content_section_not_allowed_for_block");
    }
    return;
  }
  if (targetType === "course") {
    assertCourseTargetRef(targetRef);
    const row = await deps.courses.getCourseForDoctor(targetRef);
    if (!row || row.status !== "published") throw new Error("target_course_not_found");
  }
}

export function createPatientHomeBlocksService(deps: PatientHomeServiceDeps) {
  return {
    async listBlocksWithItems(): Promise<PatientHomeBlock[]> {
      return deps.port.listBlocksWithItems();
    },

    async setBlockVisibility(code: string, visible: boolean): Promise<void> {
      await deps.port.setBlockVisibility(parseBlockCode(code), visible);
    },

    async setBlockIcon(code: string, iconImageUrl: string | null): Promise<void> {
      const parsed = parseBlockCode(code);
      if (!supportsConfigurablePatientHomeBlockIcon(parsed)) {
        throw new Error(`block_icon_not_supported:${parsed}`);
      }
      await deps.port.setBlockIcon(parsed, sanitizeNullable(iconImageUrl));
    },

    async reorderBlocks(orderedCodes: string[]): Promise<void> {
      assertKnownBlockCodes(orderedCodes);
      const uniq = new Set(orderedCodes);
      if (uniq.size !== orderedCodes.length) {
        throw new Error("duplicate_block_codes");
      }
      if (orderedCodes.length !== PATIENT_HOME_BLOCK_CODES.length) {
        throw new Error("invalid_block_count");
      }
      for (const code of PATIENT_HOME_BLOCK_CODES) {
        if (!uniq.has(code)) throw new Error(`missing_block_code:${code}`);
      }
      await deps.port.reorderBlocks(orderedCodes);
    },

    async addItem(input: PatientHomeBlockItemAddInput): Promise<string> {
      assertManageableBlock(input.blockCode);
      if (!isTargetTypeAllowedForBlock(input.blockCode, input.targetType)) {
        throw new Error(`invalid_target_type_for_block:${input.blockCode}:${input.targetType}`);
      }
      const targetRef = input.targetRef.trim();
      if (!targetRef) throw new Error("empty_target_ref");
      await assertCmsTargetExists(deps, input.blockCode, input.targetType, targetRef);
      return deps.port.addItem({
        ...input,
        targetRef,
        titleOverride: sanitizeNullable(input.titleOverride),
        subtitleOverride: sanitizeNullable(input.subtitleOverride),
        imageUrlOverride: sanitizeNullable(input.imageUrlOverride),
        badgeLabel: sanitizeNullable(input.badgeLabel),
      });
    },

    async updateItem(id: string, patch: PatientHomeBlockItemPatch): Promise<void> {
      const itemId = id.trim();
      if (!itemId) throw new Error("empty_item_id");

      const retarget = patch.targetRef !== undefined || patch.targetType !== undefined;
      if (retarget) {
        const item = await deps.port.getItemById(itemId);
        if (!item) throw new Error("unknown_item");
        assertManageableBlock(item.blockCode);

        const nextType = (patch.targetType ?? item.targetType) as PatientHomeBlockItemTargetType;
        const nextRefRaw = patch.targetRef ?? item.targetRef;
        const nextRef = nextRefRaw.trim();
        if (!nextRef) throw new Error("empty_target_ref");

        if (!isTargetTypeAllowedForBlock(item.blockCode, nextType)) {
          throw new Error(`invalid_target_type_for_block:${item.blockCode}:${nextType}`);
        }

        await assertCmsTargetExists(deps, item.blockCode, nextType, nextRef);

        await deps.port.updateItem(itemId, {
          ...patch,
          targetType: nextType,
          targetRef: nextRef,
          titleOverride: patch.titleOverride === undefined ? undefined : sanitizeNullable(patch.titleOverride),
          subtitleOverride: patch.subtitleOverride === undefined ? undefined : sanitizeNullable(patch.subtitleOverride),
          imageUrlOverride: patch.imageUrlOverride === undefined ? undefined : sanitizeNullable(patch.imageUrlOverride),
          badgeLabel: patch.badgeLabel === undefined ? undefined : sanitizeNullable(patch.badgeLabel),
        });
        return;
      }

      const existingNonRetarget = await deps.port.getItemById(itemId);
      if (!existingNonRetarget) throw new Error("unknown_item");

      await deps.port.updateItem(itemId, {
        ...patch,
        titleOverride: patch.titleOverride === undefined ? undefined : sanitizeNullable(patch.titleOverride),
        subtitleOverride: patch.subtitleOverride === undefined ? undefined : sanitizeNullable(patch.subtitleOverride),
        imageUrlOverride: patch.imageUrlOverride === undefined ? undefined : sanitizeNullable(patch.imageUrlOverride),
        badgeLabel: patch.badgeLabel === undefined ? undefined : sanitizeNullable(patch.badgeLabel),
      });
    },

    async deleteItem(id: string): Promise<void> {
      const itemId = id.trim();
      if (!itemId) throw new Error("empty_item_id");
      await deps.port.deleteItem(itemId);
    },

    async getItemById(id: string): Promise<PatientHomeBlockItem | null> {
      const itemId = id.trim();
      if (!itemId) return null;
      return deps.port.getItemById(itemId);
    },

    async reorderItems(blockCode: string, orderedItemIds: string[]): Promise<void> {
      const parsedCode = parseBlockCode(blockCode);
      assertManageableBlock(parsedCode);
      const uniq = new Set(orderedItemIds);
      if (uniq.size !== orderedItemIds.length) {
        throw new Error("duplicate_item_ids");
      }
      await deps.port.reorderItems(parsedCode, orderedItemIds);
    },

    async retargetContentPageItems(contentPageId: string, oldSlug: string, newSlug: string): Promise<void> {
      await deps.port.retargetContentPageItems(contentPageId, oldSlug, newSlug);
    },

    async listCandidatesForBlock(blockCode: string): Promise<Candidate[]> {
      const parsedCode = parseBlockCode(blockCode);
      const allowedTypes = allowedTargetTypesForBlock(parsedCode);
      if (allowedTypes.length === 0) return [];

      const sections = await deps.contentSections.listAll();
      const sectionMap = new Map(
        sections.map((s) => [s.slug, { kind: s.kind, systemParentCode: s.systemParentCode }] as const),
      );

      const out: Candidate[] = [];
      if (allowedTypes.includes("content_page")) {
        const pages = await deps.contentPages.listAll();
        for (const p of pages) {
          if (!isPatientHomeContentPageCandidateForBlock(parsedCode, p, sectionMap)) continue;
          out.push({
            targetType: "content_page",
            targetRef: p.slug,
            title: p.title,
            subtitle: p.summary || null,
            imageUrl: p.imageUrl,
          });
        }
      }
      if (allowedTypes.includes("content_section")) {
        for (const s of sections) {
          if (
            !isPatientHomeContentSectionCandidateForBlock(parsedCode, {
              kind: s.kind,
              systemParentCode: s.systemParentCode,
            })
          ) {
            continue;
          }
          out.push({
            targetType: "content_section",
            targetRef: s.slug,
            title: s.title,
            subtitle: s.description || null,
            imageUrl: s.iconImageUrl ?? s.coverImageUrl ?? null,
          });
        }
      }
      if (allowedTypes.includes("course")) {
        const courses = await deps.courses.listCoursesForDoctor({ includeArchived: false });
        for (const c of courses) {
          out.push({
            targetType: "course",
            targetRef: c.id,
            title: c.title,
            subtitle: c.description,
            imageUrl: null,
          });
        }
      }
      return out.sort((a, b) => a.title.localeCompare(b.title, "ru"));
    },
  };
}

export type PatientHomeBlocksService = ReturnType<typeof createPatientHomeBlocksService>;

import type { ContentPagesPort } from '@/modules/content-catalog/ports';
import type { ContentSectionsPort } from '@/modules/content-sections/ports';
import type { OrgMechanic } from '@/modules/org-entitlements/types';
import { contentMechanicForSection } from './warmupsContentMutationGuard';

type ContentMechanic = Extract<OrgMechanic, 'cms_pages' | 'warmups'>;

export function wrapContentPagesPortWithWriteClearance(
  port: ContentPagesPort,
  sectionsPort: ContentSectionsPort,
  assertWriteClearance: (mechanic: ContentMechanic) => void,
): ContentPagesPort {
  async function assertForSectionSlug(sectionSlug: string): Promise<void> {
    const section = await sectionsPort.getBySlug(sectionSlug);
    assertWriteClearance(contentMechanicForSection(section));
  }

  async function assertForPageId(id: string): Promise<void> {
    const page = await port.getById(id);
    if (!page) return;
    await assertForSectionSlug(page.section);
  }

  return {
    ...port,
    async upsert(page) {
      await assertForSectionSlug(page.section);
      return port.upsert(page);
    },
    async updateFull(id, page) {
      await assertForSectionSlug(page.section);
      return port.updateFull(id, page);
    },
    async updateLifecycle(id, patch) {
      await assertForPageId(id);
      return port.updateLifecycle(id, patch);
    },
    async reorderInSection(section, orderedIds) {
      await assertForSectionSlug(section);
      return port.reorderInSection(section, orderedIds);
    },
  };
}

export function wrapContentSectionsPortWithWriteClearance(
  port: ContentSectionsPort,
  assertWriteClearance: (mechanic: ContentMechanic) => void,
): ContentSectionsPort {
  async function assertForSlug(slug: string): Promise<void> {
    const section = await port.getBySlug(slug);
    assertWriteClearance(contentMechanicForSection(section));
  }

  async function assertForUpsertInput(input: {
    systemParentCode?: string | null;
    slug: string;
  }): Promise<void> {
    if (input.systemParentCode !== undefined) {
      assertWriteClearance(
        contentMechanicForSection({ systemParentCode: input.systemParentCode }),
      );
      return;
    }
    await assertForSlug(input.slug);
  }

  return {
    ...port,
    async upsert(section) {
      await assertForUpsertInput({
        systemParentCode: section.systemParentCode,
        slug: section.slug,
      });
      return port.upsert(section);
    },
    async update(slug, patch) {
      await assertForSlug(slug);
      if (patch.systemParentCode !== undefined) {
        assertWriteClearance(
          contentMechanicForSection({ systemParentCode: patch.systemParentCode }),
        );
      }
      return port.update(slug, patch);
    },
    async reorderSlugs(orderedSlugs) {
      const sections = await port.listAll();
      const involvedMechanics = new Set(
        sections
          .filter((section) => orderedSlugs.includes(section.slug))
          .map((section) => contentMechanicForSection(section)),
      );
      if (involvedMechanics.size === 0) involvedMechanics.add('cms_pages');
      for (const mechanic of involvedMechanics) {
        assertWriteClearance(mechanic);
      }
      return port.reorderSlugs(orderedSlugs);
    },
    async renameSectionSlug(oldSlug, newSlug, opts) {
      await assertForSlug(oldSlug);
      return port.renameSectionSlug(oldSlug, newSlug, opts);
    },
    async deleteSectionWithPageReassign(sectionSlug, unassignedSectionSlug) {
      await assertForSlug(sectionSlug);
      return port.deleteSectionWithPageReassign(sectionSlug, unassignedSectionSlug);
    },
  };
}

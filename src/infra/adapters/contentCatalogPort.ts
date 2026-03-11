import type {
  ContentCatalogItem,
  ContentCatalogPort,
  ContentCatalogSection,
} from '../../kernel/contracts/index.js';
import { env } from '../../config/env.js';

function normalizeBaseUrl(value: string): string | null {
  const trimmed = value.trim().replace(/\/+$/, '');
  return trimmed.length > 0 ? trimmed : null;
}

function sectionPath(section: ContentCatalogSection): string {
  switch (section) {
    case 'useful_lessons':
      return '/lessons';
    case 'emergency_help':
      return '/emergency';
    case 'free_materials':
      return '/materials/free';
    case 'courses':
      return '/courses';
    case 'exercise':
      return '/exercise';
    case 'warmup':
      return '/warmup';
    case 'movement':
    default:
      return '/movement';
  }
}

export function createContentCatalogPort(): ContentCatalogPort {
  return {
    async getSectionLink(input): Promise<string | null> {
      const baseUrl = normalizeBaseUrl(env.CONTENT_SERVICE_BASE_URL);
      if (!baseUrl) return null;
      return `${baseUrl}${sectionPath(input.section)}`;
    },
    async getRandomItem(_input): Promise<ContentCatalogItem | null> {
      // Phase 2 placeholder: selection will move to external content service.
      return null;
    },
  };
}

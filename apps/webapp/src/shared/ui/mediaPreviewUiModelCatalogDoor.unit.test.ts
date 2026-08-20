import { describe, expect, it } from 'vitest';
import {
  recommendationMediaItemToPreviewUi as patientRecommendationToUi,
  templateListPreviewToPreviewUi as patientTemplatePreviewToUi,
} from '@/shared/ui/patient/media/mediaPreviewUiModel';
import {
  recommendationMediaItemToPreviewUi as doctorRecommendationToUi,
  templateListPreviewToPreviewUi as doctorTemplatePreviewToUi,
} from '@/shared/ui/doctor/media/mediaPreviewUiModel';
import { getMediaThumbPhase as patientPhaseOf } from '@/shared/ui/patient/media/mediaThumbState';
import { getMediaThumbPhase as doctorPhaseOf } from '@/shared/ui/doctor/media/mediaThumbState';

const MEDIA_URL = '/api/media/11111111-1111-4111-8111-111111111111';

/**
 * Owner ruling 19.08 (`docs/_TODO/GET_IMAGE_ACCESSOR_2026-08-19.md`): the catalog (recommendations,
 * treatment-program-template list preview) must go through the same door as everything else —
 * `previewStatus`/`previewSmUrl`/`standardRendition` pass through unchanged, the caller does not
 * force readiness. This pins what a person actually sees in each of the four rungs, for both the
 * recommendation-media mapper and the template-list-preview mapper, in both UI zones.
 *
 * Regression pinned here: before this fix, `recommendationMediaItemToPreviewUi` and
 * `templateListPreviewToPreviewUi` hard-set `previewStatus: 'ready'` and substituted the primary
 * `/api/media/{id}` URL for every image/gif, regardless of whether it had been converted — once the
 * primary upload is deleted post-conversion, an unconverted row would render a broken image instead
 * of the "готовится"/error placeholder.
 */
describe.each([
  ['patient', patientRecommendationToUi, patientTemplatePreviewToUi, patientPhaseOf],
  ['doctor', doctorRecommendationToUi, doctorTemplatePreviewToUi, doctorPhaseOf],
] as const)('%s catalog media door', (_side, toRecommendationUi, toTemplatePreviewUi, phaseOf) => {
  describe('recommendation media (grid/list thumb, catalog card, patient program modal)', () => {
    it('an unconverted image never reaches "ready": the person sees "готовится", never the raw upload', () => {
      const ui = toRecommendationUi({
        mediaUrl: MEDIA_URL,
        mediaType: 'image',
        sortOrder: 0,
        previewStatus: 'pending',
        standardRendition: false,
      });
      expect(phaseOf(ui)).toBe('pending');
    });

    it('a converted image with no thumbnail yet shows the stored re-encoded file (rung 2)', () => {
      const ui = toRecommendationUi({
        mediaUrl: MEDIA_URL,
        mediaType: 'image',
        sortOrder: 0,
        previewStatus: 'pending',
        standardRendition: true,
      });
      expect(phaseOf(ui)).toBe('source');
      expect(ui.url).toBe(MEDIA_URL);
    });

    it('a converted image with a ready thumbnail shows the thumbnail (rung 1)', () => {
      const ui = toRecommendationUi({
        mediaUrl: MEDIA_URL,
        mediaType: 'image',
        sortOrder: 0,
        previewStatus: 'ready',
        previewSmUrl: `${MEDIA_URL}/preview/sm`,
        standardRendition: true,
      });
      expect(phaseOf(ui)).toBe('ready');
    });

    it.each(['failed', 'skipped'] as const)(
      'a %s conversion is the terminal error state (rung 4), never the raw upload',
      (previewStatus) => {
        const ui = toRecommendationUi({
          mediaUrl: MEDIA_URL,
          mediaType: 'image',
          sortOrder: 0,
          previewStatus,
          standardRendition: false,
        });
        expect(phaseOf(ui)).toBe(previewStatus);
      },
    );

    it('a row with no rendition data at all (never enriched) behaves like "not converted", not "ready"', () => {
      const ui = toRecommendationUi({ mediaUrl: MEDIA_URL, mediaType: 'gif', sortOrder: 0 });
      expect(phaseOf(ui)).toBe('pending');
    });
  });

  describe('template list preview (master list first-item thumbnail)', () => {
    it('an unconverted image never reaches "ready"', () => {
      const ui = toTemplatePreviewUi({
        mediaUrl: MEDIA_URL,
        mediaType: 'image',
        previewStatus: 'pending',
        standardRendition: false,
      });
      expect(phaseOf(ui)).toBe('pending');
    });

    it('a converted image with a ready thumbnail shows the thumbnail', () => {
      const ui = toTemplatePreviewUi({
        mediaUrl: MEDIA_URL,
        mediaType: 'gif',
        previewStatus: 'ready',
        previewSmUrl: `${MEDIA_URL}/preview/sm`,
        standardRendition: true,
      });
      expect(phaseOf(ui)).toBe('ready');
    });

    it.each(['failed', 'skipped'] as const)(
      'a %s conversion is the terminal error state',
      (previewStatus) => {
        const ui = toTemplatePreviewUi({
          mediaUrl: MEDIA_URL,
          mediaType: 'image',
          previewStatus,
          standardRendition: false,
        });
        expect(phaseOf(ui)).toBe(previewStatus);
      },
    );
  });
});

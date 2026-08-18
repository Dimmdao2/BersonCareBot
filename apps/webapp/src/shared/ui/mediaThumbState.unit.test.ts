import { describe, expect, it } from 'vitest';
import { getMediaThumbPhase } from '@/shared/ui/patient/media/mediaThumbState';
import { getMediaThumbPhase as getDoctorMediaThumbPhase } from '@/shared/ui/doctor/media/mediaThumbState';

/**
 * Owner ruling 19.08: «Показ файла, пока делается миниатюра — но только после конвертации».
 * The `source` phase is the only way a stored file reaches an `<img>` before its thumbnail
 * exists, so every branch that must NOT produce it is pinned here.
 */
describe.each([
  ['patient', getMediaThumbPhase],
  ['doctor', getDoctorMediaThumbPhase],
])('getMediaThumbPhase (%s copy)', (_side, phaseOf) => {
  it('shows the stored file while the thumbnail is missing on a converted image', () => {
    expect(
      phaseOf({ kind: 'image', previewStatus: 'pending', standardRendition: true }),
    ).toBe('source');
  });

  it('keeps the placeholder while the thumbnail is missing on an unconverted image', () => {
    expect(
      phaseOf({ kind: 'image', previewStatus: 'pending', standardRendition: false }),
    ).toBe('pending');
    /* A surface that does not read the column at all must behave like "not converted". */
    expect(phaseOf({ kind: 'image', previewStatus: 'pending' })).toBe('pending');
  });

  it('prefers the generated thumbnail once it exists', () => {
    expect(
      phaseOf({
        kind: 'image',
        previewStatus: 'ready',
        previewSmUrl: '/api/media/x/preview/sm',
        standardRendition: true,
      }),
    ).toBe('ready');
  });

  it.each(['skipped', 'failed'] as const)(
    'keeps the unavailable state for preview_status=%s even if converted',
    (previewStatus) => {
      expect(phaseOf({ kind: 'image', previewStatus, standardRendition: true })).toBe(
        previewStatus,
      );
    },
  );

  it('never shows the source for video: the poster is generated, the file is not re-encoded', () => {
    expect(
      phaseOf({ kind: 'video', previewStatus: 'pending', standardRendition: true }),
    ).toBe('pending');
  });

  it('never shows the source for audio or plain files', () => {
    expect(phaseOf({ kind: 'audio', previewStatus: 'pending', standardRendition: true })).toBe(
      'non_visual',
    );
    expect(phaseOf({ kind: 'file', previewStatus: 'pending', standardRendition: true })).toBe(
      'non_visual',
    );
  });
});

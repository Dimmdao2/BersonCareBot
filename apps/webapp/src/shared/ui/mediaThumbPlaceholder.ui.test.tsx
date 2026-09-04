import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MediaThumb as PatientMediaThumb } from '@/shared/ui/patient/media/MediaThumb';
import { MediaThumb as DoctorMediaThumb } from '@/shared/ui/doctor/media/MediaThumb';
import type { MediaPreviewUiModel } from '@/shared/ui/patient/media/mediaPreviewUiModel';

/**
 * Owner ruling 19.08: «Пустая отметка означает "не пересобрано" — нужна заглушка "изображение/видео
 * готовится"». What a person sees is pinned per state, because the three states differ in meaning:
 * the file is not converted yet (wait), the file is shown, the preview will never come (broken).
 */
const mediaId = '00000000-0000-4000-8000-0000000000b1';
const fileUrl = `/api/media/${mediaId}`;
const smUrl = `${fileUrl}/preview/sm`;

function media(overrides: Partial<MediaPreviewUiModel> = {}): MediaPreviewUiModel {
  return {
    id: mediaId,
    kind: 'image',
    url: fileUrl,
    previewStatus: 'pending',
    previewSmUrl: null,
    previewMdUrl: null,
    ...overrides,
  };
}

describe.each([
  ['patient', PatientMediaThumb],
  ['doctor', DoctorMediaThumb],
])('MediaThumb placeholder (%s copy)', (_side, MediaThumb) => {
  it('shows the converted file itself instead of the placeholder', () => {
    const { queryByText } = render(<MediaThumb media={media({ standardRendition: true })} />);
    expect(document.querySelector('img')).toHaveAttribute('src', fileUrl);
    expect(queryByText('Изображение готовится')).toBeNull();
  });

  it('shows the generated thumbnail once it exists', () => {
    const { queryByText } = render(
      <MediaThumb
        media={media({ previewStatus: 'ready', previewSmUrl: smUrl, standardRendition: true })}
      />,
    );
    expect(document.querySelector('img')).toHaveAttribute('src', smUrl);
    expect(queryByText('Изображение готовится')).toBeNull();
  });

  /* A picture that failed to load is not a picture that is still being made — different wording. */
  it('keeps the file on screen when the browser fails to load it, and never calls that "готовится"', () => {
    const { queryByText } = render(<MediaThumb media={media({ standardRendition: true })} />);
    const img = document.querySelector('img');
    expect(img).not.toBeNull();
    fireEvent.error(img as HTMLImageElement);
    expect(queryByText('Изображение готовится')).toBeNull();
    expect(document.querySelector('img')).toHaveAttribute('src', fileUrl);
  });

});

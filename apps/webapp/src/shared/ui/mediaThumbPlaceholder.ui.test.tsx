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
  it('says the image is being prepared while the upload is not converted', () => {
    const { getByText } = render(<MediaThumb media={media({ standardRendition: false })} />);
    expect(getByText('Изображение готовится')).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
  });

  it('says the same on a surface that does not read the conversion fact at all', () => {
    const { getByText } = render(<MediaThumb media={media()} />);
    expect(getByText('Изображение готовится')).toBeInTheDocument();
  });

  it('names the video, not the image, while its preview is missing', () => {
    const { getByText } = render(
      <MediaThumb media={media({ kind: 'video', standardRendition: false })} />,
    );
    expect(getByText('Видео готовится')).toBeInTheDocument();
  });

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

  it.each(['failed', 'skipped'] as const)(
    'says the preview is unavailable, not "готовится", for preview_status=%s',
    (previewStatus) => {
      const { getByText, queryByText } = render(
        <MediaThumb media={media({ previewStatus, standardRendition: true })} />,
      );
      expect(
        getByText(previewStatus === 'skipped' ? 'Превью не создаётся' : 'Превью недоступно'),
      ).toBeInTheDocument();
      expect(queryByText('Изображение готовится')).toBeNull();
    },
  );
});

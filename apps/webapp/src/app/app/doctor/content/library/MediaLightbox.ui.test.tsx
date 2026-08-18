import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MediaLightbox } from './MediaLightbox';

const mediaId = '00000000-0000-4000-8000-0000000000a1';
const fileUrl = `/api/media/${mediaId}`;
const mdUrl = `${fileUrl}/preview/md`;

function item(overrides: Record<string, unknown> = {}) {
  return {
    id: mediaId,
    kind: 'image' as const,
    mimeType: 'image/webp',
    filename: 'photo.webp',
    size: 120_000,
    createdAt: '2026-08-19T08:00:00.000Z',
    url: fileUrl,
    previewSmUrl: null,
    previewMdUrl: null,
    ...overrides,
  };
}

describe('MediaLightbox image source', () => {
  it('prefers the generated preview when it exists', () => {
    render(
      <MediaLightbox
        open
        item={item({ previewStatus: 'ready', previewMdUrl: mdUrl, standardRendition: true })}
        onOpenChange={() => {}}
      />,
    );
    expect(document.querySelector('img')).toHaveAttribute('src', mdUrl);
  });

  it('shows the stored file while the preview is still missing once the upload was converted', () => {
    render(
      <MediaLightbox
        open
        item={item({ previewStatus: 'pending', standardRendition: true })}
        onOpenChange={() => {}}
      />,
    );
    expect(document.querySelector('img')).toHaveAttribute('src', fileUrl);
  });

  it('requests no image while the preview is missing and the upload was not converted', () => {
    render(
      <MediaLightbox
        open
        item={item({ previewStatus: 'pending', standardRendition: false })}
        onOpenChange={() => {}}
      />,
    );
    expect(document.querySelector('img')).toBeNull();
  });

  it.each(['skipped', 'failed'] as const)(
    'keeps the unavailable state for preview_status=%s',
    (previewStatus) => {
      const { getByText } = render(
        <MediaLightbox
          open
          item={item({ previewStatus, standardRendition: false })}
          onOpenChange={() => {}}
        />,
      );
      expect(document.querySelector('img')).toBeNull();
      expect(
        getByText(
          previewStatus === 'skipped'
            ? 'Превью для этого файла не создаётся'
            : 'Превью изображения недоступно',
        ),
      ).toBeInTheDocument();
    },
  );
});

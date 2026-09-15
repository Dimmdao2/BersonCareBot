'use client';

import { MediaThumb, type MediaThumbProps } from './MediaThumb';
import { useMediaPreviewUi } from './useMediaPreviewUi';

type Props = Omit<MediaThumbProps, 'media'> & {
  /** Идентификатор файла из формы. Пустой — рисуется `empty`. */
  mediaId: string | null | undefined;
  /** Что показать, когда файл не выбран вовсе. */
  empty?: React.ReactNode;
};

/**
 * Картинка по одному лишь `mediaId` — единственный способ показать выбранный файл в форме.
 *
 * До этого формы рисовали `<img src="/api/media/{id}">` напрямую, и пока превью не готово, дверь
 * честно отвечала «нечего отдать», а человек видел битый значок, который сам не чинился. Здесь
 * состояние берётся у двери превью ({@link useMediaPreviewUi}) и рисуется тем же
 * {@link MediaThumb}, что в библиотеке и пикере: «готовится», «без превью», «ошибка» — это виды, а
 * не поломка. Новое место с картинкой по идентификатору берёт этот компонент, а не свой `<img>`.
 */
export function MediaIdThumb({ mediaId, empty = null, ...thumbProps }: Props) {
  const model = useMediaPreviewUi(mediaId);
  const id = mediaId?.trim();

  if (!id) return <>{empty}</>;

  /* Ответ двери ещё не пришёл: показываем то же «готовится», что и очередь превью. */
  return (
    <MediaThumb
      {...thumbProps}
      media={
        model ?? {
          id,
          kind: 'image',
          url: '',
          previewStatus: 'pending',
          previewSmUrl: null,
          previewMdUrl: null,
          standardRendition: null,
        }
      }
    />
  );
}

import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HostedVideoEmbed as PatientHostedVideoEmbed } from '@/shared/ui/patient/media/HostedVideoEmbed';
import { HostedVideoEmbed as DoctorHostedVideoEmbed } from '@/shared/ui/doctor/media/HostedVideoEmbed';
import { MediaThumb as PatientMediaThumb } from '@/shared/ui/patient/media/MediaThumb';
import { MediaThumb as DoctorMediaThumb } from '@/shared/ui/doctor/media/MediaThumb';
import { exerciseMediaToPreviewUi as patientPreviewUi } from '@/shared/ui/patient/media/mediaPreviewUiModel';
import { exerciseMediaToPreviewUi as doctorPreviewUi } from '@/shared/ui/doctor/media/mediaPreviewUiModel';
import type { ExerciseMedia } from '@/modules/lfk-exercises/types';

function hostedMedia(url: string, preview: Partial<ExerciseMedia> = {}): ExerciseMedia {
  return {
    id: 'ex-media-1',
    exerciseId: 'ex-1',
    mediaUrl: url,
    mediaType: 'hosted_video',
    sortOrder: 0,
    createdAt: '2026-08-19T00:00:00.000Z',
    ...preview,
  };
}

const OUR_COVER_ID = '33333333-3333-4333-8333-333333333333';

describe.each([
  ['patient', PatientHostedVideoEmbed],
  ['doctor', DoctorHostedVideoEmbed],
])('внешнее видео в слоте плеера (%s)', (_side, HostedVideoEmbed) => {
  it('показывает ролик проигрывателем хоста', () => {
    const { container } = render(
      <HostedVideoEmbed url="https://www.youtube.com/watch?v=dQw4w9WgXcQ" title="Приседания" />,
    );
    const frame = container.querySelector('iframe');
    expect(frame).not.toBeNull();
    expect(frame?.getAttribute('src')).toBe(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    );
    expect(frame?.getAttribute('title')).toBe('Приседания');
  });

  it('не встраивает посторонний хост, даже если такая строка оказалась в базе', () => {
    const { container, getByText } = render(
      <HostedVideoEmbed url="https://evil.example/embed/1" title="Приседания" />,
    );
    expect(container.querySelector('iframe')).toBeNull();
    expect(getByText(/Ссылка на видео не распознана/)).toBeInTheDocument();
  });
});

/**
 * Лестница превью говорит четырьмя состояниями, и ссылка на хостинг ходит по ней теми же
 * состояниями, что файл: обложку мы скачали и положили к себе, поэтому «готовится» — это
 * ожидание скачивания, «превью не создаётся» — обложки у ролика нет и не будет.
 *
 * Железное во всех четырёх: в `<img src>` может попасть только НАШ адрес. Владелец: «картинку
 * скачиваем один раз и кладём в НАШЕ хранилище» — браузер пациента к YouTube/VK за превью не
 * ходит.
 */
describe.each([
  ['patient', PatientMediaThumb, patientPreviewUi],
  ['doctor', DoctorMediaThumb, doctorPreviewUi],
])('состояние превью внешнего видео (%s)', (_side, MediaThumb, toPreviewUi) => {
  it('обложки у ролика нет — не обещает конвертацию и не рисует ошибку', () => {
    const { getByText, queryByText, container } = render(
      <MediaThumb
        media={toPreviewUi(hostedMedia('https://vimeo.com/76979871', { previewStatus: 'skipped' }))}
      />,
    );
    expect(getByText('Превью не создаётся')).toBeInTheDocument();
    expect(queryByText('Видео готовится')).toBeNull();
    expect(queryByText('Превью недоступно')).toBeNull();
    /* Ссылка на чужой хост не может уехать в `<img src>`. */
    expect(container.querySelector('img')).toBeNull();
  });

  it('обложка ещё качается — «готовится», и по-прежнему ни одного запроса на чужой хост', () => {
    const { getByText, container } = render(
      <MediaThumb
        media={toPreviewUi(
          hostedMedia('https://www.youtube.com/watch?v=dQw4w9WgXcQ', {
            previewStatus: 'pending',
          }),
        )}
      />,
    );
    expect(getByText('Видео готовится')).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
  });

  it('обложка готова — показывается НАША картинка, не адрес хостинга', () => {
    const { container } = render(
      <MediaThumb
        media={toPreviewUi(
          hostedMedia('https://www.youtube.com/watch?v=dQw4w9WgXcQ', {
            previewStatus: 'ready',
            previewSmUrl: `/api/media/${OUR_COVER_ID}/preview/sm`,
            previewMdUrl: `/api/media/${OUR_COVER_ID}/preview/md`,
          }),
        )}
      />,
    );

    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toBe(`/api/media/${OUR_COVER_ID}/preview/sm`);
    expect(container.innerHTML).not.toContain('youtube');
    expect(container.innerHTML).not.toContain('ytimg');
  });

  it('скачать не удалось — «превью недоступно», а не картинка с чужого хоста', () => {
    const { getByText, container } = render(
      <MediaThumb
        media={toPreviewUi(
          hostedMedia('https://vkvideo.ru/video-22822305_456239017', {
            previewStatus: 'failed',
          }),
        )}
      />,
    );
    expect(getByText('Превью недоступно')).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
  });
});

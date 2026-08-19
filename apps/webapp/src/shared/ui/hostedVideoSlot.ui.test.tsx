import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HostedVideoEmbed as PatientHostedVideoEmbed } from '@/shared/ui/patient/media/HostedVideoEmbed';
import { HostedVideoEmbed as DoctorHostedVideoEmbed } from '@/shared/ui/doctor/media/HostedVideoEmbed';
import { MediaThumb as PatientMediaThumb } from '@/shared/ui/patient/media/MediaThumb';
import { MediaThumb as DoctorMediaThumb } from '@/shared/ui/doctor/media/MediaThumb';
import { exerciseMediaToPreviewUi as patientPreviewUi } from '@/shared/ui/patient/media/mediaPreviewUiModel';
import { exerciseMediaToPreviewUi as doctorPreviewUi } from '@/shared/ui/doctor/media/mediaPreviewUiModel';
import type { ExerciseMedia } from '@/modules/lfk-exercises/types';

function hostedMedia(url: string): ExerciseMedia {
  return {
    id: 'ex-media-1',
    exerciseId: 'ex-1',
    mediaUrl: url,
    mediaType: 'hosted_video',
    sortOrder: 0,
    createdAt: '2026-08-19T00:00:00.000Z',
  };
}

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
 * Лестница превью говорит четырьмя состояниями. Для внешней ссылки верно ровно одно из них:
 * конвертировать нечего и миниатюры не будет никогда — «превью не создаётся». Ошибочно было бы
 * «готовится» (обещание конвертации, которой не будет) и «недоступно» (сбой, которого не было).
 */
describe.each([
  ['patient', PatientMediaThumb, patientPreviewUi],
  ['doctor', DoctorMediaThumb, doctorPreviewUi],
])('состояние превью внешнего видео (%s)', (_side, MediaThumb, toPreviewUi) => {
  it('не обещает конвертацию и не рисует ошибку', () => {
    const { getByText, queryByText, container } = render(
      <MediaThumb media={toPreviewUi(hostedMedia('https://vimeo.com/76979871'))} />,
    );
    expect(getByText('Превью не создаётся')).toBeInTheDocument();
    expect(queryByText('Видео готовится')).toBeNull();
    expect(queryByText('Превью недоступно')).toBeNull();
    /* Ссылка на чужой хост не может уехать в `<img src>`. */
    expect(container.querySelector('img')).toBeNull();
  });
});

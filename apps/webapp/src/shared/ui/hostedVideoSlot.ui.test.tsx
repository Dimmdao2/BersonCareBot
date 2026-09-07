import { fireEvent, render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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

type MockYouTubeEvents = {
  onReady(event: { target: MockYouTubePlayer }): void;
  onStateChange(event: { target: MockYouTubePlayer; data: number }): void;
  onError(): void;
};

class MockYouTubePlayer {
  static latest: MockYouTubePlayer | null = null;
  playCalls = 0;
  pauseCalls = 0;
  seekSeconds = 0;
  volume = 100;
  muted = false;
  currentTime = 0;
  duration = 120;

  constructor(
    _iframe: HTMLIFrameElement,
    private readonly options: { events: MockYouTubeEvents },
  ) {
    MockYouTubePlayer.latest = this;
    queueMicrotask(() => options.events.onReady({ target: this }));
  }

  destroy() {}
  getCurrentTime() {
    return this.currentTime;
  }
  getDuration() {
    return this.duration;
  }
  getVolume() {
    return this.volume;
  }
  isMuted() {
    return this.muted;
  }
  mute() {
    this.muted = true;
  }
  unMute() {
    this.muted = false;
  }
  playVideo() {
    this.playCalls += 1;
    this.options.events.onStateChange({ target: this, data: 1 });
  }
  pauseVideo() {
    this.pauseCalls += 1;
    this.options.events.onStateChange({ target: this, data: 2 });
  }
  seekTo(seconds: number) {
    this.seekSeconds = seconds;
    this.currentTime = seconds;
  }
  setVolume(volume: number) {
    this.volume = volume;
  }
}

function installYouTubeApiMock() {
  Object.defineProperty(window, 'YT', {
    configurable: true,
    value: {
      Player: MockYouTubePlayer,
      PlayerState: { ENDED: 0, PLAYING: 1, PAUSED: 2 },
    },
  });
}

describe.each([
  ['patient', PatientHostedVideoEmbed],
  ['doctor', DoctorHostedVideoEmbed],
])('внешнее видео в слоте плеера (%s)', (_side, HostedVideoEmbed) => {
  it('скрывает штатную панель YouTube и показывает собственные controls', () => {
    const { container } = render(
      <HostedVideoEmbed url="https://www.youtube.com/watch?v=dQw4w9WgXcQ" title="Приседания" />,
    );
    const frame = container.querySelector('iframe');
    expect(frame).not.toBeNull();
    expect(frame?.getAttribute('src')).toContain(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    );
    expect(frame?.getAttribute('src')).toContain('controls=0');
    expect(frame?.getAttribute('src')).toContain('enablejsapi=1');
    expect(frame?.getAttribute('title')).toBe('Приседания');
    expect(container.querySelector('[data-player-kind="youtube_custom_controls"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="Воспроизвести"]')).not.toBeNull();
    expect(container.querySelector('input[aria-label="Позиция видео"]')).not.toBeNull();
  });

  it('оставляет штатные controls провайдеру без подтверждённого custom API', () => {
    const { container } = render(
      <HostedVideoEmbed url="https://vkvideo.ru/video-22822305_456239017" title="Приседания" />,
    );
    expect(container.querySelector('[data-player-kind="provider_native_controls"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="Воспроизвести"]')).toBeNull();
  });

  it('скрывает штатные controls RUTUBE и управляет им через официальный postMessage API', async () => {
    const { container, getByRole } = render(
      <HostedVideoEmbed url={`https://rutube.ru/video/${'b'.repeat(32)}/`} title="Приседания" />,
    );
    const frame = container.querySelector('iframe');
    expect(frame?.contentWindow).not.toBeNull();
    const postMessage = vi.spyOn(frame!.contentWindow!, 'postMessage');

    fireEvent(
      window,
      new MessageEvent('message', {
        origin: 'https://rutube.ru',
        source: frame!.contentWindow,
        data: JSON.stringify({ type: 'player:ready', data: {} }),
      }),
    );

    const play = getByRole('button', { name: 'Воспроизвести' });
    await waitFor(() => expect(play).toBeEnabled());
    expect(container.querySelector('[data-player-kind="rutube_custom_controls"]')).not.toBeNull();
    expect(postMessage).toHaveBeenCalledWith(
      JSON.stringify({ type: 'player:hideControls' }),
      'https://rutube.ru',
    );

    fireEvent.click(play);
    expect(postMessage).toHaveBeenCalledWith(
      JSON.stringify({ type: 'player:play', data: {} }),
      'https://rutube.ru',
    );

    fireEvent(
      window,
      new MessageEvent('message', {
        origin: 'https://rutube.ru',
        source: frame!.contentWindow,
        data: JSON.stringify({ type: 'player:durationChange', data: { duration: 120 } }),
      }),
    );
    fireEvent.change(getByRole('slider', { name: 'Позиция видео' }), {
      target: { value: '42' },
    });
    expect(postMessage).toHaveBeenCalledWith(
      JSON.stringify({ type: 'player:setCurrentTime', data: { time: 42 } }),
      'https://rutube.ru',
    );
  });

  it('заново выбирает тип плеера при замене URL того же видео-слота', () => {
    const { container, rerender } = render(
      <HostedVideoEmbed url="https://www.youtube.com/watch?v=dQw4w9WgXcQ" title="Приседания" />,
    );
    expect(container.querySelector('[data-player-kind="youtube_custom_controls"]')).not.toBeNull();

    rerender(
      <HostedVideoEmbed url="https://vkvideo.ru/video-22822305_456239017" title="Приседания" />,
    );
    expect(container.querySelector('[data-player-kind="provider_native_controls"]')).not.toBeNull();
    expect(container.querySelector('[data-player-kind="youtube_custom_controls"]')).toBeNull();
  });

  it('управляет YouTube через официальный API, а не через штатную панель', async () => {
    installYouTubeApiMock();
    const { getByRole } = render(
      <HostedVideoEmbed url="https://www.youtube.com/watch?v=dQw4w9WgXcQ" title="Приседания" />,
    );

    const play = getByRole('button', { name: 'Воспроизвести' });
    await waitFor(() => expect(play).toBeEnabled());
    fireEvent.click(play);
    expect(MockYouTubePlayer.latest?.playCalls).toBe(1);

    const seek = getByRole('slider', { name: 'Позиция видео' });
    fireEvent.change(seek, { target: { value: '42' } });
    expect(MockYouTubePlayer.latest?.seekSeconds).toBe(42);
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

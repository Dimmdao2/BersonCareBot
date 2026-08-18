import { fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MediaPlaybackPayload } from '@/modules/media/playbackPayloadTypes';
import type { ProgramItemDiscussionMessage } from '@/modules/program-item-discussion/types';
import { ProgramItemDiscussionMessageBody } from './ProgramItemDiscussionMessageBody';

const mediaId = '00000000-0000-4000-8000-000000000099';
const originalUrl = `/api/media/${mediaId}`;
const smUrl = `${originalUrl}/preview/sm`;
const mdUrl = `${originalUrl}/preview/md`;

const message: ProgramItemDiscussionMessage = {
  id: 'message-1',
  instanceStageItemId: 'stage-item-1',
  patientUserId: 'patient-1',
  senderRole: 'patient',
  origin: 'patient_observation',
  body: null,
  mediaFileId: mediaId,
  supportMessageId: null,
  createdAt: '2026-08-16T08:00:00.000Z',
};

const playback: MediaPlaybackPayload = {
  mediaId,
  delivery: 'file',
  mimeType: 'image/jpeg',
  durationSeconds: null,
  posterUrl: null,
  preview: { status: 'ready', smUrl, mdUrl },
  hls: null,
  mp4: { url: originalUrl },
  fallbackUsed: false,
  expiresInSeconds: 900,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ProgramItemDiscussionMessageBody image delivery', () => {
  it('renders the generated sm/md previews in the thumbnail and viewer without loading the original', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => playback }),
    );

    const { container } = render(<ProgramItemDiscussionMessageBody message={message} mine />);

    await waitFor(() => {
      expect(container.querySelector('img')).toHaveAttribute('src', smUrl);
    });
    const thumbnail = container.querySelector('img');
    expect(thumbnail).toHaveAttribute('srcset', `${smUrl} 1x, ${mdUrl} 2x`);
    expect(thumbnail).not.toHaveAttribute('src', originalUrl);

    fireEvent.click(container.querySelector('button')!);

    await waitFor(() => {
      const images = Array.from(document.querySelectorAll('img'));
      expect(images).toHaveLength(2);
      for (const image of images) {
        expect(image).toHaveAttribute('src', smUrl);
        expect(image).toHaveAttribute('srcset', `${smUrl} 1x, ${mdUrl} 2x`);
        expect(image).not.toHaveAttribute('src', originalUrl);
      }
    });
  });

  // ЗАМЕНЕНО 18.08. Прежний кейс требовал «Превью недоступно» и НИ ОДНОЙ картинки, когда превью не
  // готово. Владелец 18.08 прошёл пациентом по TEST и сообщил: «медиа не прикрепляется к
  // комментарию» — запись в БД проходила, а в пузыре был пустой серый прямоугольник, и клик по нему
  // ничего не открывал. Превью на TEST не готово никогда: крон превью на боксе не установлен
  // (`deploy/HOST_DEPLOY_README.md`), поэтому «ждать превью» — ожидание без конца.
  // Превью остаётся предпочтительным источником (кейс выше), но единственным условием показа — нет.
  it.each(['pending', 'skipped', 'failed'] as const)(
    'показывает оригинал, когда превью в статусе %s',
    async (status) => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ ...playback, preview: { status, smUrl: null, mdUrl: null } }),
        }),
      );

      const { container } = render(<ProgramItemDiscussionMessageBody message={message} mine />);

      await waitFor(() => {
        expect(container.querySelector('img')).toHaveAttribute('src', originalUrl);
      });
    },
  );

  it('оставляет состояние ошибки, когда метаданные воспроизведения не отдались', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    const { container, getByText } = render(
      <ProgramItemDiscussionMessageBody message={message} mine />,
    );

    await waitFor(() => {
      expect(getByText('Превью недоступно')).toBeInTheDocument();
    });
    expect(container.querySelector('img')).toBeNull();
  });
});

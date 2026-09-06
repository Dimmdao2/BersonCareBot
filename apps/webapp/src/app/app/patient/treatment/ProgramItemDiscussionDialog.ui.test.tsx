import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MediaPlaybackPayload } from '@/modules/media/playbackPayloadTypes';
import type { ProgramItemDiscussionMessage } from '@/modules/program-item-discussion/types';
import { ProgramItemDiscussionDialog } from './ProgramItemDiscussionDialog';

/**
 * Владелец (бриф этапа): «closing returns to discussion and does not erase draft/thread» и
 * «video preview … must return to the still-mounted discussion when closed».
 *
 * Отказ, который ловят эти тесты: пациент набрал комментарий, открыл поверх треда второй слой
 * (выбор источника вложения или полноэкранное медиа) и после его закрытия получил закрытое
 * обсуждение с потерянным черновиком. Отказ дорогой (потерян написанный человеком текст) и
 * молчаливый (выглядит как штатное закрытие модалки), а конструкцией не выражается: сохранение
 * зависит от того, где смонтирован вложенный слой.
 *
 * Геометрию, скролл и затемнение эти тесты НЕ проверяют — это живая приёмка (AGENTS.md §10a).
 */

const instanceId = '22222222-2222-4222-8222-222222222222';
const itemId = '44444444-4444-4444-8444-444444444444';
const mediaId = '00000000-0000-4000-8000-000000000099';
const basePath = `/api/patient/treatment-program-instances/${instanceId}/items/${itemId}/discussion`;

const textMessage: ProgramItemDiscussionMessage = {
  id: 'message-text',
  instanceStageItemId: itemId,
  patientUserId: 'patient-1',
  senderRole: 'admin',
  origin: 'support_admin_reply',
  body: 'Как ощущения после подхода?',
  mediaFileId: null,
  supportMessageId: null,
  createdAt: '2026-09-01T08:00:00.000Z',
};

const mediaMessage: ProgramItemDiscussionMessage = {
  id: 'message-media',
  instanceStageItemId: itemId,
  patientUserId: 'patient-1',
  senderRole: 'patient',
  origin: 'patient_observation',
  body: null,
  mediaFileId: mediaId,
  supportMessageId: null,
  createdAt: '2026-09-01T09:00:00.000Z',
};

const olderMessage: ProgramItemDiscussionMessage = {
  ...textMessage,
  id: 'message-older',
  body: 'Предыдущая рекомендация врача',
  createdAt: '2026-08-31T08:00:00.000Z',
};

const patientTextMessage: ProgramItemDiscussionMessage = {
  ...textMessage,
  id: 'message-patient',
  senderRole: 'patient',
  origin: 'patient_observation',
  body: 'Выполнил подход',
  createdAt: '2026-09-01T09:00:00.000Z',
};

const imagePlayback: MediaPlaybackPayload = {
  mediaId,
  delivery: 'file',
  mimeType: 'image/jpeg',
  durationSeconds: null,
  posterUrl: null,
  preview: {
    status: 'ready',
    smUrl: `/api/media/${mediaId}/preview/sm`,
    mdUrl: `/api/media/${mediaId}/preview/md`,
    standardRendition: true,
  },
  hls: null,
  progressive: { url: `/api/media/${mediaId}` },
  expiresInSeconds: 900,
};

function stubDiscussionFetch(messages: ProgramItemDiscussionMessage[]) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/playback')) {
      return { ok: true, json: async () => imagePlayback } as unknown as Response;
    }
    if (url.endsWith('/read')) {
      return { ok: true, json: async () => ({ ok: true }) } as unknown as Response;
    }
    return {
      ok: true,
      json: async () => ({ ok: true, messages, pageInfo: { nextCursor: null } }),
    } as unknown as Response;
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/**
 * Хозяин `open`, как на живых страницах программы: закрытие обсуждения проходит через состояние
 * вызывающего. Без этого каскадное закрытие слоёв осталось бы незаметным для теста.
 */
function DiscussionHost(props: { mediaSubmissionEnabled?: boolean }) {
  const [open, setOpen] = useState(true);
  return (
    <ProgramItemDiscussionDialog
      instanceId={instanceId}
      itemId={itemId}
      itemLabel="Приседания у стены"
      open={open}
      onOpenChange={setOpen}
      mediaSubmissionEnabled={props.mediaSubmissionEnabled ?? false}
    />
  );
}

/** Модалка, в теле которой лежит переданный заголовок. */
function layerWithTitle(title: string): HTMLElement {
  const heading = screen.getByText(title);
  const layer = heading.closest('[data-slot="dialog-content"], [data-slot="drawer-content"]');
  if (!(layer instanceof HTMLElement)) throw new Error(`no modal layer around "${title}"`);
  return layer;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('patient exercise discussion — вложенные слои поверх треда', () => {
  it('дозагружает предыдущую страницу, сохраняя уже показанный тред', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(
          typeof input === 'string' ? input : input.toString(),
          window.location.origin,
        );
        if (url.pathname.endsWith('/read')) {
          return { ok: true, json: async () => ({ ok: true }) } as unknown as Response;
        }
        if (url.searchParams.get('cursor') === 'cursor-older') {
          return {
            ok: true,
            json: async () => ({
              ok: true,
              messages: [olderMessage, textMessage],
              pageInfo: { nextCursor: null },
            }),
          } as unknown as Response;
        }
        return {
          ok: true,
          json: async () => ({
            ok: true,
            messages: [textMessage],
            pageInfo: { nextCursor: 'cursor-older' },
          }),
        } as unknown as Response;
      }),
    );

    render(<DiscussionHost />);
    await screen.findByText('Как ощущения после подхода?');
    fireEvent.click(screen.getByRole('button', { name: 'Показать предыдущие' }));

    expect(await screen.findByText('Предыдущая рекомендация врача')).toBeInTheDocument();
    expect(screen.getByText('Как ощущения после подхода?')).toBeInTheDocument();
  });

  it('отправляет комментарий и сохраняет mark-read/onRead контракт', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const onRead = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        calls.push({ url, init });
        if (url.endsWith('/read')) {
          return { ok: true, json: async () => ({ ok: true }) } as unknown as Response;
        }
        if (init?.method === 'POST') {
          const submitted = JSON.parse(String(init.body)) as { body: string };
          return {
            ok: true,
            json: async () => ({
              ok: true,
              message: { ...patientTextMessage, id: 'message-new', body: submitted.body },
            }),
          } as unknown as Response;
        }
        return {
          ok: true,
          json: async () => ({ ok: true, messages: [textMessage], pageInfo: { nextCursor: null } }),
        } as unknown as Response;
      }),
    );

    render(
      <ProgramItemDiscussionDialog
        instanceId={instanceId}
        itemId={itemId}
        itemLabel="Приседания у стены"
        open
        onOpenChange={vi.fn()}
        onRead={onRead}
      />,
    );
    await screen.findByText('Как ощущения после подхода?');
    fireEvent.change(screen.getByLabelText('Текст комментария'), {
      target: { value: 'Сегодня легче' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Отправить' }));

    expect(await screen.findByText('Сегодня легче')).toBeInTheDocument();
    const sent = calls.find((call) => call.url === basePath && call.init?.method === 'POST');
    expect(JSON.parse(String(sent?.init?.body))).toEqual({ body: 'Сегодня легче' });
    expect(calls.some((call) => call.url === `${basePath}/read`)).toBe(true);
    expect(onRead).toHaveBeenCalledTimes(2);
  });

  it('опрос обновляет отметку прочтения исходящего комментария', async () => {
    let pollTick: (() => void | Promise<void>) | null = null;
    vi.spyOn(window, 'setInterval').mockImplementation(((
      handler: TimerHandler,
      timeout?: number,
    ) => {
      if (typeof handler === 'function' && timeout === 15000) {
        pollTick = handler as () => void | Promise<void>;
      }
      return 17;
    }) as typeof window.setInterval);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(
          typeof input === 'string' ? input : input.toString(),
          window.location.origin,
        );
        if (url.pathname.endsWith('/read')) {
          return { ok: true, json: async () => ({ ok: true }) } as unknown as Response;
        }
        const polling = url.searchParams.get('limit') === '1';
        return {
          ok: true,
          json: async () => ({
            ok: true,
            messages: [patientTextMessage],
            pageInfo: { nextCursor: null },
            peerLastReadAt: polling ? '2026-09-01T10:00:00.000Z' : null,
          }),
        } as unknown as Response;
      }),
    );

    render(<DiscussionHost />);
    await screen.findByText('Выполнил подход');
    expect(document.querySelector('[data-delivery-status="sent"]')).not.toBeNull();
    expect(pollTick).not.toBeNull();
    await act(async () => {
      await pollTick?.();
    });

    await waitFor(() => {
      expect(document.querySelector('[data-delivery-status="read"]')).not.toBeNull();
    });
  });

  it('оставляет обсуждение и набранный черновик после закрытия выбора источника вложения', async () => {
    stubDiscussionFetch([textMessage]);

    render(<DiscussionHost mediaSubmissionEnabled />);

    await screen.findByText('Как ощущения после подхода?');
    const composer = screen.getByLabelText('Текст комментария');
    fireEvent.change(composer, { target: { value: 'Болит колено на третьем подходе' } });

    fireEvent.click(screen.getByLabelText('Отправить фото или видео'));
    const nested = await screen.findByText('Добавить фото или видео');
    expect(nested).toBeInTheDocument();

    fireEvent.click(
      within(layerWithTitle('Добавить фото или видео')).getByRole('button', { name: 'Close' }),
    );

    await waitFor(() => {
      expect(screen.queryByText('Добавить фото или видео')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Как ощущения после подхода?')).toBeInTheDocument();
    expect(screen.getByLabelText('Текст комментария')).toHaveValue(
      'Болит колено на третьем подходе',
    );
  });

  it('возвращает в тот же тред с черновиком после закрытия полноэкранного просмотра медиа', async () => {
    stubDiscussionFetch([textMessage, mediaMessage]);

    render(<DiscussionHost />);

    await screen.findByText('Как ощущения после подхода?');
    fireEvent.change(screen.getByLabelText('Текст комментария'), {
      target: { value: 'Записал видео после разминки' },
    });

    const thread = layerWithTitle('Комментарии');
    const attachment = await waitFor(() => {
      const button = thread.querySelector('img')?.closest('button');
      if (!(button instanceof HTMLElement)) throw new Error('attachment is not clickable yet');
      return button;
    });
    fireEvent.click(attachment);

    /* Полноэкранный просмотр опознаётся своим собственным закрытием «Закрыть»;
       у модалки обсуждения под ним закрытие называется «Close». */
    const closeViewer = await screen.findByRole('button', { name: 'Закрыть' });
    fireEvent.click(closeViewer);

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Закрыть' })).not.toBeInTheDocument();
    });
    expect(screen.getByText('Как ощущения после подхода?')).toBeInTheDocument();
    expect(screen.getByLabelText('Текст комментария')).toHaveValue('Записал видео после разминки');
  });
});

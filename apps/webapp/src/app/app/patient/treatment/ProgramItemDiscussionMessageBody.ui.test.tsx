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
  preview: { status: 'ready', smUrl, mdUrl, standardRendition: true },
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

  it('shows the unavailable state without issuing an image request when preview generation failed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ...playback,
          preview: { status: 'failed', smUrl: null, mdUrl: null, standardRendition: true },
        }),
      }),
    );

    const { container, getByText } = render(
      <ProgramItemDiscussionMessageBody message={message} mine />,
    );

    await waitFor(() => {
      expect(getByText('Превью недоступно')).toBeInTheDocument();
    });
    expect(container.querySelector('img')).toBeNull();
  });
  it('shows the stored file while the thumbnail is still missing once the upload was converted', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ...playback,
          mimeType: 'image/webp',
          preview: { status: 'pending', smUrl: null, mdUrl: null, standardRendition: true },
        }),
      }),
    );

    const { container } = render(<ProgramItemDiscussionMessageBody message={message} mine />);

    await waitFor(() => {
      expect(container.querySelector('img')).toHaveAttribute('src', originalUrl);
    });
    /* The stored object IS the standard rendition; there is no 1x/2x pair to advertise. */
    expect(container.querySelector('img')).not.toHaveAttribute('srcset');
  });

  it('requests no image at all while the thumbnail is missing and the upload was not converted', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ...playback,
          preview: { status: 'pending', smUrl: null, mdUrl: null, standardRendition: false },
        }),
      }),
    );

    const { container } = render(<ProgramItemDiscussionMessageBody message={message} mine />);

    await waitFor(() => {
      expect(container.querySelector('button')).toBeInTheDocument();
    });
    expect(container.querySelector('img')).toBeNull();
    fireEvent.click(container.querySelector('button')!);
    expect(document.querySelector('img')).toBeNull();
  });

  /* `standardRendition: true` on purpose: the status must win over the conversion fact. */
  it('keeps the unavailable state for an image the size guard never converted', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ...playback,
          preview: { status: 'skipped', smUrl: null, mdUrl: null, standardRendition: true },
        }),
      }),
    );

    const { container, getByText } = render(
      <ProgramItemDiscussionMessageBody message={message} mine />,
    );

    await waitFor(() => {
      expect(getByText('Превью не создаётся')).toBeInTheDocument();
    });
    expect(container.querySelector('img')).toBeNull();
  });
});

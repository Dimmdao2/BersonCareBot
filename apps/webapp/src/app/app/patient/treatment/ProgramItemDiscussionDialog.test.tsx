/** @vitest-environment jsdom */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProgramItemDiscussionDialog } from './ProgramItemDiscussionDialog';

vi.mock('./ProgramItemDiscussionMediaPicker', () => ({
  ProgramItemDiscussionMediaPicker: () => (
    <button type="button" aria-label="Добавить файл">
      Файл
    </button>
  ),
}));

const instanceId = '00000000-0000-4000-8000-000000000111';
const itemId = '00000000-0000-4000-8000-000000000222';
const basePath = `/api/patient/treatment-program-instances/${instanceId}/items/${itemId}/discussion`;

function discussionResponse() {
  return new Response(
    JSON.stringify({
      ok: true,
      messages: [],
      pageInfo: { nextCursor: null },
      peerLastReadAt: null,
    }),
  );
}

describe('ProgramItemDiscussionDialog', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps attachments opt-in and sends trimmed comments through the existing endpoint', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === basePath && init?.method === 'POST') {
        return new Response(JSON.stringify({ ok: true, message: null }));
      }
      if (url === `${basePath}/read`) {
        return new Response(JSON.stringify({ ok: true }));
      }
      return discussionResponse();
    });
    vi.stubGlobal('fetch', fetchMock);

    const { rerender } = render(
      <ProgramItemDiscussionDialog
        instanceId={instanceId}
        itemId={itemId}
        open
        onOpenChange={() => {}}
      />,
    );

    const input = await screen.findByRole('textbox', { name: 'Текст комментария' });
    expect(screen.queryByRole('button', { name: 'Добавить файл' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Отправить' })).toBeDisabled();

    await userEvent.type(input, '  Комментарий пациента  ');
    await userEvent.click(screen.getByRole('button', { name: 'Отправить' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(basePath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: 'Комментарий пациента' }),
      });
    });

    rerender(
      <ProgramItemDiscussionDialog
        instanceId={instanceId}
        itemId={itemId}
        open
        onOpenChange={() => {}}
        mediaSubmissionEnabled
      />,
    );
    expect(screen.getByRole('button', { name: 'Добавить файл' })).toBeInTheDocument();
  });
});

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PatientTabFiles } from './PatientTabFiles';

const patientId = '22222222-2222-4222-8222-222222222222';
const pendingFileId = '66666666-6666-4666-8666-666666666666';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function beginUpload(): void {
  render(<PatientTabFiles userId={patientId} initialFiles={[]} />);
  fireEvent.click(screen.getByTitle('Загрузить файл'));
  const input = document.querySelector<HTMLInputElement>('#upload-file-input');
  if (!input) throw new Error('upload input did not render');
  fireEvent.change(input, {
    target: {
      files: [new File([new Uint8Array([0xff, 0xd8, 0xff])], 'photo.jpg', { type: 'image/jpeg' })],
    },
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('patient files two-stage upload UI', () => {
  it('keeps the upload panel open and shows presign failure instead of success', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ ok: false, error: 'presign_failed' }, 500));

    beginUpload();

    expect(await screen.findByText('presign_failed')).toBeInTheDocument();
    expect(screen.getByText('Загрузить файл')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('keeps the upload panel open and shows PUT failure instead of success', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse(
          {
            ok: true,
            file: { id: pendingFileId },
            uploadUrl: 'http://s3.test/upload',
          },
          201,
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 502 }));

    beginUpload();

    expect(await screen.findByText('S3 ошибка: 502')).toBeInTheDocument();
    expect(screen.getByText('Загрузить файл')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('keeps the upload panel open and shows confirm failure instead of success', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse(
          {
            ok: true,
            file: { id: pendingFileId },
            uploadUrl: 'http://s3.test/upload',
          },
          201,
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(jsonResponse({ ok: false, error: 'file_signature_mismatch' }, 415));

    beginUpload();

    expect(await screen.findByText('file_signature_mismatch')).toBeInTheDocument();
    expect(screen.getByText('Загрузить файл')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2]?.[0]).toBe(
      `/api/doctor/patients/${patientId}/files/${pendingFileId}/confirm`,
    );
  });

  it('closes and refreshes only after presign, PUT, and confirm all succeed', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse(
          {
            ok: true,
            file: { id: pendingFileId },
            uploadUrl: 'http://s3.test/upload',
          },
          201,
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, file: { id: pendingFileId } }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, files: [] }));

    beginUpload();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    await waitFor(() =>
      expect(screen.queryByText('Перетащите файл или нажмите для выбора')).not.toBeInTheDocument(),
    );
    expect(fetchMock.mock.calls[2]?.[0]).toBe(
      `/api/doctor/patients/${patientId}/files/${pendingFileId}/confirm`,
    );
    expect(fetchMock.mock.calls[3]?.[0]).toBe(`/api/doctor/patients/${patientId}/files`);
  });
});

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PatientTabFiles } from './PatientTabFiles';

const patientId = '22222222-2222-4222-8222-222222222222';
const pendingFileId = '66666666-6666-4666-8666-666666666666';
const storedFile = {
  id: pendingFileId,
  patientUserId: patientId,
  category: 'анализ' as const,
  fileName: 'result.pdf',
  s3Key: 'patient-files/result.pdf',
  s3Bucket: 'private',
  mimeType: 'application/pdf',
  sizeBytes: 1024,
  visitId: null,
  mediaFileId: '77777777-7777-4777-8777-777777777777',
  uploadedByUserId: '88888888-8888-4888-8888-888888888888',
  createdAt: '2026-08-01T10:00:00.000Z',
  previewUrl: null,
};

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

describe('patient file deletion UI', () => {
  it('removes the file and visibly confirms that storage was released', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ ok: true }));
    render(<PatientTabFiles userId={patientId} initialFiles={[storedFile]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Удалить' }));
    expect(await screen.findByText('Удалить файл?')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Удалить' }).at(-1)!);

    expect(await screen.findByText('Файл удалён. Место в хранилище освобождено.')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(`/api/doctor/patients/${patientId}/files/${pendingFileId}`, {
      method: 'DELETE',
    });
  });

  it('keeps the confirmation open and shows a deletion error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ ok: false }, 500));
    render(<PatientTabFiles userId={patientId} initialFiles={[storedFile]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Удалить' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Удалить' }).at(-1)!);

    expect(await screen.findByText('Не удалось удалить файл.')).toBeInTheDocument();
    expect(screen.getByText('Удалить файл?')).toBeInTheDocument();
  });
});

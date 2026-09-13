import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Стена этого пути: размеры иконки клиники режутся ТОЛЬКО из нашего вывода.
 *
 * Правило владельца 14.09.2026 — «сырой исходник мы не трогаем в бою вообще… нет конвертации —
 * ждём и видим, что файл готовится». Тест проверяет обе половины: рендишна нет — наружу уходит
 * «готовится» и хранилище не читается вовсе; рендишн есть — читается именно ключ нашего вывода.
 */

const mocks = vi.hoisted(() => ({
  source: vi.fn(),
  head: vi.fn(),
  put: vi.fn(),
  read: vi.fn(),
  encode: vi.fn(),
}));

vi.mock('@/app-layer/logging/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/app-layer/media/s3MediaStorage', () => ({
  getOrgAppIconRenditionSource: mocks.source,
}));
vi.mock('@/app-layer/media/s3Client', () => ({
  s3HeadObject: mocks.head,
  s3PutObjectBody: mocks.put,
}));
vi.mock('@/app-layer/media/s3DeliveryClient', () => ({
  deliveryGetPrivateObjectBuffer: mocks.read,
}));
vi.mock('@/modules/media/orgAppIconRenditions', async () => {
  const actual = await vi.importActual<typeof import('@/modules/media/orgAppIconRenditions')>(
    '@/modules/media/orgAppIconRenditions',
  );
  return { ...actual, encodeOrgAppIconRenditions: mocks.encode };
});

const { writeOrgAppIconRenditions } = await import('@/app-layer/media/orgAppIconRenditions');

const MEDIA_ID = '9b914fdb-962c-4506-ae22-ccdb3cf41d31';

describe('writeOrgAppIconRenditions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.head.mockResolvedValue(false);
  });

  it('ещё не готовый рендишн — «готовится», и в хранилище никто не идёт', async () => {
    mocks.source.mockResolvedValue({ status: 'processing' });

    const outcome = await writeOrgAppIconRenditions(MEDIA_ID);

    expect(outcome).toEqual({ ok: false, reason: 'source_processing' });
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.encode).not.toHaveBeenCalled();
  });

  it('строки нет или это не картинка — «файл недоступен»', async () => {
    mocks.source.mockResolvedValue({ status: 'missing' });

    const outcome = await writeOrgAppIconRenditions(MEDIA_ID);

    expect(outcome).toEqual({ ok: false, reason: 'source_unavailable' });
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it('готовый рендишн — читается ключ НАШЕГО вывода, не загруженный файл', async () => {
    mocks.source.mockResolvedValue({
      status: 'ready',
      object: { key: `media/${MEDIA_ID}/standard.webp`, target: 'library' },
    });
    mocks.read.mockResolvedValue({ ok: true, buf: Buffer.from('webp') });
    mocks.encode.mockResolvedValue([
      { variant: '32', key: `org-app-icons/${MEDIA_ID}/32.png`, buffer: Buffer.from('png') },
    ]);
    mocks.put.mockResolvedValue(undefined);

    const outcome = await writeOrgAppIconRenditions(MEDIA_ID);

    expect(outcome).toEqual({ ok: true, keys: [`org-app-icons/${MEDIA_ID}/32.png`] });
    expect(mocks.read).toHaveBeenCalledWith(`media/${MEDIA_ID}/standard.webp`, 'library');
    /* Способность hot-only: третьего аргумента с хранилищем у неё нет по сигнатуре. */
    expect(mocks.read.mock.calls[0]).toHaveLength(2);
  });
});

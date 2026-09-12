import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { MediaPreviewOrder, MediaWorkerControlPort } from './control.js';
import type { PreviewContext } from './processPreviewJob.js';

/**
 * Проверяется ПОРЯДОК, в котором рендишн становится фактом: он лёг → его видно в хранилище →
 * эскизы легли → и лишь ПОСЛЕ этого вебаппу разрешено пометить строку готовой.
 *
 * Отчёт `previewDoneImage` — единственная команда, по которой вебапп ставит
 * `standard_rendition_at`, а по этой колонке каждая дверь выдачи решает, что отдавать. Поэтому
 * «на отказе отчёта нет» равно «дверь не начнёт ссылаться на объект, которого нет»: тест
 * покраснеет ровно тогда, когда стена уйдёт, а не когда изменится форма кода.
 *
 * Второе, что здесь закреплено, — М7-разделение бакетов: исходник читается из СЫРОГО, выход
 * пишется в бакет ВЫДАЧИ. Слить их обратно в одну привязку значит промахнуться мимо исходника на
 * каждой свежей библиотечной загрузке, и ни один другой тест этого не ловит.
 */

const downloadObjectToFile = vi.fn(async () => {});
const headObjectExists = vi.fn(async () => true);
const putObjectWithRetry = vi.fn(async () => {});
vi.mock('./s3.js', () => ({ downloadObjectToFile, headObjectExists, putObjectWithRetry }));

const encodeStandardImageRendition = vi.fn(async () => ({
  buffer: Buffer.from('webp-bytes'),
  mimeType: 'image/webp' as const,
  width: 1440,
  height: 1080,
  animated: false,
}));
const thumbnailsSmMd = vi.fn(async () => ({ sm: Buffer.from('sm'), md: Buffer.from('md') }));
vi.mock('./imageRendition.js', () => ({
  encodeStandardImageRendition,
  thumbnailsSmMd,
  imageDimensions: vi.fn(async () => ({ width: 1920, height: 1080 })),
}));

const extractPosterWithFallback = vi.fn(async () => {});
vi.mock('./ffmpeg/extractPosterWithFallback.js', () => ({ extractPosterWithFallback }));
vi.mock('./magickConvert.js', () => ({ runMagickConvert: vi.fn(async () => {}) }));
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, readFile: vi.fn(async () => Buffer.from('raw-source-bytes')) };
});

const { processPreviewOrder } = await import('./processPreviewJob.js');

function order(
  plan: MediaPreviewOrder['plan'],
  storageTarget: MediaPreviewOrder['storageTarget'] = 'patient',
): MediaPreviewOrder {
  return {
    mediaId: 'media-7',
    attempts: 0,
    storageTarget,
    plan,
    standardKey: 'media/media-7/standard.webp',
    smKey: 'previews/sm/media-7.jpg',
    mdKey: 'previews/md/media-7.jpg',
  };
}

function control(): MediaWorkerControlPort {
  return {
    ready: vi.fn(), errorTrackingConfig: vi.fn(), isolationFailure: vi.fn(), claim: vi.fn(),
    load: vi.fn(), watermarkEnabled: vi.fn(), processing: vi.fn(), retry: vi.fn(), failed: vi.fn(),
    doneHls: vi.fn(), doneProgram: vi.fn(), previewClaim: vi.fn(),
    previewHostedBytes: vi.fn(async () => ({ kind: 'ready' as const, bytesBase64: 'AAAA' })),
    previewDoneImage: vi.fn(), previewDonePoster: vi.fn(), previewFailed: vi.fn(),
    previewTick: vi.fn(),
  };
}

const HOT_BUCKET = 'delivery-bucket';
const RAW_BUCKET = 'raw-uploads-bucket';

function context(ctl: MediaWorkerControlPort): PreviewContext {
  return {
    control: ctl,
    storageFor: () => ({ client: {} as never, bucket: HOT_BUCKET }),
    /* Как в настоящей привязке (`storageBindings.ts`): у `patient` разделения нет. */
    sourceStorageFor: (target) => ({
      client: {} as never,
      bucket: target === 'patient' ? HOT_BUCKET : RAW_BUCKET,
    }),
    ffmpegBin: '/usr/bin/ffmpeg',
    previewTimeoutMs: 1000,
    magickCandidates: ['magick'],
    log: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() } as never,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  headObjectExists.mockResolvedValue(true);
  encodeStandardImageRendition.mockResolvedValue({
    buffer: Buffer.from('webp-bytes'),
    mimeType: 'image/webp',
    width: 1440,
    height: 1080,
    animated: false,
  });
});

describe('processPreviewOrder', () => {
  it('reports the image only after the rendition is readable back and both thumbnails are stored', async () => {
    const ctl = control();
    const events: string[] = [];
    putObjectWithRetry.mockImplementation((async (
      _client: unknown,
      _bucket: unknown,
      key: string,
    ) => {
      events.push(`put:${key}`);
    }) as never);
    headObjectExists.mockImplementation((async () => {
      events.push('head');
      return true;
    }) as never);
    (ctl.previewDoneImage as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      events.push('report');
    });

    await expect(processPreviewOrder(context(ctl), order({ kind: 'image', sourceKey: 'raw.jpg' })))
      .resolves.toBe('processed');

    expect(events).toEqual([
      'put:media/media-7/standard.webp',
      'head',
      'put:previews/sm/media-7.jpg',
      'put:previews/md/media-7.jpg',
      'report',
    ]);
  });

  it('never reports a rendition the storage cannot read back', async () => {
    const ctl = control();
    headObjectExists.mockResolvedValue(false);

    await expect(processPreviewOrder(context(ctl), order({ kind: 'image', sourceKey: 'raw.jpg' })))
      .resolves.toBe('error');

    expect(ctl.previewDoneImage).not.toHaveBeenCalled();
    expect(ctl.previewFailed).toHaveBeenCalledWith(
      'media-7',
      'standard_rendition_head_missing_after_upload',
    );
  });

  it('writes nothing and reports nothing when the re-encode itself fails', async () => {
    const ctl = control();
    encodeStandardImageRendition.mockRejectedValueOnce(
      new Error('Input buffer contains unsupported image format') as never,
    );

    await expect(processPreviewOrder(context(ctl), order({ kind: 'image', sourceKey: 'raw.jpg' })))
      .resolves.toBe('error');

    expect(putObjectWithRetry).not.toHaveBeenCalled();
    expect(ctl.previewDoneImage).not.toHaveBeenCalled();
  });

  /*
   * Единственный вход ffmpeg — локальный файл, и белый список протоколов это закрепляет: контейнер
   * прислали снаружи, и ссылку наружу внутри него ffmpeg сам не пойдёт разрешать.
   */
  it('gives ffmpeg a local file with the protocol whitelist pinned to file', async () => {
    const ctl = control();

    await expect(
      processPreviewOrder(context(ctl), order({ kind: 'video_poster', sourceKey: 'raw.mp4' })),
    ).resolves.toBe('processed');

    const call = (
      extractPosterWithFallback.mock.calls as unknown as Array<
        [{ inputFile: string; protocolWhitelist?: string }]
      >
    )[0]![0];
    expect(call.protocolWhitelist).toBe('file');
    expect(call.inputFile.startsWith('http')).toBe(false);
    expect(ctl.previewDonePoster).toHaveBeenCalledWith('media-7', { width: 1920, height: 1080 });
  });

  /*
   * М7: у библиотечной строки исходник лежит в СЫРОМ бакете, а рендишн и эскизы обязаны лечь в
   * бакет ВЫДАЧИ. Чтение через ту же привязку, куда идёт запись, промахивалось бы мимо объекта на
   * каждой свежей загрузке, а рендишн, положенный в сырой бакет, не прочитала бы ни одна дверь.
   */
  it('reads the library source from the raw bucket and writes the output to the delivery bucket', async () => {
    const ctl = control();

    await expect(
      processPreviewOrder(
        context(ctl),
        order({ kind: 'image', sourceKey: 'org-1/media/media-7/photo.heic' }, 'library'),
      ),
    ).resolves.toBe('processed');

    const download = (
      downloadObjectToFile.mock.calls as unknown as Array<[unknown, string, string, string]>
    )[0]!;
    expect(download[1]).toBe(RAW_BUCKET);
    expect(download[2]).toBe('org-1/media/media-7/photo.heic');

    const putBuckets = (
      putObjectWithRetry.mock.calls as unknown as Array<[unknown, string, string]>
    ).map((call) => call[1]);
    expect(putBuckets).toEqual([HOT_BUCKET, HOT_BUCKET, HOT_BUCKET]);
  });

  /* Судьбу строки решает вебапп: воркер отдаёт текст ошибки и ничего не классифицирует сам. */
  it('hands the provider failure text to the webapp instead of deciding the row is hopeless', async () => {
    const ctl = control();
    (ctl.previewHostedBytes as ReturnType<typeof vi.fn>).mockResolvedValue({
      kind: 'error',
      error: 'hosted_video_preview_unavailable: video_deleted',
    });

    await expect(processPreviewOrder(context(ctl), order({ kind: 'hosted_thumbnail' })))
      .resolves.toBe('error');

    expect(ctl.previewFailed).toHaveBeenCalledWith(
      'media-7',
      'hosted_video_preview_unavailable: video_deleted',
    );
    expect(ctl.previewDoneImage).not.toHaveBeenCalled();
  });
});

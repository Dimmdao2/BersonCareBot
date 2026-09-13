import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * Шов очереди превью со стороны базы. Проверяется то, что он ДЕЛАЕТ, а не как написан:
 *
 *  1. `standard_rendition_at` ставится и является ЕДИНСТВЕННЫМ фактом готовности рендишна: по нему
 *     одному дверь выдачи решает, что отдавать, и по детерминированному ключу от `media_id`;
 *  2. М7 (`docs/_TODO/STORAGE_PACKAGES_2026-09-10.md`): `s3_key`/`size_bytes` загрузки НЕ
 *     переписываются, и исходник НЕ удаляется — он остаётся в сыром бакете, иначе ломаются М6
 *     («исходник скачивает только загрузивший его специалист») и счётчик объёма;
 *  3. отчёт по строке, которую воркер больше не держит, не откатывает чужой результат;
 *  4. судьбу отказавшей строки решает вебапп: «навсегда» → skipped, иначе счётчик и backoff, а
 *     после исчерпания попыток — failed.
 */

const runWebappSql = vi.fn(async () => ({ rows: [] as unknown[] }));
let nextSelectRows: Record<string, unknown>[] = [];
const s3DeleteObject = vi.fn(async () => {});

vi.mock('@/infra/logging/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/infra/db/client', () => ({ getPool: () => ({}) }));
vi.mock('@/infra/db/withClient', () => ({
  withPoolTransaction: async (_pool: unknown, fn: (client: unknown) => Promise<unknown>) => fn({}),
}));
vi.mock('@/infra/db/runWebappSql', () => ({
  getWebappSqlFromPgClient: () => {
    /* Цепочка drizzle — thenable: и `…limit(1)`, и `…limit(1).for('update')` отдают те же строки. */
    const query: Record<string, unknown> = {};
    query.from = () => query;
    query.where = () => query;
    query.orderBy = () => query;
    query.limit = () => query;
    query.for = async () => nextSelectRows;
    query.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(nextSelectRows).then(resolve, reject);
    return { select: () => query };
  },
  runWebappSql: (...args: unknown[]) => runWebappSql(...(args as [])),
}));
vi.mock('@/infra/s3/client', () => ({
  parseStorageTarget: (value: unknown) => (value === 'patient' ? 'patient' : 'library'),
  s3DeleteObject: (...args: unknown[]) => s3DeleteObject(...(args as [])),
  s3PreviewKey: (id: string, size: string) => `previews/${size}/${id}.jpg`,
  s3StandardImageKey: (id: string) => `media/${id}/standard.webp`,
}));

const {
  claimMediaPreviewOrder,
  completeMediaPreviewImage,
  failMediaPreview,
  releaseBlockedMediaPreviews,
} = await import('./pgMediaPreviewControl');

const MEDIA_ID = '00000000-0000-4000-8000-0000000000c1';

/** Текст каждого выданного оператора, по порядку. */
function issuedSql(): string[] {
  return runWebappSql.mock.calls.map((call) => {
    const query = (call as unknown as unknown[])[1] as { queryChunks?: unknown[] };
    return JSON.stringify(query.queryChunks ?? query);
  });
}

beforeEach(() => {
  runWebappSql.mockReset();
  runWebappSql.mockResolvedValue({ rows: [] });
  s3DeleteObject.mockReset();
  nextSelectRows = [];
});

describe('claimMediaPreviewOrder', () => {
  it('hands out an order with the keys the webapp computed, and leases the row as processing', async () => {
    nextSelectRows = [
      {
        id: MEDIA_ID,
        s3_key: 'media/raw/photo.jpg',
        mime_type: 'image/jpeg',
        size_bytes: '2000000',
        preview_attempts: 1,
        usage_purpose: null,
        hosted_video_source_url: null,
        storage_target: 'patient',
      },
    ];

    const claim = await claimMediaPreviewOrder(15);

    expect(claim.kind).toBe('claimed');
    if (claim.kind !== 'claimed') return;
    expect(claim.order).toMatchObject({
      mediaId: MEDIA_ID,
      attempts: 1,
      storageTarget: 'patient',
      plan: { kind: 'image', sourceKey: 'media/raw/photo.jpg' },
      standardKey: `media/${MEDIA_ID}/standard.webp`,
      smKey: `previews/sm/${MEDIA_ID}.jpg`,
      mdKey: `previews/md/${MEDIA_ID}.jpg`,
    });
    const lease = issuedSql().find((text) => text.includes("preview_status = 'processing'"));
    expect(lease).toBeDefined();
    expect(lease).toContain('preview_next_attempt_at');
  });

  it('closes a row that gets no preview at all without handing any bytes to the worker', async () => {
    nextSelectRows = [
      {
        id: MEDIA_ID,
        s3_key: 'media/raw/report.pdf',
        mime_type: 'application/pdf',
        size_bytes: '1000',
        preview_attempts: 0,
        usage_purpose: null,
        hosted_video_source_url: null,
        storage_target: 'library',
      },
    ];

    /* Строка одна и та же — после `skipped` она больше не выдаётся, поэтому claim выходит в idle. */
    const claim = await claimMediaPreviewOrder(15);

    expect(claim.kind).toBe('idle');
    expect(issuedSql().every((text) => text.includes("preview_status = 'skipped'"))).toBe(true);
  });
});

describe('completeMediaPreviewImage', () => {
  /*
   * М7 реверсировал решение 19.08.2026 («рендишн ВМЕСТО оригинала, оригинал удаляется»). Тест
   * покраснеет, если репоинт вернётся: `s3_key` строки обязан остаться прежним, а фактом готовности
   * быть только `standard_rendition_at`.
   */
  it('фиксирует standard_rendition_at, не трогая s3_key и size_bytes загрузки', async () => {
    nextSelectRows = [{ id: MEDIA_ID }];

    await completeMediaPreviewImage({
      mediaId: MEDIA_ID,
      mimeType: 'image/webp',
      sizeBytes: 120_000,
      width: 1440,
      height: 1080,
    });

    const update = issuedSql().find((text) => text.includes('standard_rendition_at'));
    expect(update).toBeDefined();
    expect(update).toContain('preview_sm_key');
    expect(update).not.toContain('s3_key =');
    expect(update).not.toContain('size_bytes =');
  });

  /*
   * Удаление исходника — это ровно то, что М7 сняло целиком. Отдельный тест на «не удаляет» нужен
   * потому, что удаление здесь необратимо и молча: строка выглядит готовой, а файла, который врач
   * вправе скачать (М6), больше нет.
   */
  it('не удаляет загруженный оригинал ни при каком исходе', async () => {
    nextSelectRows = [{ id: MEDIA_ID }];

    await completeMediaPreviewImage({
      mediaId: MEDIA_ID,
      mimeType: 'image/webp',
      sizeBytes: 1,
      width: 10,
      height: 10,
    });

    expect(s3DeleteObject).not.toHaveBeenCalled();
  });

  /* Аренда истекла, строку доделал другой воркер — опоздавший отчёт не трогает ни строку, ни бакет. */
  it('changes nothing when the row is no longer claimed', async () => {
    nextSelectRows = [];

    await completeMediaPreviewImage({
      mediaId: MEDIA_ID,
      mimeType: 'image/webp',
      sizeBytes: 1,
      width: 10,
      height: 10,
    });

    expect(issuedSql()).toEqual([]);
    expect(s3DeleteObject).not.toHaveBeenCalled();
  });
});

describe('failMediaPreview', () => {
  it('closes a permanently undecodable file as skipped instead of retrying it forever', async () => {
    nextSelectRows = [{ id: MEDIA_ID, attempts: 0 }];

    await failMediaPreview(MEDIA_ID, 'ffmpeg exited with code 1: Invalid data found when processing input');

    const sql = issuedSql();
    expect(sql.some((text) => text.includes("preview_status = 'skipped'"))).toBe(true);
    expect(sql.some((text) => text.includes('preview_attempts ='))).toBe(false);
  });

  it('counts a temporary failure and backs the row off instead of losing it', async () => {
    nextSelectRows = [{ id: MEDIA_ID, attempts: 1 }];

    await failMediaPreview(MEDIA_ID, 'download_timeout');

    const update = issuedSql().find((text) => text.includes('preview_attempts ='));
    expect(update).toBeDefined();
    expect(update).toContain('preview_next_attempt_at');
    expect(update).toContain("preview_status = 'pending'");
  });

  it('stops a row that has used up its attempts', async () => {
    nextSelectRows = [{ id: MEDIA_ID, attempts: 4 }];

    await failMediaPreview(MEDIA_ID, 'download_timeout');

    expect(issuedSql().some((text) => text.includes("preview_status = 'failed'"))).toBe(true);
  });

  it('ignores a failure for a row the worker no longer holds', async () => {
    nextSelectRows = [];

    await failMediaPreview(MEDIA_ID, 'download_timeout');

    expect(issuedSql()).toEqual([]);
  });

  /**
   * Владелец 14.09.2026: «если мы уже определили причину ошибки как НЕТ ДЕКОДЕРА — пытаться
   * повторять это каждые несколько минут — бред». Отказ окружения не жжёт попытки и не планирует
   * следующую: строка ждёт, пока инструмент появится.
   */
  it('defers a row nothing can decode instead of burning attempts on the environment', async () => {
    nextSelectRows = [{ id: MEDIA_ID, attempts: 1 }];

    await failMediaPreview(MEDIA_ID, 'Error: spawn convert ENOENT');

    const sql = issuedSql();
    const blocked = sql.find((text) => text.includes("preview_status = 'blocked'"));
    expect(blocked).toBeDefined();
    expect(blocked).toContain('preview_next_attempt_at = NULL');
    expect(sql.some((text) => text.includes('preview_attempts ='))).toBe(false);
    expect(sql.some((text) => text.includes("preview_status = 'failed'"))).toBe(false);
  });
});

describe('releaseBlockedMediaPreviews', () => {
  it('queues deferred rows again once the worker reports the tool is there', async () => {
    runWebappSql.mockResolvedValue({ rows: [{ id: MEDIA_ID }, { id: MEDIA_ID }] });

    const released = await releaseBlockedMediaPreviews(['heic_decoder']);

    expect(released).toBe(2);
    const update = issuedSql().find((text) => text.includes("preview_status = 'pending'"));
    expect(update).toBeDefined();
    expect(update).toContain("preview_status = 'blocked'");
    expect(update).toContain('preview_attempts = 0');
  });

  it('leaves them deferred while the tool is still missing', async () => {
    const released = await releaseBlockedMediaPreviews([]);

    expect(released).toBe(0);
    expect(issuedSql()).toEqual([]);
  });
});

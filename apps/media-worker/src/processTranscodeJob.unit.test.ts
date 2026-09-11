import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClaimedJob, ControlledMedia, MediaWorkerControlPort } from './control.js';
import {
  deriveEligibleHlsRungs,
  HLS_RUNG_LADDER,
  parseFfmpegBitrateTokenBps,
  probeFmp4VariantFrame,
  rungAudioBitrateBps,
  rungBitrateCeilingBps,
  rungVideoCeilingFromProbeBps,
} from './processTranscodeJob.js';
import type { StorageBinding } from './s3.js';

/**
 * ORACLE: `VIDEO_DELIVERY_COST_AND_METERING_2026-09-11.md` items 2 and 5a (owner, 11.09.2026):
 * "720 плодятся из 480? Такое надо чистить нахуй" (never upscale a rung above the source) and a
 * ~1600kbps/576p rung between 900 and 2800.
 */
describe('deriveEligibleHlsRungs', () => {
  it('never advertises a rung taller than the source: 480p source gets no 720p and no 576p', () => {
    const rungs = deriveEligibleHlsRungs(854, 480);

    expect(rungs.map((r) => r.label)).toEqual(['360p', '480p']);
    expect(rungs.some((r) => r.width * r.height > 854 * 480)).toBe(false);
  });

  it('a 1080p source gets all four rungs of the ladder', () => {
    const rungs = deriveEligibleHlsRungs(1920, 1080);

    expect(rungs.map((r) => r.label)).toEqual(['360p', '480p', '576p', '720p']);
  });

  it('a source at exactly the 720p rung height includes 720p (fits, not exceeds)', () => {
    const rungs = deriveEligibleHlsRungs(1280, 720);
    expect(rungs.map((r) => r.label)).toEqual(['360p', '480p', '576p', '720p']);
  });

  it('a source smaller than the smallest rung still yields exactly one working rung, never upscaled', () => {
    const rungs = deriveEligibleHlsRungs(426, 240);

    expect(rungs).toHaveLength(1);
    expect(rungs[0]!.height).toBe(240);
    expect(rungs[0]!.width).toBe(426);
    // Bitrate profile borrowed from the smallest ladder rung, not invented.
    expect(rungs[0]!.videoBitrate).toBe(HLS_RUNG_LADDER[0]!.videoBitrate);
  });

  it('rounds an odd native size down to even pixels (libx264 requirement) without upscaling', () => {
    const rungs = deriveEligibleHlsRungs(427, 241);
    expect(rungs[0]!.width).toBe(426);
    expect(rungs[0]!.height).toBe(240);
  });

  /*
   * Формы взяты из библиотеки владельца (`media_files.source_width/source_height`, замер 11.09.2026):
   * 140 роликов из 152 не 16:9, 115 портретные. Отбор по ВЫСОТЕ давал апскейл на 137 из 152 —
   * ступень проходила отбор по короткой для ландшафта оси и растягивалась по длинной.
   */
  const LIBRARY_SHAPES: ReadonlyArray<readonly [number, number, string]> = [
    [640, 480, '4:3, 6 роликов'],
    [360, 480, 'портрет 3:4, 1 ролик'],
    [848, 656, 'почти квадрат'],
    [910, 642, 'почти квадрат'],
    [720, 960, 'портрет 3:4, самая частая форма — 19 роликов'],
    [1080, 1920, 'портрет iPhone'],
    [464, 824, 'узкий портрет, худший случай прежнего отбора'],
    [1920, 1080, 'ландшафт 16:9'],
    [1280, 720, 'ландшафт 16:9'],
    [426, 240, 'меньше младшей ступени'],
  ];

  it.each(LIBRARY_SHAPES)(
    'ни одна ступень не превышает исходник %ix%i (%s)',
    (sourceWidth, sourceHeight) => {
      for (const rung of deriveEligibleHlsRungs(sourceWidth, sourceHeight)) {
        expect(rung.width).toBeLessThanOrEqual(sourceWidth);
        expect(rung.height).toBeLessThanOrEqual(sourceHeight);
      }
    },
  );

  it.each(LIBRARY_SHAPES)(
    'пропорция кадра сохраняется для %ix%i (%s)',
    (sourceWidth, sourceHeight) => {
      const sourceAspect = sourceWidth / sourceHeight;
      for (const rung of deriveEligibleHlsRungs(sourceWidth, sourceHeight)) {
        // Допуск — округление до чётного пикселя на каждой оси.
        expect(Math.abs(rung.width / rung.height - sourceAspect)).toBeLessThan(0.02);
      }
    },
  );

  it('портретный 1080x1920 получает 720-ю ступень как 720x1280, а не 1280x2276', () => {
    const top = deriveEligibleHlsRungs(1080, 1920).at(-1)!;

    expect(top.label).toBe('720p');
    expect([top.width, top.height]).toEqual([720, 1280]);
  });

  it('сверхширокий 2560x1080 попадает в бюджет пикселей, а не раздувает кадр', () => {
    const top = deriveEligibleHlsRungs(2560, 1080).at(-1)!;

    expect(top.label).toBe('720p');
    // По короткой стороне вышло бы 1707x720 = 1,23 млн пикселей при бюджете 921 600.
    expect(top.width * top.height).toBeLessThanOrEqual(921_600);
    expect(Math.abs(top.width / top.height - 2560 / 1080)).toBeLessThan(0.02);
  });

  it('каждая ступень укладывается в свой бюджет пикселей на любой пропорции', () => {
    for (const [w, h] of [
      [1080, 1920],
      [2560, 1080],
      [848, 656],
      [720, 960],
      [1920, 1080],
    ] as const) {
      for (const rung of deriveEligibleHlsRungs(w, h)) {
        expect(rung.width * rung.height).toBeLessThanOrEqual(rung.pixelBudget);
      }
    }
  });

  it('4:3 источник 640x480 теряет больше 10% пикселей на 360-й ступени — получает верхнюю ступень кадром источника', () => {
    const rungs = deriveEligibleHlsRungs(640, 480);

    // Ступень 360p как раньше (уменьшена до своего бюджета), плюс верхняя ступень — кадр источника.
    expect(rungs.map((r) => r.label)).toEqual(['360p', '480p']);
    expect([rungs[0]!.width, rungs[0]!.height]).toEqual([554, 414]);
    expect([rungs.at(-1)!.width, rungs.at(-1)!.height]).toEqual([640, 480]);
  });

  it('портретный 360x480 не получает ни одной растянутой ступени', () => {
    const rungs = deriveEligibleHlsRungs(360, 480);

    expect(rungs.map((r) => r.label)).toEqual(['360p']);
    expect([rungs[0]!.width, rungs[0]!.height]).toEqual([360, 480]);
  });

  /**
   * ORACLE: `VIDEO_DELIVERY_COST_AND_METERING_2026-09-11.md` требование 1, пример для проверки:
   * «848×656 = 556 288 пикселей, между 480p (409 920 → 800k) и 576p (589 824 → 1400k), t = 0,813 →
   * 1288 кбит/с» (owner, 11.09.2026). Метка — по короткой стороне: `656p`, не `576p`.
   */
  it('почти квадратный 848x656 получает верхнюю ступень кадром источника с интерполированным потолком', () => {
    const rungs = deriveEligibleHlsRungs(848, 656);

    expect(rungs.map((r) => r.label)).toEqual(['360p', '480p', '656p']);
    const top = rungs.at(-1)!;
    expect([top.width, top.height]).toEqual([848, 656]);
    // t = (556288 - 409920) / (589824 - 409920) = 0.813589... → 800000 + t*600000 = 1 288 154.
    expect(Number(top.videoBitrate)).toBe(1_288_154);
  });

  it('на 16:9 и 9:16 бюджет даёт привычные 1280x720 и 720x1280', () => {
    expect(deriveEligibleHlsRungs(1920, 1080).at(-1)!.height).toBe(720);
    expect(deriveEligibleHlsRungs(1080, 1920).at(-1)!.width).toBe(720);
  });
});

/**
 * ORACLE: `VIDEO_DELIVERY_COST_AND_METERING_2026-09-11.md` требование 1 (owner, 11.09.2026):
 * «верхняя ступень = кадр исходника, но не выше твоего потолка 720p по площади — согласен».
 */
describe('deriveEligibleHlsRungs — верхняя ступень кадром исходника', () => {
  it('не добавляет ступень, когда исходник ровно на бюджете самой большой влезающей ступени', () => {
    // 854x480 — ровно бюджет 480p (409 920 пикселей); 1.0x бюджета, ниже порога 1.05.
    const rungs = deriveEligibleHlsRungs(854, 480);

    expect(rungs.map((r) => r.label)).toEqual(['360p', '480p']);
    expect(rungs.at(-1)!.width * rungs.at(-1)!.height).toBe(854 * 480);
  });

  it('не добавляет ступень чуть выше бюджета, пока запас меньше 1.05x (не появляется ступень-двойник)', () => {
    // Короткая сторона 460 (не совпадает ни с одной меткой лестницы, чтобы не задеть отдельный тест
    // на различку меток). 409920 * 1.04 округлённо — заведомо ниже порога 1.05.
    const height = 460;
    const width = Math.round((409_920 * 1.04) / height);
    const rungs = deriveEligibleHlsRungs(width, height);

    expect(rungs.map((r) => r.label)).toEqual(['360p', '480p']);
  });

  it('добавляет ступень строго выше порога 1.05x, кадром исходника, без апскейла', () => {
    const height = 460;
    const width = Math.round((409_920 * 1.06) / height);
    const rungs = deriveEligibleHlsRungs(width, height);

    expect(rungs.map((r) => r.label)).toEqual(['360p', '480p', `${height}p`]);
    const top = rungs.at(-1)!;
    // Ширина округляется до чётного пикселя (libx264), как везде — не апскейл, а округление вниз.
    expect(top.width).toBeLessThanOrEqual(width);
    expect(width - top.width).toBeLessThanOrEqual(1);
    expect(top.height).toBe(height);
  });

  it('источник ровно на потолке 921 600 пикселей не получает лишней ступени — верх остаётся 720p', () => {
    const rungs = deriveEligibleHlsRungs(1280, 720);

    expect(rungs.map((r) => r.label)).toEqual(['360p', '480p', '576p', '720p']);
  });

  it('источник выше потолка 921 600 пикселей тоже не получает лишней ступени — верх остаётся 720p', () => {
    // 2000x1200 = 2 400 000 пикселей, больше чем на 1.05x выше бюджета 720p, но потолок владельца не двигаем.
    const rungs = deriveEligibleHlsRungs(2000, 1200);

    expect(rungs.map((r) => r.label)).toEqual(['360p', '480p', '576p', '720p']);
    expect(rungs.at(-1)!.width * rungs.at(-1)!.height).toBeLessThanOrEqual(921_600);
  });

  it('звук новой ступени тоже интерполирован по площади, не переписан вверх фиксированным планом', () => {
    const rungs = deriveEligibleHlsRungs(848, 656);
    const top = rungs.at(-1)!;
    // t = 0.813589..., audio = 96000 + t*(128000-96000) = 122 035.
    expect(Number(top.audioBitrate)).toBe(122_035);
  });

  it('bandwidth новой ступени держит тот же инвариант, что статическая лестница: [потолок+звук, 1.15×]', () => {
    for (const [w, h] of [
      [848, 656],
      [464, 848],
      [910, 642],
    ] as const) {
      const top = deriveEligibleHlsRungs(w, h).at(-1)!;
      const peak = Number(top.videoBitrate) + Number(top.audioBitrate);
      expect(top.bandwidth).toBeGreaterThanOrEqual(peak);
      expect(top.bandwidth).toBeLessThanOrEqual(Math.round(peak * 1.15));
    }
  });

  it('различает метку, когда короткая сторона источника совпадает с меткой уже влезающей ступени лестницы', () => {
    // 1000x480: 480p (409 920) влезает как largest, а короткая сторона источника — тоже 480 —
    // без различки обе ступени легли бы в один каталог `hls/480p`.
    const rungs = deriveEligibleHlsRungs(1000, 480);

    const labels = rungs.map((r) => r.label);
    expect(labels.filter((l) => l === '480p')).toHaveLength(1);
    expect(labels).toContain('480p-src');
    const top = rungs.at(-1)!;
    expect([top.width, top.height]).toEqual([1000, 480]);
  });
});

/**
 * ORACLE: `VIDEO_DELIVERY_COST_AND_METERING_2026-09-11.md` "Решение по режиму кодирования" (owner,
 * 11.09.2026): CRF потолок = плановый `-maxrate`, урезанный до битрейта исходника когда тот измерен и
 * ниже; неизвестный источник — потолок не трогаем.
 */
describe('rungBitrateCeilingBps', () => {
  it('the ceiling equals the rung\'s planned bitrate when the source bitrate is unknown', () => {
    expect(rungBitrateCeilingBps('800k', null)).toBe(800_000);
  });

  it('the ceiling is cut down to the source bitrate when the source is lower', () => {
    // 640x360 rung plans 730k; a simple 300 kbps source should never be inflated up to it.
    expect(rungBitrateCeilingBps('730k', 300_000)).toBe(300_000);
  });

  it('the ceiling is NOT raised above the rung\'s plan when the source is higher', () => {
    expect(rungBitrateCeilingBps('800k', 10_000_000)).toBe(800_000);
  });

  it('потолок берётся от ВИДЕОПОТОКА, а не от контейнера: контейнер несёт ещё звук', () => {
    // Аудит vid-encoding-audit-01 привёл живой источник: контейнер 70 675 бит/с при видеопотоке
    // 31 864. Потолок по контейнеру разрешал ступени вдвое тяжелее самого видео исходника.
    expect(
      rungVideoCeilingFromProbeBps('730k', { videoBitrateBps: 31_864, bitrateBps: 70_675 }),
    ).toBe(31_864);
  });

  it('контейнер остаётся резервом, когда видеопоток свой битрейт не сообщил', () => {
    expect(
      rungVideoCeilingFromProbeBps('730k', { videoBitrateBps: null, bitrateBps: 400_000 }),
    ).toBe(400_000);
    expect(rungVideoCeilingFromProbeBps('730k', { videoBitrateBps: null, bitrateBps: null })).toBe(
      730_000,
    );
  });

  it('звук НИКОГДА не переписывается вверх: план ступени — тоже потолок', () => {
    // В библиотеке владельца медиана звука 105 кбит/с, 139 роликов из 148 тише плановых 128k
    // двух верхних ступеней — переписывание вверх съедало часть экономии по видео.
    expect(rungAudioBitrateBps('128k', 64_860)).toBe(64_860);
    expect(rungAudioBitrateBps('64k', 128_000)).toBe(64_000);
    expect(rungAudioBitrateBps('128k', null)).toBe(128_000);
  });

  it('every rung advertises a BANDWIDTH at or above its own video ceiling PLUS its audio', () => {
    // BANDWIDTH в мастер-плейлисте — пиковая полоса варианта целиком. Объявить меньше, чем ступень
    // способна выдать (потолок видео + звук), значит подсунуть плееру ступень, которую он не
    // вытянет: он выбирает по этому числу. Заниженное число не «экономит», а ломает выбор.
    for (const rung of HLS_RUNG_LADDER) {
      const peak =
        parseFfmpegBitrateTokenBps(rung.videoBitrate) + parseFfmpegBitrateTokenBps(rung.audioBitrate);
      expect(
        rung.bandwidth,
        `ступень ${rung.label}: объявлено ${rung.bandwidth}, пик ${peak}`,
      ).toBeGreaterThanOrEqual(peak);
      // И верхняя граница того же отношения. Завышенная полоса — молчаливый дорогой отказ: плеер
      // откажется от ступени, которую вытянул бы. Аудит vid-encoding-audit-02 показал, что
      // литеральный список ожиданий этого не ловит (таблицу и expected правят одним коммитом),
      // а отношение двух полей одной строки — ловит.
      expect(
        rung.bandwidth,
        `ступень ${rung.label}: объявлено ${rung.bandwidth} при пике ${peak} — завышено`,
      ).toBeLessThanOrEqual(Math.round(peak * 1.15));
    }
  });
});

describe('parseFfmpegBitrateTokenBps', () => {
  it('parses k/M suffixed and bare bps tokens', () => {
    expect(parseFfmpegBitrateTokenBps('400k')).toBe(400_000);
    expect(parseFfmpegBitrateTokenBps('2.5M')).toBe(2_500_000);
    expect(parseFfmpegBitrateTokenBps('128000')).toBe(128_000);
  });

  it('throws on an unparseable token rather than silently returning 0', () => {
    expect(() => parseFfmpegBitrateTokenBps('bogus')).toThrow();
  });
});

const fakes = vi.hoisted(() => ({
  downloadObjectToFile: vi.fn(),
  headObjectExists: vi.fn(),
  putObjectWithRetry: vi.fn(),
  probeVideoDimensions: vi.fn(),
  runFfmpeg: vi.fn(),
  extractPosterWithFallback: vi.fn(),
}));

vi.mock('./s3.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./s3.js')>();
  return {
    ...actual,
    downloadObjectToFile: fakes.downloadObjectToFile,
    headObjectExists: fakes.headObjectExists,
    putObjectWithRetry: fakes.putObjectWithRetry,
  };
});
vi.mock('./ffmpeg/probeVideoDimensions.js', () => ({
  probeVideoDimensions: fakes.probeVideoDimensions,
}));
vi.mock('./ffmpeg/runFfmpeg.js', () => ({ runFfmpeg: fakes.runFfmpeg }));
vi.mock('./ffmpeg/extractPosterWithFallback.js', () => ({
  extractPosterWithFallback: fakes.extractPosterWithFallback,
}));

const { processTranscodeJob } = await import('./processTranscodeJob.js');

const JOB: ClaimedJob = {
  id: '11111111-1111-4111-8111-111111111111',
  mediaId: '22222222-2222-4222-8222-222222222222',
  organizationId: '33333333-3333-4333-8333-333333333333',
  attempts: 1,
};

function loadedMedia(overrides: Partial<ControlledMedia> = {}): ControlledMedia {
  return {
    id: JOB.mediaId,
    mimeType: 'video/mp4',
    s3Key: `media/${JOB.mediaId}/source.mp4`,
    hlsMasterPlaylistS3Key: null,
    videoProcessingStatus: null,
    videoDurationSeconds: null,
    usagePurpose: null,
    storageTarget: 'library',
    ...overrides,
  };
}

/**
 * ORACLE: `VIDEO_DELIVERY_COST_AND_METERING_2026-09-11.md`, «⚠️ Капкан, проверь его первым» (owner,
 * 11.09.2026). Изолированный, без ffmpeg/S3: реальные файлы на диске, мок только у
 * `probeVideoDimensions`.
 */
describe('probeFmp4VariantFrame', () => {
  let dir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    dir = await mkdtemp(join(tmpdir(), 'mw-fmp4-probe-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('склеивает init-сегмент и первый фрагмент в один файл и пробует именно его', async () => {
    await writeFile(join(dir, 'init.mp4'), Buffer.from('INIT-BYTES'));
    await writeFile(join(dir, 'seg_000.m4s'), Buffer.from('FRAGMENT-BYTES'));
    fakes.probeVideoDimensions.mockImplementation(async (_bin: string, path: string) => ({
      width: 640,
      height: 360,
      bitrateBps: null,
      videoBitrateBps: null,
      audioBitrateBps: null,
      __probedContent: (await readFile(path)).toString('utf8'),
    }));

    const result = (await probeFmp4VariantFrame(
      '/usr/bin/ffmpeg',
      dir,
      'init.mp4',
      'seg_000.m4s',
    )) as unknown as { width: number; height: number; __probedContent: string };

    expect(result.__probedContent).toBe('INIT-BYTESFRAGMENT-BYTES');
    expect(result.width).toBe(640);
    expect(result.height).toBe(360);
  });

  it('возвращает null, а не бросает, когда init-сегмент отсутствует на диске', async () => {
    await writeFile(join(dir, 'seg_000.m4s'), Buffer.from('FRAGMENT-BYTES'));

    const result = await probeFmp4VariantFrame('/usr/bin/ffmpeg', dir, 'init.mp4', 'seg_000.m4s');

    expect(result).toBeNull();
    expect(fakes.probeVideoDimensions).not.toHaveBeenCalled();
  });
});

/**
 * fMP4 fake variant playlist (Требование 2, `VIDEO_DELIVERY_COST_AND_METERING`): `#EXT-X-MAP` init
 * segment + `.m4s` fragments, not `.ts`. Fixed, known EXTINF total (12.0s) so duration is asserted
 * exactly.
 */
const FAKE_VARIANT_PLAYLIST = [
  '#EXTM3U',
  '#EXT-X-VERSION:7',
  '#EXT-X-MAP:URI="init.mp4"',
  '#EXTINF:6.000000,',
  'seg_000.m4s',
  '#EXTINF:6.000000,',
  'seg_001.m4s',
  '#EXT-X-ENDLIST',
  '',
].join('\n');

describe('processTranscodeJob — table-driven rung ladder end to end', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakes.downloadObjectToFile.mockResolvedValue(undefined);
    fakes.headObjectExists.mockResolvedValue(true);
    fakes.putObjectWithRetry.mockResolvedValue(undefined);
    fakes.extractPosterWithFallback.mockImplementation(async (params: { outputJpg: string }) => {
      await writeFile(params.outputJpg, Buffer.from('jpeg'));
    });
    // Real fMP4 layout in each variant dir: init segment + fragments alongside the playlist, so the
    // капкан-fix (`probeFmp4VariantFrame`) has real files to read, same as ffmpeg would produce.
    fakes.runFfmpeg.mockImplementation(async (_bin: string, _args: string[], opts: { cwd: string }) => {
      await writeFile(join(opts.cwd, 'index.m3u8'), FAKE_VARIANT_PLAYLIST, 'utf8');
      await writeFile(join(opts.cwd, 'init.mp4'), Buffer.from('fake-init'));
      await writeFile(join(opts.cwd, 'seg_000.m4s'), Buffer.from('fake-fragment-0'));
      await writeFile(join(opts.cwd, 'seg_001.m4s'), Buffer.from('fake-fragment-1'));
      return { code: 0, stderrTail: '' };
    });
  });

  function contextFor() {
    const bindings: Record<string, StorageBinding> = {
      library: { client: { send: vi.fn() } as unknown as StorageBinding['client'], bucket: 'library-bucket' },
      patient: { client: { send: vi.fn() } as unknown as StorageBinding['client'], bucket: 'patient-bucket' },
    };
    const doneHls = vi.fn<MediaWorkerControlPort['doneHls']>(async () => undefined);
    const control = {
      load: vi.fn(async () => loadedMedia()),
      watermarkEnabled: vi.fn(async () => false),
      processing: vi.fn(async () => undefined),
      doneHls,
      retry: vi.fn(async () => undefined),
      failed: vi.fn(async () => undefined),
    } as unknown as MediaWorkerControlPort;
    const ctx = {
      control,
      storageFor: (target: 'library' | 'patient') => bindings[target]!,
      ffmpegBin: '/usr/bin/ffmpeg',
      ffmpegTimeoutMs: 60_000,
      maxAttempts: 3,
      log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      lockId: 'worker-a',
    };
    return { ctx, control, doneHls };
  }

  it('a 480p source produces only 360p/480p — no upscaled 720p, no 576p', async () => {
    fakes.probeVideoDimensions.mockResolvedValue({ width: 854, height: 480 });
    const { ctx, doneHls } = contextFor();

    await processTranscodeJob(ctx as never, JOB);

    const rungDirsUsed = fakes.runFfmpeg.mock.calls.map((call) => call[2].cwd as string);
    expect(rungDirsUsed.some((d) => d.endsWith('/720p'))).toBe(false);
    expect(rungDirsUsed.some((d) => d.endsWith('/576p'))).toBe(false);
    expect(rungDirsUsed.filter((d) => d.endsWith('/360p'))).toHaveLength(1);
    expect(rungDirsUsed.filter((d) => d.endsWith('/480p'))).toHaveLength(1);

    expect(doneHls).toHaveBeenCalledTimes(1);
    const values = doneHls.mock.calls[0]![2] as { qualitiesJson: string; durationSeconds: number };
    const qualities = JSON.parse(values.qualitiesJson) as Array<{ label: string; height: number }>;
    // Quality list matches exactly the rungs actually produced.
    expect(qualities.map((q) => q.label)).toEqual(['360p', '480p']);
    expect(qualities.every((q) => q.height <= 480)).toBe(true);
    // Duration recorded from the produced playlist (2 * 6.0s), not a source probe.
    expect(values.durationSeconds).toBe(12);
  });

  it('a 1080p source produces the full four-rung ladder', async () => {
    fakes.probeVideoDimensions.mockResolvedValue({ width: 1920, height: 1080 });
    const { ctx, doneHls } = contextFor();

    await processTranscodeJob(ctx as never, JOB);

    const rungDirsUsed = fakes.runFfmpeg.mock.calls.map((call) => call[2].cwd as string);
    for (const label of ['360p', '480p', '576p', '720p']) {
      expect(rungDirsUsed.some((d) => d.endsWith(`/${label}`))).toBe(true);
    }
    const values = doneHls.mock.calls[0]![2] as { qualitiesJson: string };
    const qualities = JSON.parse(values.qualitiesJson) as Array<{ label: string }>;
    expect(qualities.map((q) => q.label)).toEqual(['360p', '480p', '576p', '720p']);
  });

  it('a sub-360p source still yields a working single-rung playlist, not a failure', async () => {
    fakes.probeVideoDimensions.mockResolvedValue({ width: 426, height: 240 });
    const { ctx, doneHls, control } = contextFor();

    await processTranscodeJob(ctx as never, JOB);

    expect(control.failed).not.toHaveBeenCalled();
    expect(doneHls).toHaveBeenCalledTimes(1);
    const values = doneHls.mock.calls[0]![2] as { qualitiesJson: string };
    const qualities = JSON.parse(values.qualitiesJson) as Array<{ label: string; height: number }>;
    expect(qualities).toHaveLength(1);
    expect(qualities[0]!.height).toBe(240);
  });

  it('a low-bitrate source caps every rung\'s -maxrate at the source bitrate, and reports it via doneHls', async () => {
    // 1080p source, but a measured 280 kbps VIDEO stream inside a 300 kbps container — well under
    // even the 360p ceiling (730k): no produced rung may be encoded above the source's own VIDEO
    // bitrate, and the container number (which also carries audio) must not raise that ceiling.
    fakes.probeVideoDimensions.mockResolvedValue({
      width: 1920,
      height: 1080,
      bitrateBps: 300_000,
      videoBitrateBps: 280_000,
      audioBitrateBps: 20_000,
    });
    const { ctx, doneHls } = contextFor();

    await processTranscodeJob(ctx as never, JOB);

    for (const call of fakes.runFfmpeg.mock.calls) {
      const args = call[1] as string[];
      const maxrateIdx = args.indexOf('-maxrate');
      expect(maxrateIdx).toBeGreaterThanOrEqual(0);
      expect(Number(args[maxrateIdx + 1])).toBe(280_000);
      expect(args).not.toContain('-b:v');
      // Звук тоже не выше источника: иначе на слабом ролике дорожка съедала бы больше самого видео.
      expect(Number(args[args.indexOf('-b:a') + 1])).toBe(20_000);
    }

    // В БД уезжает битрейт ФАЙЛА (контейнер) — то, что владелец видит как «битрейт исходника».
    const values = doneHls.mock.calls[0]![2] as { sourceBitrateBps: number | null };
    expect(values.sourceBitrateBps).toBe(300_000);
  });

  it('тихий звук не переписывается вверх ни на одной ступени, даже когда видео потолок не урезан', async () => {
    fakes.probeVideoDimensions.mockResolvedValue({
      width: 1920,
      height: 1080,
      bitrateBps: 10_739_200,
      videoBitrateBps: 10_600_000,
      audioBitrateBps: 64_860,
    });
    const { ctx } = contextFor();

    await processTranscodeJob(ctx as never, JOB);

    const audioRates = fakes.runFfmpeg.mock.calls.map((call) => {
      const args = call[1] as string[];
      return Number(args[args.indexOf('-b:a') + 1]);
    });
    // Планы ступеней 64/96/128/128k, звук источника 64 860 — вверх не идём нигде.
    expect(audioRates).toEqual([64_000, 64_860, 64_860, 64_860]);
  });

  it('an unmeasured source bitrate leaves each rung at its planned ceiling, not capped', async () => {
    fakes.probeVideoDimensions.mockResolvedValue({ width: 1920, height: 1080, bitrateBps: null });
    const { ctx, doneHls } = contextFor();

    await processTranscodeJob(ctx as never, JOB);

    const maxrates = fakes.runFfmpeg.mock.calls.map((call) => {
      const args = call[1] as string[];
      return Number(args[args.indexOf('-maxrate') + 1]);
    });
    expect(maxrates).toEqual([730_000, 800_000, 1_400_000, 2_500_000]);

    const values = doneHls.mock.calls[0]![2] as { sourceBitrateBps: number | null };
    expect(values.sourceBitrateBps).toBeNull();
  });

  /**
   * ORACLE: `VIDEO_DELIVERY_COST_AND_METERING_2026-09-11.md` требование 2 (owner, 11.09.2026):
   * «надо переходить» на fMP4 вместо MPEG-TS.
   */
  it('каждая ступень кодируется fMP4-сегментами, ни одна — MPEG-TS', async () => {
    fakes.probeVideoDimensions.mockResolvedValue({
      width: 1920,
      height: 1080,
      bitrateBps: null,
      videoBitrateBps: null,
      audioBitrateBps: null,
    });
    const { ctx } = contextFor();

    await processTranscodeJob(ctx as never, JOB);

    expect(fakes.runFfmpeg.mock.calls).toHaveLength(4);
    for (const call of fakes.runFfmpeg.mock.calls) {
      const args = call[1] as string[];
      expect(args).toEqual(
        expect.arrayContaining(['-hls_segment_type', 'fmp4', '-hls_fmp4_init_filename', 'init.mp4']),
      );
      const segArg = args[args.indexOf('-hls_segment_filename') + 1] as string;
      expect(segArg.endsWith('.m4s')).toBe(true);
      expect(segArg.endsWith('.ts')).toBe(false);
    }
  });

  /**
   * ORACLE: `VIDEO_DELIVERY_COST_AND_METERING_2026-09-11.md`, «⚠️ Капкан, проверь его первым»
   * (owner, 11.09.2026): фрагмент `.m4s` без init-сегмента не декодируется — проба должна читать
   * init+первый фрагмент ВМЕСТЕ, а не голый фрагмент, иначе в манифест уедут номинальные размеры.
   */
  it('измеряет кадр по init-сегменту + первому фрагменту вместе, а не по голому .m4s', async () => {
    const probedContents: string[] = [];
    fakes.probeVideoDimensions.mockImplementation(async (_bin: string, path: string) => {
      if (path.endsWith('source.bin')) {
        return { width: 1920, height: 1080, bitrateBps: null, videoBitrateBps: null, audioBitrateBps: null };
      }
      // Это и есть капкан: если бы код пробовал голый `seg_000.m4s`, здесь читалось бы содержимое
      // одного фрагмента, а не склейки init+фрагмент.
      probedContents.push((await readFile(path)).toString('utf8'));
      return { width: 640, height: 360, bitrateBps: null, videoBitrateBps: null, audioBitrateBps: null };
    });
    const { ctx } = contextFor();

    await processTranscodeJob(ctx as never, JOB);

    expect(probedContents.length).toBeGreaterThan(0);
    for (const content of probedContents) {
      expect(content).toBe('fake-initfake-fragment-0');
    }
    // Измеренный (640x360), не номинальный ладдер-размер, уехал в мастер-плейлист.
    const masterCall = fakes.putObjectWithRetry.mock.calls.find((call) =>
      (call[2] as string).endsWith('master.m3u8'),
    );
    expect(masterCall).toBeDefined();
    const masterBody = (masterCall![3] as Buffer).toString('utf8');
    expect(masterBody).toContain('RESOLUTION=640x360');
  });

  /**
   * ORACLE: `VIDEO_DELIVERY_COST_AND_METERING_2026-09-11.md` требование 3 (owner, 11.09.2026):
   * «холодный бакет для исходников + отключить удаление исходника» — здесь только отключение.
   */
  it('исходный объект НЕ удаляется после успешного транскода', async () => {
    fakes.probeVideoDimensions.mockResolvedValue({
      width: 1920,
      height: 1080,
      bitrateBps: null,
      videoBitrateBps: null,
      audioBitrateBps: null,
    });
    const { ctx, doneHls } = contextFor();

    await processTranscodeJob(ctx as never, JOB);

    expect(doneHls).toHaveBeenCalledTimes(1);
    // `client.send` в этом наряде раньше дёргал ровно один прямой S3-вызов — `DeleteObjectCommand`
    // по исходнику; download/upload/head идут через отдельные мокнутые хелперы. Значит нуль вызовов
    // `send` доказывает отсутствие удаления, а не просто «не нашли конкретную команду».
    const librarySend = ctx.storageFor('library').client.send as ReturnType<typeof vi.fn>;
    expect(librarySend).not.toHaveBeenCalled();
  });
});

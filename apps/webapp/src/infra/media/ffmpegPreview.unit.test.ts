import { describe, expect, it } from 'vitest';
import {
  buildPosterArgs,
  buildProbeDimensionsArgs,
  ffmpegFailureMessage,
  ffprobeCandidates,
  parseProbeDimensions,
  runFirstAvailable,
  runProcess,
} from './ffmpegPreview';

/**
 * Движок остался системным FFmpeg — сменился только способ его запускать. Здесь проверяется то,
 * на что опирается `mediaPreviewWorker`: аргументы уходят массивом (а не строкой для shell),
 * зависший процесс убивается, stderr не растёт бесконечно, и по тексту ошибки по-прежнему
 * различимы «файл битый навсегда» и «попробуем ещё раз».
 */

const NODE = process.execPath;

describe('ffmpeg argv', () => {
  it('передаёт вход отдельным аргументом, поэтому shell-метасимволы в URL остаются данными', async () => {
    const hostileUrl = 'https://example.invalid/a.mp4?x=1&y=$(touch /tmp/pwned);echo';
    const args = buildPosterArgs(hostileUrl, '/tmp/out.jpg', 1);

    expect(args).toContain(hostileUrl);
    const run = await runProcess(
      NODE,
      ['-e', 'process.stdout.write(JSON.stringify(process.argv.slice(1)))', '--', ...args],
      { timeoutMs: 10_000, maxStderrBytes: 1024, maxStdoutBytes: 65_536 },
    );

    expect(JSON.parse(run.stdout)).toEqual(args);
  });

  it('ищет кадр через seek до входа и падает на первый кадр во втором заходе', () => {
    const first = buildPosterArgs('in.mp4', 'out.jpg', 1);
    const second = buildPosterArgs('in.mp4', 'out.jpg', 0);

    expect(first.indexOf('-ss')).toBeLessThan(first.indexOf('-i'));
    expect(first[first.indexOf('-ss') + 1]).toBe('1');
    expect(second[second.indexOf('-ss') + 1]).toBe('0');
    expect(first.at(-1)).toBe('out.jpg');
  });

  it('спрашивает у ffprobe только размеры потоков', () => {
    const args = buildProbeDimensionsArgs('https://example.invalid/a.mov');

    expect(args).toContain('stream=width,height');
    expect(args.at(-1)).toBe('https://example.invalid/a.mov');
  });
});

describe('размеры источника', () => {
  it('берёт поток с наибольшей площадью, а не первый попавшийся', () => {
    const stdout = JSON.stringify({
      streams: [{ width: 320, height: 240 }, {}, { width: 1920, height: 1080 }],
    });

    expect(parseProbeDimensions(stdout)).toEqual({ width: 1920, height: 1080 });
  });

  it('без пригодных потоков возвращает «размеров нет», а не ошибку', () => {
    expect(parseProbeDimensions(JSON.stringify({ streams: [{ width: 0, height: 0 }] }))).toBeNull();
    expect(parseProbeDimensions('not json')).toBeNull();
  });
});

describe('различение постоянной и временной ошибки', () => {
  it('сохраняет формулировку про сигнал — по ней воркер помечает файл skipped', () => {
    const message = ffmpegFailureMessage({
      code: 1,
      signal: 'SIGSEGV',
      stdout: '',
      stderrTail: '',
      timedOut: false,
    });

    expect(message).toContain('was killed with signal SIGSEGV');
  });

  it('доносит stderr до сообщения, иначе «Invalid data» перестанет распознаваться', () => {
    const message = ffmpegFailureMessage({
      code: 1,
      signal: null,
      stdout: '',
      stderrTail: 'a.mp4: Invalid data found when processing input',
      timedOut: false,
    });

    expect(message).toContain('Invalid data found when processing input');
  });

  it('таймаут остаётся SIGKILL — это повтор, а не постоянная ошибка', () => {
    const message = ffmpegFailureMessage({
      code: 1,
      signal: 'SIGKILL',
      stdout: '',
      stderrTail: '',
      timedOut: true,
    });

    expect(message).not.toContain('SIGSEGV');
    expect(message).toContain('SIGKILL');
  });
});

describe('запуск процесса', () => {
  it('убивает зависший процесс по таймауту вместо бесконечного ожидания', async () => {
    const run = await runProcess(NODE, ['-e', 'setInterval(() => {}, 1000)'], {
      timeoutMs: 300,
      maxStderrBytes: 1024,
      maxStdoutBytes: 0,
    });

    expect(run.timedOut).toBe(true);
    expect(run.signal).toBe('SIGKILL');
  });

  it('держит stderr ограниченным, каким бы болтливым ни был ffmpeg', async () => {
    const run = await runProcess(
      NODE,
      ['-e', "process.stderr.write('x'.repeat(200000)); process.exit(3)"],
      { timeoutMs: 10_000, maxStderrBytes: 512, maxStdoutBytes: 0 },
    );

    expect(run.code).toBe(3);
    expect(run.stderrTail.length).toBe(512);
  });
});

describe('поиск ffprobe', () => {
  it('явно заданный путь отменяет поиск', () => {
    expect(ffprobeCandidates('/usr/bin/ffmpeg', '/opt/ffprobe')).toEqual(['/opt/ffprobe']);
  });

  it('иначе пробует PATH, затем соседа указанного ffmpeg', () => {
    expect(ffprobeCandidates('/usr/bin/ffmpeg')).toEqual(['ffprobe', '/usr/bin/ffprobe']);
  });

  it('отсутствующий кандидат не считается отказом — берётся следующий', async () => {
    const run = await runFirstAvailable(
      ['/nonexistent/ffprobe-does-not-exist', NODE],
      ['-e', 'process.stdout.write("ok")'],
      { timeoutMs: 10_000, maxStderrBytes: 1024, maxStdoutBytes: 1024 },
    );

    expect(run.stdout).toBe('ok');
  });

  it('когда не нашёлся ни один кандидат — ошибка, а не молчаливый успех', async () => {
    await expect(
      runFirstAvailable(['/nonexistent/ffprobe-a', '/nonexistent/ffprobe-b'], [], {
        timeoutMs: 1_000,
        maxStderrBytes: 16,
        maxStdoutBytes: 16,
      }),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

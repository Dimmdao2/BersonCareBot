import { describe, expect, it } from 'vitest';
import { mkdtemp, writeFile, stat, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runMagickConvert } from './magickConvert.js';

/**
 * Перебор запасных декодеров. Проверяется поведение, а не устройство: если первый бинарь
 * отсутствует, работу обязан сделать следующий, а вызывающий — получить успех.
 *
 * Ровно это было сломано на новом проде 14.09.2026: отсутствующий `magick` поднимал и `error`, и
 * `close` с кодом `-2` (отрицательный errno), второй обработчик видел исчерпанный список кандидатов
 * и рушил вызов, хотя `convert` в этот момент уже работал. Наружу это выглядело как «нет декодера»
 * при полностью рабочем инструменте.
 */
async function fixtureDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'magick-fallback-'));
}

describe('runMagickConvert — перебор кандидатов', () => {
  it('доводит работу вторым кандидатом, когда первого бинаря нет', async () => {
    const dir = await fixtureDir();
    const inputPath = join(dir, 'in.txt');
    const outputPath = join(dir, 'out.txt');
    await writeFile(inputPath, 'полезная нагрузка', 'utf8');

    /* Заглушка играет роль работающего конвертера: аргументы у настоящего свои (`файл[0]`,
       `-auto-orient`, …), поэтому подменять его обычной командой нельзя — она на таких аргументах
       честно упадёт. Заглушка их игнорирует и создаёт выходной файл, то есть проверяется ровно
       переход к следующему кандидату. Первый кандидат заведомо не существует. */
    const stub = join(dir, 'stub-converter');
    await writeFile(stub, '#!/bin/sh\nprintf converted > "$5"\n', 'utf8');
    await chmod(stub, 0o755);

    await runMagickConvert({
      candidates: ['nesushchestvuyushchiy-binar-12345', stub],
      inputPath,
      outputPath,
      timeoutMs: 15_000,
    });

    const written = await stat(outputPath);
    expect(written.isFile()).toBe(true);
  });

  it('отказывает, когда ни одного кандидата нет', async () => {
    const dir = await fixtureDir();
    await writeFile(join(dir, 'in.txt'), 'x', 'utf8');

    await expect(
      runMagickConvert({
        candidates: ['net-takogo-binarya-a', 'net-takogo-binarya-b'],
        inputPath: join(dir, 'in.txt'),
        outputPath: join(dir, 'out.txt'),
        timeoutMs: 15_000,
      }),
    ).rejects.toThrow();
  });
});

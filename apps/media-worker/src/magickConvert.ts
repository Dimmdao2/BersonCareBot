import { spawn } from 'node:child_process';

/**
 * Запасной разбор HEIC/HEIF через ImageMagick — ровно тот же, что раньше жил в вебаппе.
 *
 * Первым идёт ffmpeg; сюда доезжают только те файлы, которые он не понял. Сам бинарь может
 * отсутствовать (в образе `deploy/docker/Dockerfile` его нет — там ставится только ffmpeg), и это
 * НЕ ошибка конвейера: строка получит `magick_not_found_or_failed`, вебапп посчитает это временным
 * отказом, и после исчерпания попыток строка станет `failed`. Так было и до переезда.
 *
 * `shell: false` и argv массивом — имя файла в командную строку не интерполируется никогда.
 */
export function resolveMagickCommand(customPath?: string): string[] {
  const custom = customPath?.trim();
  if (custom) return [custom];
  return ['magick', 'convert'];
}

export function runMagickConvert(params: {
  candidates: readonly string[];
  inputPath: string;
  outputPath: string;
  timeoutMs: number;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    let idx = 0;

    const runNext = () => {
      if (idx >= params.candidates.length) {
        reject(new Error('magick_not_found_or_failed'));
        return;
      }
      const command = params.candidates[idx++]!;
      /* `[0]` — только первый кадр: многостраничный HEIC иначе выдаёт пачку файлов. */
      const args = [`${params.inputPath}[0]`, '-auto-orient', '-quality', '85', params.outputPath];
      const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], shell: false });
      /*
       * Кандидат, который уже уступил место следующему. Без этого признака перебор был сломан:
       * отсутствующий бинарь поднимает И `error` (ENOENT), И `close` с кодом `-2` — это отрицательный
       * errno, а не код возврата программы. `error` честно запускал следующего кандидата, а следом
       * приходил `close` от ПЕРВОГО, видел, что кандидаты кончились (счётчик уже сдвинут), и рушил
       * весь вызов — при том, что второй кандидат в этот момент нормально работал.
       *
       * Замер на новом проде 14.09.2026: `magick_failed_code_-2` на HEIC, хотя `convert` в образе
       * стоит и HEIC читает. То есть запасной разбор был мёртв не из-за отсутствия инструмента, а
       * из-за этой гонки.
       */
      let handedOver = false;
      let stderr = '';
      child.stderr.on('data', (chunk) => {
        stderr = (stderr + String(chunk)).slice(-16384);
      });
      const killTimer = setTimeout(() => child.kill('SIGKILL'), params.timeoutMs);
      child.on('error', (err) => {
        clearTimeout(killTimer);
        if ((err as { code?: string }).code === 'ENOENT' && idx < params.candidates.length) {
          handedOver = true;
          runNext();
          return;
        }
        reject(err);
      });
      child.on('close', (code) => {
        if (handedOver) return;
        clearTimeout(killTimer);
        if (code === 0) {
          resolve();
          return;
        }
        if (idx < params.candidates.length) {
          runNext();
          return;
        }
        reject(new Error(`magick_failed_code_${code}: ${stderr}`));
      });
    };

    runNext();
  });
}

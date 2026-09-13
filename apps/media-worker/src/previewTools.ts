import { spawn } from 'node:child_process';
import type { MediaPreviewTool } from './control.js';

/**
 * Чем этот процесс РЕАЛЬНО умеет разбирать байты — проверяется запуском, а не верой в Dockerfile.
 *
 * Замер 14.09.2026, из-за которого это появилось: образ прода нёс ffmpeg и не нёс ImageMagick,
 * поэтому вся ветка HEIC была мертва — ffmpeg 5.1 не читает HEIF-контейнер, а запасной `convert`
 * падал `spawn convert ENOENT`. Снаружи это выглядело как «файл не конвертируется», хотя файл был
 * в порядке. Теперь окружение называет себя само и на старте: вебапп по этому отчёту выпускает из
 * `blocked` строки, которые ждали именно этого инструмента.
 *
 * `-version` и `shell: false`: ничего не разбираем, только спрашиваем, существует ли бинарь.
 */
function canRun(command: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(command, ['-version'], { stdio: 'ignore', shell: false });
    const done = (ok: boolean) => {
      clearTimeout(timer);
      resolve(ok);
    };
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      done(false);
    }, 5_000);
    child.on('error', () => done(false));
    child.on('close', (code) => done(code === 0));
  });
}

export async function detectPreviewTools(
  magickCandidates: readonly string[],
): Promise<MediaPreviewTool[]> {
  for (const candidate of magickCandidates) {
    if (await canRun(candidate)) return ['heic_decoder'];
  }
  return [];
}

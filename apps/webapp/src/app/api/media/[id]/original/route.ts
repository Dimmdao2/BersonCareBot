/**
 * GET /api/media/[id]/original — скачивание загруженного файла (М6,
 * `docs/_TODO/STORAGE_PACKAGES_2026-09-10.md`).
 *
 * Владелец 10.09.2026, дословно: «исходник отдаём, и, естественно, только тому специалисту,
 * который это загрузил, и только как вложение… только как загружаемый файл, неисполняемый в
 * браузере, несмотря на то, что это видео». Отсюда три свойства маршрута:
 *
 * 1. Право решает одна дверь — `authorizeMediaDelivery` с `intent: 'raw_original'`: организация
 *    файла плюс совпадение с `media_files.uploaded_by`. Второго пути авторизации нет.
 * 2. Байты идут ЧЕРЕЗ вебапп, а не редиректом на пресайн-ссылку. Только так на ответе стоят все
 *    три заголовка сразу: `Content-Disposition: attachment`, `Content-Type:
 *    application/octet-stream` и `X-Content-Type-Options: nosniff`. У редиректа в хранилище
 *    `nosniff` поставить негде — S3 умеет переопределить тип и disposition, но не этот заголовок.
 * 3. Пресайн-ссылка не выпускается вовсе, ответ `no-store`: значит, нет ссылки, которую можно
 *    переслать, сохранить или переиспользовать для встроенного проигрывания — каждое скачивание
 *    заново предъявляет сессию.
 */

import { NextResponse } from 'next/server';
import { logger } from '@/app-layer/logging/logger';
import { authorizeMediaDelivery } from '@/app-layer/media/authorizeMediaDelivery';
import { getMediaOriginalObjectForDownload } from '@/app-layer/media/s3MediaStorage';
import { s3GetObjectStream } from '@/app-layer/media/s3Client';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { contentDispositionHeaderValue } from '@/shared/lib/contentDisposition';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  return withDoctorWorkspacePrincipal(gate.ctx, async () => {
    const access = await authorizeMediaDelivery(id, gate.ctx.session, { intent: 'raw_original' });
    if (!access.ok) {
      return access.reason === 'not_found'
        ? NextResponse.json({ error: 'not found' }, { status: 404 })
        : NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }

    const object = await getMediaOriginalObjectForDownload(id);
    if (!object) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }

    const read = await s3GetObjectStream({ key: object.key, target: object.target, kind: object.kind });
    if (!read.ok) {
      logger.warn(
        { mediaId: id, reason: read.reason },
        '[media original GET] storage read failed',
      );
      return read.reason === 'missing_object'
        ? NextResponse.json({ error: 'not found' }, { status: 404 })
        : NextResponse.json({ error: 'storage_error' }, { status: 502 });
    }

    return new Response(read.stream, {
      status: 200,
      headers: {
        /* Тип объявляем сами и всегда один: браузер не должен увидеть здесь видео или HTML. */
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': contentDispositionHeaderValue('attachment', object.originalName),
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-store',
        /* Диапазоны намеренно не поддерживаем: скачивание целиком, не источник для плеера. */
        'Accept-Ranges': 'none',
        ...(read.contentLength != null ? { 'Content-Length': String(read.contentLength) } : {}),
      },
    });
  });
}

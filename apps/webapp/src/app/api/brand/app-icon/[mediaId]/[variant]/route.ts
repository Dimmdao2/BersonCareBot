import { deliveryGetPrivateObjectBuffer } from '@/app-layer/media/s3DeliveryClient';
import {
  isOrgAppIconMediaId,
  orgAppIconObjectKey,
  parseOrgAppIconVariantSegment,
} from '@/shared/lib/brand/orgAppIcon';

/**
 * Публичная выдача готового размера иконки клиники (владелец 10.09.2026, вариант A).
 *
 * Дверь СПЕЦИАЛЬНО не спрашивает ни сессию, ни базу:
 *  - без сессии — потому что фавикон и иконки манифеста браузер просит вне пациентского входа, а
 *    `/api/media/<id>` сессионный и его URL у анонимного гостя вырезается
 *    (`stripApiMediaForAnonymousGuest`), то есть на нём фавикона не построить в принципе;
 *  - без базы — потому что адрес полностью задаёт ключ объекта, а сам объект существует только
 *    если сотрудник клиники поставил эту иконку своей организации: деривативы пишет ровно один
 *    путь сохранения бренда и только в `org-app-icons/<media id>/`. Лишнего запроса в БД на каждую
 *    холодную загрузку страницы это стоить не должно.
 *
 * Media id в пути — это и версия: смена иконки меняет id, значит меняет адрес, поэтому ответ
 * кэшируется навсегда и пациент не получит вчерашний фавикон.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ mediaId: string; variant: string }> },
) {
  const { mediaId, variant } = await params;
  const normalizedMediaId = (mediaId ?? '').trim().toLowerCase();
  const parsedVariant = parseOrgAppIconVariantSegment((variant ?? '').trim().toLowerCase());
  if (!isOrgAppIconMediaId(normalizedMediaId) || !parsedVariant) {
    return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }

  const object = await deliveryGetPrivateObjectBuffer(
    orgAppIconObjectKey(normalizedMediaId, parsedVariant),
    'library',
  );
  if (!object.ok) {
    // Отсутствующий размер — это не ошибка клиента: поверхность просто откатится на платформенный
    // набор иконок, как и при непригодном логотипе (§10 контракта бренда).
    return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }
  return new Response(new Uint8Array(object.buf), {
    headers: {
      'Content-Type': 'image/png',
      'Content-Length': String(object.buf.byteLength),
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}

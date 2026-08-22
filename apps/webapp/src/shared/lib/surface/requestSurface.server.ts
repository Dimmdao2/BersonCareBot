import { headers } from 'next/headers';
import {
  SURFACE_PATHNAME_HEADER,
  SURFACE_SEARCH_HEADER,
  resolveRequestSurface,
  type ProductSurface,
} from '@/config/surfaceRoutes';

/**
 * Поверхность текущего запроса для RSC. Путь приходит заголовком из `src/proxy.ts` — Next не даёт
 * layout'у pathname. Единственные вызывающие: корневой layout (метаданные + видимое имя) и
 * `AppEntryRsc` (заголовок shell'а общего экрана входа).
 */
export async function getRequestSurface(): Promise<ProductSurface> {
  const h = await headers();
  return resolveRequestSurface(h.get(SURFACE_PATHNAME_HEADER), h.get(SURFACE_SEARCH_HEADER));
}

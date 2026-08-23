import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { readResolvedSurface, type ResolvedSurface } from './requestSurface';

/**
 * Reads the already-resolved request boundary value. Host is intentionally unavailable here:
 * proxy is the only resolver and overwrites the internal header on every dynamic request.
 */
export async function getResolvedSurface(): Promise<ResolvedSurface> {
  const h = await headers();
  const surface = readResolvedSurface(h);
  if (!surface) notFound();
  return surface;
}

/** Optional request-context read for shared server policies that also run in non-request jobs/tests. */
export async function getOptionalResolvedSurface(): Promise<ResolvedSurface | null> {
  let requestHeaders: Headers;
  try {
    requestHeaders = await headers();
  } catch {
    return null;
  }

  const surface = readResolvedSurface(requestHeaders);
  if (!surface) throw new Error('resolved_surface_header_missing_or_invalid');
  return surface;
}

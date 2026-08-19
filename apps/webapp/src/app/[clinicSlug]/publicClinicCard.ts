import { stampBootstrapPrincipal } from '@/app-layer/principal/bootstrapPrincipal';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import type { ClinicPublicCard, ClinicPublicCardMedia } from '@/modules/clinic-public-card/ports';

export type LoadClinicPublicCardResult =
  /** The clinic exists, is published and its page is on. */
  | { status: 'ok'; card: ClinicPublicCard }
  /** Nothing lives at this address — unknown, unpublished, inactive or switched off, uniformly. */
  | { status: 'absent' }
  /** The projection could not be READ. This is never an empty card; the page owes a 503. */
  | { status: 'unavailable' };

/**
 * ONE place where a card read that could not run becomes visible.
 *
 * The distinction this function exists for (plan §3.3): «no such clinic» and «the read never ran»
 * look identical on screen unless they are separated here. The first is a 404 by design — telling
 * them apart publicly would let an anonymous visitor enumerate clinics. The second is a 503 with a
 * logged category and SQLSTATE, because a blank card in place of a refusal is a false record of
 * readiness: nobody ever looks again.
 */
function reportCardFailure(source: string, slug: string, error: unknown): void {
  const chain: unknown[] = [];
  for (
    let link: unknown = error;
    link && chain.length < 4;
    link = (link as { cause?: unknown }).cause
  ) {
    chain.push(link);
  }
  const code =
    chain
      .map((link) => (link as { code?: unknown } | null)?.code)
      .find((value): value is string => typeof value === 'string') ?? 'unknown';
  console.error('[clinic-card] public card read failed', {
    category: code === '42501' ? 'capability_denied' : 'repository_unavailable',
    errorClass: error instanceof Error ? error.name : 'unknown',
    code,
    message: error instanceof Error ? error.message : String(error),
    source,
    slug,
  });
}

/** RSC: the whole anonymous surface of `/{clinic}`, resolved through the declared root. */
export async function loadClinicPublicCardRsc(slug: string): Promise<LoadClinicPublicCardResult> {
  stampBootstrapPrincipal('app/[clinicSlug]:read-public-card');
  const deps = buildAppDeps();
  if (!deps.clinicPublicCard) return { status: 'unavailable' };
  try {
    const card = await deps.clinicPublicCard.readPublicCard(slug);
    return card ? { status: 'ok', card } : { status: 'absent' };
  } catch (error) {
    reportCardFailure('app/[clinicSlug]:read-public-card', slug, error);
    return { status: 'unavailable' };
  }
}

/**
 * RSC/route: one media asset of one published card.
 *
 * The set the card returned IS the authorization. There is no separate media lookup to widen and
 * the shared `/api/media/{uuid}` chokepoint is not touched: a uuid that is not in this clinic's
 * card cannot be resolved here at all.
 */
export async function resolveClinicPublicCardMediaRsc(
  slug: string,
  mediaId: string,
): Promise<
  { status: 'ok'; media: ClinicPublicCardMedia } | { status: 'absent' } | { status: 'unavailable' }
> {
  stampBootstrapPrincipal('app/[clinicSlug]:read-public-card-media');
  const deps = buildAppDeps();
  if (!deps.clinicPublicCard) return { status: 'unavailable' };
  try {
    const media = await deps.clinicPublicCard.resolvePublicCardMedia(slug, mediaId);
    return media ? { status: 'ok', media } : { status: 'absent' };
  } catch (error) {
    reportCardFailure('app/[clinicSlug]:read-public-card-media', slug, error);
    return { status: 'unavailable' };
  }
}

/** Canonical public path of a clinic card. */
export function clinicCardPath(slug: string): string {
  return `/${encodeURIComponent(slug)}`;
}

/** Public delivery path of one card image. Carries no internal identifier beyond the media id. */
export function clinicCardMediaPath(slug: string, mediaId: string): string {
  return `/${encodeURIComponent(slug)}/media/${encodeURIComponent(mediaId)}`;
}

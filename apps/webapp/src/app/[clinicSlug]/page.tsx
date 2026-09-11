import { notFound, permanentRedirect } from 'next/navigation';
import {
  publicBookPaths,
  publicClinicCardPath,
  publicClinicSpecialistPath,
} from '@/shared/publicBook/paths';
import {
  ClinicPublicCardView,
  type ClinicPublicCardViewModel,
} from '@/shared/ui/clinicPublicCard/ClinicPublicCardView';
import { ClinicCardUnavailableError } from './clinicCardUnavailable';
import { clinicCardMediaPath, loadClinicPublicCardRsc } from './publicClinicCard';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ clinicSlug: string }> };

/**
 * Public clinic card `/{clinic}` — owner ruling 19.08 («просто их визитку с описанием»).
 *
 * Three refusals, deliberately different (plan §3.3):
 *   • unknown / unpublished / inactive / page switched off → the SAME 404, so an anonymous
 *     visitor cannot enumerate clinics by the shape of the answer;
 *   • the projection could not be read → an error status with a human sentence, never a blank
 *     card and never a 200 (see `clinicCardUnavailable.ts` on why 500 and not 503);
 *   • published with nothing written → the name and the booking button, no invented text.
 *
 * Everything on this page comes from one row of the public projection. No tenant table is read,
 * no internal identifier (organization, branch, tariff) reaches the markup, and nothing here
 * depends on the CMS entitlement — the card keeps working with the CMS switched off by
 * construction, not by a check.
 *
 * Саму разметку рисует `ClinicPublicCardView`, общий с предпросмотром в кабинете клиники: клиника
 * обязана править ровно то, что увидит посетитель. Здесь остаётся только анонимное чтение и выбор
 * адресов картинок — публичный медиа-роут, где набор карточки и есть авторизация.
 */
export default async function ClinicPublicCardPage({ params }: Props) {
  const { clinicSlug } = await params;
  const result = await loadClinicPublicCardRsc(clinicSlug);

  if (result.status === 'absent') notFound();
  // Не 200 с вежливым текстом: отказ чтения обязан нести код ошибки, иначе мониторинг и поисковик
  // считают мёртвую страницу здоровой. Текст человеку рисует `error.tsx` этого сегмента.
  if (result.status === 'unavailable') throw new ClinicCardUnavailableError(clinicSlug);

  const { card } = result;
  if (card.disposition === 'redirect') {
    permanentRedirect(publicClinicCardPath(card.canonicalSlug));
  }

  const view: ClinicPublicCardViewModel = {
    displayName: card.displayName,
    description: card.description,
    logoSrc:
      card.media
        .filter((item) => item.role === 'logo')
        .map((item) => clinicCardMediaPath(card.canonicalSlug, item.id))[0] ?? null,
    photoSrcs: card.media
      .filter((item) => item.role === 'photo')
      .map((item) => clinicCardMediaPath(card.canonicalSlug, item.id)),
    locations: card.locations,
    // Превью специалиста (решение владельца 11.09): фотография, имя, короткая строка, переход.
    // Аватар идёт тем же анонимным маршрутом, что логотип: он в наборе, который вернула дверь.
    specialists: card.specialists.map((specialist) => ({
      id: specialist.id,
      fullName: specialist.fullName,
      shortDescription: specialist.shortDescription,
      avatarSrc:
        specialist.avatarMediaId &&
        card.media.some((item) => item.id === specialist.avatarMediaId)
          ? clinicCardMediaPath(card.canonicalSlug, specialist.avatarMediaId)
          : null,
      href: publicClinicSpecialistPath(card.canonicalSlug, specialist.id),
    })),
    publicContactPhone: card.publicContactPhone,
    publicContactEmail: card.publicContactEmail,
    publicWebsiteUrl: card.publicWebsiteUrl,
    bookingHref: publicBookPaths.forSlug(card.canonicalSlug),
  };

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8">
      <ClinicPublicCardView card={view} />
    </main>
  );
}

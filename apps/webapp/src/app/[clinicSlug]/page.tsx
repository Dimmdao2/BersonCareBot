import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { publicBookPaths } from '@/shared/publicBook/paths';
import { titleForBookingCityCode } from '@/modules/patient-booking/inPersonServicesCatalog';
import { ClinicCardUnavailableError } from './clinicCardUnavailable';
import {
  clinicCardMediaPath,
  clinicCardPath,
  loadClinicPublicCardRsc,
} from './publicClinicCard';

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
    permanentRedirect(clinicCardPath(card.canonicalSlug));
  }

  const logo = card.media.find((item) => item.role === 'logo') ?? null;
  const photos = card.media.filter((item) => item.role === 'photo');

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8">
      <header className="flex items-center gap-4">
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={clinicCardMediaPath(card.canonicalSlug, logo.id)}
            alt=""
            className="size-16 shrink-0 rounded-md object-contain"
          />
        ) : (
          <div
            aria-hidden
            className="size-16 shrink-0 rounded-md border border-border/60 bg-muted/30"
          />
        )}
        <h1 className="text-xl font-semibold">{card.displayName}</h1>
      </header>

      {card.description ? (
        <section className="flex flex-col gap-2">
          {card.description.split(/\n{2,}/).map((paragraph, index) => (
            <p key={index} className="whitespace-pre-line text-sm leading-relaxed">
              {paragraph}
            </p>
          ))}
        </section>
      ) : null}

      {photos.length > 0 ? (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.map((photo) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={photo.id}
              src={clinicCardMediaPath(card.canonicalSlug, photo.id)}
              alt=""
              className="aspect-[4/3] w-full rounded-md object-cover"
            />
          ))}
        </section>
      ) : null}

      {card.locations.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">Адреса</h2>
          <ul className="flex flex-col gap-1 text-sm">
            {card.locations.map((location, index) => (
              <li key={`${location.title}:${index}`}>
                <span className="font-medium">{location.title}</span>
                {location.cityCode ? (
                  <span className="text-muted-foreground">
                    {' '}
                    · {titleForBookingCityCode(location.cityCode)}
                  </span>
                ) : null}
                {location.address ? (
                  <span className="text-muted-foreground"> · {location.address}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {card.publicContactPhone || card.publicContactEmail || card.publicWebsiteUrl ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">Контакты</h2>
          <ul className="flex flex-col gap-1 text-sm">
            {card.publicContactPhone ? (
              <li>
                <a className="underline underline-offset-2" href={`tel:${card.publicContactPhone}`}>
                  {card.publicContactPhone}
                </a>
              </li>
            ) : null}
            {card.publicContactEmail ? (
              <li>
                <a
                  className="underline underline-offset-2"
                  href={`mailto:${card.publicContactEmail}`}
                >
                  {card.publicContactEmail}
                </a>
              </li>
            ) : null}
            {card.publicWebsiteUrl ? (
              <li>
                <a
                  className="break-all underline underline-offset-2"
                  href={card.publicWebsiteUrl}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                >
                  {card.publicWebsiteUrl}
                </a>
              </li>
            ) : null}
          </ul>
        </section>
      ) : null}

      <Link
        href={publicBookPaths.forSlug(card.canonicalSlug)}
        prefetch={false}
        className="inline-flex w-fit items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
      >
        Записаться
      </Link>
    </main>
  );
}

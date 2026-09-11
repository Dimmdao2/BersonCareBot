import { notFound, permanentRedirect } from 'next/navigation';
import { routePaths } from '@/app-layer/routes/paths';
import { PLATFORM_NAME } from '@/config/productSurfaces';
import {
  publicBookPaths,
  publicClinicCardPath,
  publicClinicSpecialistPath,
} from '@/shared/publicBook/paths';
import {
  ClinicPublicCardView,
  type ClinicPublicCardViewModel,
} from '@/shared/ui/clinicPublicCard/ClinicPublicCardView';
import {
  ClinicRootEntryView,
  type ClinicRootEntryViewModel,
} from '@/shared/ui/clinicPublicCard/ClinicRootEntryView';
import { ClinicCardUnavailableError } from './clinicCardUnavailable';
import { clinicCardMediaPath, loadClinicPublicCardRsc } from './publicClinicCard';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ clinicSlug: string }> };

/**
 * Public clinic card `/{clinic}` — owner ruling 19.08 («просто их визитку с описанием»).
 *
 * Three refusals, deliberately different (plan §3.3):
 *   • unknown slug / clinic missing from the public directory / inactive organization → the SAME
 *     404, so an anonymous visitor cannot enumerate clinics by the shape of the answer;
 *   • the projection could not be read → an error status with a human sentence, never a blank
 *     card and never a 200 (see `clinicCardUnavailable.ts` on why 500 and not 503);
 *   • published with nothing written → the name and the booking button, no invented text.
 *
 * Клиника, которая ВЫКЛЮЧИЛА показ страницы, из этого перечня выведена решением владельца 11.09
 * (#926 §17.F): «корень клиники должен стать входом в кабинет. Не должно быть исчезнувшего
 * адреса». Она не 404, а вырожденный корень — имя, вход в кабинет, отметка платформы.
 *
 * Граница §3.3 при этом сдвинулась ровно на один шаг и не дальше: вырожденный корень получает
 * только клиника, которая УЖЕ публична — с `is_published` каталога, по адресу которой в это же
 * время отвечает `200` её запись (`/{clinic}/booking`). Её существование поэтому не новость.
 * Клиника без строки в каталоге и несуществующий слаг отдают ТОТ ЖЕ 404, что и раньше: дверь для
 * них по-прежнему не возвращает ничего, и перебирать по форме ответа нечего.
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

  const logoSrc =
    card.media
      .filter((item) => item.role === 'logo')
      .map((item) => clinicCardMediaPath(card.canonicalSlug, item.id))[0] ?? null;

  if (!card.cardIsPublished) {
    // Вырожденный корень — уточнение владельца 11.09: галка решает только ВИД этого экрана
    // («можно отобразить расширенный шаблон, а можно отобразить просто форму входа. Вот и всё»).
    // Дверь при этом отдаёт всё как обычно и ничего не закрывает: фотографии, материалы и страницы
    // специалистов этой клиники продолжают открываться по своим адресам.
    const entry: ClinicRootEntryViewModel = {
      displayName: card.displayName,
      logoSrc,
      cabinetHref: routePaths.root,
      platformName: PLATFORM_NAME,
    };
    return (
      <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8">
        <ClinicRootEntryView entry={entry} />
      </main>
    );
  }

  const view: ClinicPublicCardViewModel = {
    displayName: card.displayName,
    description: card.description,
    logoSrc,
    photoSrcs: card.media
      .filter((item) => item.role === 'photo')
      .map((item) => clinicCardMediaPath(card.canonicalSlug, item.id)),
    locations: card.locations,
    services: card.services,
    // Полное описание клиники материалом (решение владельца 11.09, §17.H). Медиа берутся из ТОГО
    // ЖЕ набора двери, что логотип и аватары: он и есть право на анонимную отдачу файла, поэтому
    // подписанный `/api/media/{uuid}` на этой странице не участвует вовсе. Ссылке на файл вне
    // набора не соответствует ничего — показывать по ней нечего.
    fullDescriptionMarkdown: card.fullDescriptionMarkdown,
    fullDescriptionMedia: card.media.map((item) => ({
      id: item.id,
      mimeType: item.mimeType,
      src: clinicCardMediaPath(card.canonicalSlug, item.id),
    })),
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

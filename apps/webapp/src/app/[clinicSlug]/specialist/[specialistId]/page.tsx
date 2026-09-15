import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { PATIENT_DEFAULT_SURFACE } from '@/config/productSurfaces';
import { publicClinicCardPath, publicClinicSpecialistPath } from '@/shared/publicBook/paths';
import {
  SpecialistPublicCardView,
  type SpecialistPublicCardViewModel,
} from '@/shared/ui/clinicPublicCard/SpecialistPublicCardView';
import { ClinicCardUnavailableError } from '../../clinicCardUnavailable';
import { clinicCardMediaPath, loadPublicSpecialistRsc } from '../../publicClinicCard';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ clinicSlug: string; specialistId: string }> };

/**
 * Превью ссылки на специалиста: его имя, короткое описание и его же аватар.
 *
 * Аватар берётся из набора медиа визитки — того самого, что и на самой странице, — и по его же
 * публичному адресу: робот превью приходит без сессии. Нет аватара или страница не читается —
 * картинку не заявляем, выдумывать замену нечем.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { clinicSlug, specialistId } = await params;
  const result = await loadPublicSpecialistRsc(clinicSlug, specialistId);
  if (result.status !== 'ok') return {};
  const { card, specialist } = result.page;
  const description = specialist.shortDescription?.trim() || undefined;
  const hasAvatar =
    Boolean(specialist.avatarMediaId) &&
    card.media.some((item) => item.id === specialist.avatarMediaId);
  const image =
    hasAvatar && specialist.avatarMediaId
      ? absolutePublicUrl(clinicCardMediaPath(card.canonicalSlug, specialist.avatarMediaId))
      : null;
  return {
    title: specialist.fullName,
    ...(description ? { description } : {}),
    openGraph: {
      title: specialist.fullName,
      ...(description ? { description } : {}),
      type: 'profile',
      siteName: card.displayName,
      ...(image ? { images: [{ url: image, alt: specialist.fullName }] } : {}),
    },
    ...(image
      ? { twitter: { card: 'summary', title: specialist.fullName, images: [image] } }
      : {}),
  };
}

/** Абсолютный адрес на пациентском origin: относительный робот превью не разрешит. */
function absolutePublicUrl(path: string): string | null {
  try {
    return new URL(path, PATIENT_DEFAULT_SURFACE.origin).toString();
  } catch {
    return null;
  }
}

/**
 * Публичная страница специалиста `/{clinic}/specialist/{id}` — решение владельца 11.09 (план §17.G):
 * «это отдельная страница специалиста… его данные там должны быть».
 *
 * Три отказа те же, что у визитки клиники, и намеренно теми же словами (план §3.3):
 *   • клиники нет в публичном каталоге / человека нет / он неактивен / клиника его не публикует →
 *     ОДИН И ТОТ ЖЕ `404`, иначе аноним перебирает клиники и людей по форме ответа. Галка
 *     «показывать страницу организации» сюда НЕ входит — уточнение владельца 11.09 (§17.F):
 *     «если специалист включён, не надо выключать его визитку, в принципе»;
 *   • проекция не прочиталась → код ошибки с человеческим текстом, никогда не пустая страница;
 *   • опубликован, но описания нет → имя и аватар без выдуманного текста.
 *
 * Всё содержимое приходит ОДНОЙ дверью визитки клиники: новой публичной двери эта страница не
 * завела (§5 «Один общий проход», §24.2). Оттуда же приходит набор медиа — он и есть право на
 * анонимную отдачу файла, поэтому подписанный `/api/media/{uuid}` здесь не участвует вовсе.
 */
export default async function SpecialistPublicPage({ params }: Props) {
  const { clinicSlug, specialistId } = await params;
  const result = await loadPublicSpecialistRsc(clinicSlug, specialistId);

  if (result.status === 'absent') notFound();
  if (result.status === 'unavailable') throw new ClinicCardUnavailableError(clinicSlug);

  const { card, specialist } = result.page;
  if (card.disposition === 'redirect') {
    permanentRedirect(publicClinicSpecialistPath(card.canonicalSlug, specialist.id));
  }

  const view: SpecialistPublicCardViewModel = {
    fullName: specialist.fullName,
    shortDescription: specialist.shortDescription,
    avatarSrc:
      specialist.avatarMediaId && card.media.some((item) => item.id === specialist.avatarMediaId)
        ? clinicCardMediaPath(card.canonicalSlug, specialist.avatarMediaId)
        : null,
    fullDescriptionMarkdown: specialist.fullDescriptionMarkdown,
    // Набор двери целиком: в нём лежит ровно то, что клиника опубликовала, и ничего больше.
    // Ссылки на файл вне набора в материале не существует — показывать по ней нечего.
    descriptionMedia: card.media.map((item) => ({
      id: item.id,
      mimeType: item.mimeType,
      src: clinicCardMediaPath(card.canonicalSlug, item.id),
    })),
    clinicName: card.displayName,
    clinicHref: publicClinicCardPath(card.canonicalSlug),
  };

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8">
      <SpecialistPublicCardView specialist={view} />
    </main>
  );
}

import { titleForBookingCityCode } from '@/modules/patient-booking/inPersonServicesCatalog';

/**
 * Готовая к показу визитка клиники. Ровно то, что видит человек, и ничего про то, откуда это взято.
 *
 * Компонент общий для двух мест намеренно: публичная страница `/{clinic}` и предпросмотр в кабинете
 * обязаны показывать ОДНО И ТО ЖЕ. Две копии этой разметки означали бы, что клиника правит страницу
 * по одному изображению, а посетитель видит другое, — и разошлись бы они молча.
 *
 * Адреса картинок компонент не строит: публичная страница отдаёт их через свой анонимный медиа-роут
 * (набор карточки И ЕСТЬ авторизация), кабинет — через общий `/api/media/{uuid}` под сессией
 * сотрудника. Поэтому сюда приходят уже готовые `src`.
 */
/**
 * Специалист на визитке стоит ПРЕВЬЮ — решение владельца 11.09: «привьюшка есть на визитке
 * клиники, а как бы подробное описание можно будет добавлять на его визитку». Поэтому здесь
 * фотография, имя, короткая строка и переход, но не полное описание.
 */
export type ClinicPublicCardSpecialistView = {
  id: string;
  fullName: string;
  shortDescription: string | null;
  avatarSrc: string | null;
  /** `null` в предпросмотре кабинета: публичного адреса страницы там ещё может не быть. */
  href: string | null;
};

export type ClinicPublicCardLocationView = {
  title: string;
  cityCode: string | null;
  address: string | null;
};

export type ClinicPublicCardViewModel = {
  displayName: string;
  description: string | null;
  logoSrc: string | null;
  photoSrcs: readonly string[];
  locations: readonly ClinicPublicCardLocationView[];
  specialists: readonly ClinicPublicCardSpecialistView[];
  publicContactPhone: string | null;
  publicContactEmail: string | null;
  publicWebsiteUrl: string | null;
  /** `null` в предпросмотре: кнопка записи ведёт на публичный адрес, которого ещё может не быть. */
  bookingHref: string | null;
};

export function ClinicPublicCardView({ card }: { card: ClinicPublicCardViewModel }) {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center gap-4">
        {card.logoSrc ? (
          // Логотип живёт в медиа-хранилище арендатора и меняется по его публикации: next/image
          // потребовал бы заранее объявленного списка хостов.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={card.logoSrc}
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

      {card.specialists.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">Специалисты</h2>
          <ul className="flex flex-col gap-2">
            {card.specialists.map((specialist) => (
              <li key={specialist.id}>
                <SpecialistPreview specialist={specialist} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {card.photoSrcs.length > 0 ? (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {card.photoSrcs.map((src) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={src} src={src} alt="" className="aspect-[4/3] w-full rounded-md object-cover" />
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

      {card.bookingHref ? (
        <a
          href={card.bookingHref}
          className="inline-flex w-fit items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Записаться
        </a>
      ) : (
        <span className="inline-flex w-fit items-center rounded-md bg-primary/40 px-4 py-2 text-sm font-medium text-primary-foreground">
          Записаться
        </span>
      )}
    </div>
  );
}

/**
 * Одна строка превью. Разметка общая для ссылки и для предпросмотра без адреса: расходиться этим
 * двум видам нельзя — клиника правит ровно то, что увидит посетитель.
 */
function SpecialistPreview({ specialist }: { specialist: ClinicPublicCardSpecialistView }) {
  const body = (
    <>
      {specialist.avatarSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={specialist.avatarSrc}
          alt=""
          className="size-12 shrink-0 rounded-full object-cover"
        />
      ) : (
        <div
          aria-hidden
          className="size-12 shrink-0 rounded-full border border-border/60 bg-muted/30"
        />
      )}
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-medium">{specialist.fullName}</span>
        {specialist.shortDescription ? (
          <span className="truncate text-sm text-muted-foreground">
            {specialist.shortDescription}
          </span>
        ) : null}
      </span>
    </>
  );

  if (!specialist.href) {
    return <span className="flex items-center gap-3">{body}</span>;
  }
  return (
    <a href={specialist.href} className="flex items-center gap-3 hover:underline">
      {body}
    </a>
  );
}

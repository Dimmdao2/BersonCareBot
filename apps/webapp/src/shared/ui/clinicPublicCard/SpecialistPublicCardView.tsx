import { PublicMarkdownMaterial, type PublicMarkdownAsset } from './PublicMarkdownMaterial';

/**
 * Публичная страница специалиста (#926 §17.G, решение владельца 11.09: «это отдельная страница
 * специалиста… не так наполнена, как страница клиники, но его данные там должны быть»).
 *
 * Чего здесь НЕТ и почему: адресов и услуг. Их место — визитка клиники, и у соло-специалиста она
 * тоже остаётся («клиника, там может быть один специалист, это его клиника»). Второго места, где
 * живёт адрес, не заводится.
 */
export type SpecialistPublicCardViewModel = {
  fullName: string;
  /** Короткое описание обычным текстом — та же строка, что стоит в превью на визитке. */
  shortDescription: string | null;
  avatarSrc: string | null;
  /** Полное описание материалом; `null` — клиника его не заполнила, выдумывать текст нельзя. */
  fullDescriptionMarkdown: string | null;
  /** Файлы, которые материал имеет право показать анониму. Пусто — материал без медиа. */
  descriptionMedia: readonly PublicMarkdownAsset[];
  clinicName: string;
  /** Ссылка на визитку клиники; `null` в предпросмотре, где публичного адреса ещё нет. */
  clinicHref: string | null;
};

export function SpecialistPublicCardView({
  specialist,
}: {
  specialist: SpecialistPublicCardViewModel;
}) {
  return (
    <div className="flex flex-col gap-6">
      {specialist.clinicHref ? (
        <a
          href={specialist.clinicHref}
          className="w-fit text-sm text-muted-foreground underline underline-offset-2"
        >
          {specialist.clinicName}
        </a>
      ) : (
        <span className="text-sm text-muted-foreground">{specialist.clinicName}</span>
      )}

      <header className="flex items-center gap-4">
        {specialist.avatarSrc ? (
          // Аватар живёт в медиа-хранилище арендатора и меняется по его публикации: next/image
          // потребовал бы заранее объявленного списка хостов.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={specialist.avatarSrc}
            alt=""
            className="size-20 shrink-0 rounded-full object-cover"
          />
        ) : (
          <div
            aria-hidden
            className="size-20 shrink-0 rounded-full border border-border/60 bg-muted/30"
          />
        )}
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold">{specialist.fullName}</h1>
          {specialist.shortDescription ? (
            <p className="text-sm text-muted-foreground">{specialist.shortDescription}</p>
          ) : null}
        </div>
      </header>

      {specialist.fullDescriptionMarkdown ? (
        <section>
          <PublicMarkdownMaterial
            markdown={specialist.fullDescriptionMarkdown}
            media={specialist.descriptionMedia}
          />
        </section>
      ) : null}
    </div>
  );
}

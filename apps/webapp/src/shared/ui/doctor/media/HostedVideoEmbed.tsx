'use client';

import { toHostedVideoEmbedSrc, isHostedVideoEmbedSrc } from '@/shared/lib/hostingEmbedUrls';
import { cn } from '@/lib/utils';

export type HostedVideoEmbedProps = {
  /** Канонический URL ролика, сохранённый в базе (`media_type = 'hosted_video'`). */
  url: string;
  title: string;
  className?: string;
};

/**
 * Внешнее видео в том же слоте, где стоит файловый плеер: та же рамка `aspect-video`, тот же
 * `<iframe>`, что уже используется для встраивания в тексте Markdown — своего оформления плеера
 * здесь не появляется, чужой хост рисует собственные органы управления.
 *
 * Источник берётся только из {@link toHostedVideoEmbedSrc} и ещё раз сверяется по allowlist
 * origin: в `src` не может попасть ничего, кроме четырёх разрешённых хостов, даже если в базе
 * окажется строка, записанная в обход формы.
 *
 * ЗОНА: копия для doctor. Кросс-импорт между зонами запрещён (AGENTS §17), поэтому у пациента
 * лежит такой же файл; менять их следует вместе.
 */
export function HostedVideoEmbed({ url, title, className }: HostedVideoEmbedProps) {
  const src = toHostedVideoEmbedSrc(url);
  if (!src || !isHostedVideoEmbedSrc(src)) {
    return (
      <div
        className={cn(
          'flex aspect-video w-full items-center justify-center bg-muted/30 px-3 text-center text-sm text-muted-foreground',
          className,
        )}
      >
        Ссылка на видео не распознана — откройте упражнение и вставьте её заново.
      </div>
    );
  }
  return (
    <div className={cn('relative aspect-video w-full overflow-hidden rounded-lg bg-black', className)}>
      <iframe
        src={src}
        className="absolute inset-0 size-full border-0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        title={title}
        loading="lazy"
      />
    </div>
  );
}

'use client';

import { useState } from 'react';
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
 * Плеер монтируется ПО НАЖАТИЮ, а не при открытии экрана. Причина не в оформлении: все четыре
 * хоста при загрузке плеера получают IP и user-agent зрителя, а RuTube и VK Видео ставят куки
 * сразу и режима без них не имеют — у VK это к тому же связывает просмотр с аккаунтом, если
 * человек в него вошёл. Экран пациента открывается по назначению врача, а не по желанию смотреть
 * видео, поэтому до нажатия наружу не уходит ничего. Это стандартная практика встраивания
 * (click-to-play facade), а не наша выдумка; отменяется удалением состояния `started`.
 *
 * ЗОНА: копия для doctor. Кросс-импорт между зонами запрещён (AGENTS §17), поэтому у пациента
 * лежит такой же файл; менять их следует вместе.
 */
export function HostedVideoEmbed({ url, title, className }: HostedVideoEmbedProps) {
  const [started, setStarted] = useState(false);
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
  if (!started) {
    return (
      <button
        type="button"
        onClick={() => setStarted(true)}
        className={cn(
          'group relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-lg bg-black/90 text-white',
          className,
        )}
        aria-label={`Показать видео: ${title}`}
      >
        <span className="flex size-16 items-center justify-center rounded-full bg-white/15 transition group-hover:bg-white/25">
          <svg viewBox="0 0 24 24" aria-hidden className="size-7 fill-current">
            <path d="M8 5v14l11-7z" />
          </svg>
        </span>
        <span className="absolute inset-x-0 bottom-0 px-3 py-2 text-center text-xs text-white/70">
          Видео загрузится с внешнего сайта после нажатия
        </span>
      </button>
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

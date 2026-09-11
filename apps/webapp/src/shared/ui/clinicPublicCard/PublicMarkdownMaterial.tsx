'use client';

import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';
import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { toHostedVideoEmbedSrc } from '@/shared/lib/hostingEmbedUrls';

/**
 * Один файл, который ОПУБЛИКОВАННЫЙ материал имеет право показать анониму.
 *
 * `src` уже построен вызывающим — это анонимный адрес отдачи `/{clinic}/media/{uuid}`, а не общий
 * `/api/media/{uuid}`: последний отвечает только под сессией и таким обязан остаться.
 */
export type PublicMarkdownAsset = {
  id: string;
  mimeType: string;
  src: string;
};

/**
 * Markdown-материал на ПУБЛИЧНОЙ странице (#926 §17.H).
 *
 * Стек тот же, что у обеих зон кабинета и пациента: react-markdown + remarkGfm + rehypeSanitize,
 * сырой HTML запрещён. Отдельный компонент нужен не ради другой разметки, а потому что оба
 * существующих рендера разрешают медиа через `/api/media/{uuid}` и `/api/media/{uuid}/playback` —
 * дверь, которая анонима не пускает и не должна начать. Здесь источник прав ровно один: набор
 * медиа, который вернула сама дверь визитки. Ссылки, которой в наборе нет, соответствует НИЧЕГО —
 * подставить чужой uuid в опубликованный текст бессмысленно.
 *
 * §17 (изоляция зон UI): файл лежит вне `shared/ui/patient/**` и вне `shared/ui/doctor/**` и не
 * импортирует ни ту, ни другую зону — публичная поверхность не тянет за собой ни пациентские, ни
 * докторские примитивы, и правка стиля в любой из зон её не перекрашивает.
 */
type Props = {
  markdown: string;
  media: readonly PublicMarkdownAsset[];
};

/**
 * `/api/media/{что-то}` из ссылки. Форма идентификатора здесь НЕ проверяется намеренно: судьёй
 * является набор медиа двери, а вторая проверка формы рядом с ним разошлась бы с первой.
 */
function mediaIdFromHref(href: string): string | null {
  const path = href.trim().split('#')[0]?.split('?')[0] ?? '';
  return /^(?:https?:\/\/[^/]+)?\/api\/media\/([^/]+)$/i.exec(path)?.[1] ?? null;
}

const remarkPlugins = [remarkGfm];
const rehypePlugins = [rehypeSanitize];

export function PublicMarkdownMaterial({ markdown, media }: Props) {
  const components = useMemo<Components>(() => {
    const assets = new Map(media.map((asset) => [asset.id.toLowerCase(), asset]));

    function assetForHref(href: string | undefined): PublicMarkdownAsset | null {
      if (!href) return null;
      const id = mediaIdFromHref(href);
      return id ? (assets.get(id.toLowerCase()) ?? null) : null;
    }

    return {
      img({ src, alt, className }) {
        const href = typeof src === 'string' ? src : undefined;
        const asset = assetForHref(href);
        // Ссылка на библиотеку, которой нет в опубликованном наборе, не превращается в битую
        // картинку и не уходит на сессионный чокпоинт: её просто нет на странице.
        if (!asset && href && mediaIdFromHref(href)) return null;
        if (!href) return null;
        return (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={asset ? asset.src : href}
            alt={alt ?? ''}
            className={cn('my-3 h-auto w-full max-w-full rounded-md', className)}
          />
        );
      },
      a({ href, children, className, node: _node, ...rest }) {
        const asset = assetForHref(href);
        if (asset) {
          const mime = asset.mimeType.toLowerCase();
          if (mime.startsWith('video/')) {
            return (
              <span className={cn('my-3 block w-full max-w-full', className)}>
                <video controls preload="metadata" className="w-full rounded-md" src={asset.src} />
              </span>
            );
          }
          if (mime.startsWith('audio/')) {
            return (
              <span className={cn('my-3 block w-full max-w-full', className)}>
                <audio controls preload="metadata" className="w-full" src={asset.src} />
              </span>
            );
          }
          if (mime.startsWith('image/')) {
            return (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={asset.src}
                alt={typeof children === 'string' ? children : ''}
                className={cn('my-3 h-auto w-full max-w-full rounded-md', className)}
              />
            );
          }
          return (
            <a className={cn('underline underline-offset-2', className)} href={asset.src} {...rest}>
              {children}
            </a>
          );
        }

        if (href && mediaIdFromHref(href)) {
          // Файл клиники, который она не опубликовала: показываем текст ссылки без адреса, а не
          // приглашение постучаться в сессионную дверь.
          return <span className={className}>{children}</span>;
        }

        const hostedEmbed = href ? toHostedVideoEmbedSrc(href) : null;
        if (hostedEmbed) {
          return (
            <span className={cn('my-3 block w-full max-w-full', className)}>
              <iframe
                src={hostedEmbed}
                title={typeof children === 'string' ? children : 'Видео'}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="aspect-video w-full rounded-md border-0"
              />
            </span>
          );
        }

        return (
          <a
            className={cn('underline underline-offset-2', className)}
            href={href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            {...rest}
          >
            {children}
          </a>
        );
      },
    };
  }, [media]);

  return (
    <div className="clinic-public-markdown flex flex-col gap-2 text-sm leading-relaxed">
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={components}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}

'use client';

import { MarkdownBodyTree } from '@/shared/ui/markdown/markdownRenderTree';
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
 *
 * Хвост `/playback` распознаётся наравне с голым адресом: редактор кабинета вставляет ИМЕННО его
 * для видео. Без этого такая ссылка не опознавалась как медиа и уезжала обычным `<a>` на сессионную
 * дверь — на публичной странице это ссылка в никуда для анонима.
 */
function mediaIdFromHref(href: string): string | null {
  const path = href.trim().split('#')[0]?.split('?')[0] ?? '';
  return /^(?:https?:\/\/[^/]+)?\/api\/media\/([^/]+)(?:\/playback)?$/i.exec(path)?.[1] ?? null;
}

export function PublicMarkdownMaterial({ markdown, media }: Props) {
  const components = useMemo<Components>(() => {
    const assets = new Map(media.map((asset) => [asset.id.toLowerCase(), asset]));

    function assetForHref(href: string | undefined): PublicMarkdownAsset | null {
      if (!href) return null;
      const id = mediaIdFromHref(href);
      return id ? (assets.get(id.toLowerCase()) ?? null) : null;
    }

    return {
      // Типографика материала. Preflight снимает вид у заголовков, списков и цитат, поэтому без
      // этих правил лендинг специалиста рисуется сплошным текстом: заголовок неотличим от абзаца,
      // у списка нет маркеров, цитата не выделена. Найдено живым взглядом после приземления этапа
      // 2a — ни один тест такого не видит. Классы держим здесь, а не в таблице стилей зоны: файл
      // намеренно зоно-нейтральный и не должен зависеть от пациентского или докторского CSS.
      h1: ({ children }) => (
        <h2 className="mt-4 mb-1 text-lg leading-snug font-semibold first:mt-0">{children}</h2>
      ),
      h2: ({ children }) => (
        <h2 className="mt-4 mb-1 text-base leading-snug font-semibold first:mt-0">{children}</h2>
      ),
      h3: ({ children }) => (
        <h3 className="mt-3 mb-1 text-sm leading-snug font-semibold first:mt-0">{children}</h3>
      ),
      h4: ({ children }) => <h4 className="mt-3 mb-1 text-sm font-semibold">{children}</h4>,
      p: ({ children }) => <p className="my-0">{children}</p>,
      ul: ({ children }) => <ul className="my-1 list-disc space-y-1 pl-5">{children}</ul>,
      ol: ({ children }) => <ol className="my-1 list-decimal space-y-1 pl-5">{children}</ol>,
      li: ({ children }) => <li className="pl-0.5">{children}</li>,
      blockquote: ({ children }) => (
        <blockquote className="border-border text-muted-foreground my-2 border-l-2 pl-3 italic">
          {children}
        </blockquote>
      ),
      hr: () => <hr className="border-border my-4" />,
      code: ({ children }) => (
        <code className="bg-muted rounded px-1 py-0.5 font-mono text-[0.9em]">{children}</code>
      ),
      table: ({ children }) => (
        <div className="my-2 w-full overflow-x-auto">
          <table className="w-full border-collapse text-[0.95em]">{children}</table>
        </div>
      ),
      th: ({ children }) => (
        <th className="border-border border px-2 py-1 text-left font-semibold">{children}</th>
      ),
      td: ({ children }) => <td className="border-border border px-2 py-1">{children}</td>,
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
      <MarkdownBodyTree components={components}>{markdown}</MarkdownBodyTree>
    </div>
  );
}

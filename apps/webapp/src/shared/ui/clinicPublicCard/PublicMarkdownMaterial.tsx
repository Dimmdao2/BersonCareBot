'use client';

import { useCallback, useMemo } from 'react';
import { toHostedVideoEmbedSrc } from '@/shared/lib/hostingEmbedUrls';
import { parseTiptapRichText } from '@/shared/lib/richText';
import {
  RichTextDocumentTree,
  type RichTextImageRenderProps,
  type RichTextLinkRenderProps,
  type RichTextVideoRenderProps,
} from '@/shared/ui/rich-text/RichTextDocumentTree';

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
 * Форматированный материал на ПУБЛИЧНОЙ странице: versioned Tiptap JSON.
 *
 * Отдельный компонент нужен потому, что рендеры кабинета разрешают медиа через
 * `/api/media/{uuid}` и `/api/media/{uuid}/playback` —
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
  const assets = useMemo(
    () => new Map(media.map((asset) => [asset.id.toLowerCase(), asset])),
    [media],
  );

  const assetForHref = useCallback(
    (href: string | undefined): PublicMarkdownAsset | null => {
      if (!href) return null;
      const id = mediaIdFromHref(href);
      return id ? (assets.get(id.toLowerCase()) ?? null) : null;
    },
    [assets],
  );

  const document = parseTiptapRichText(markdown);

  function renderRichTextImage({ src, alt, title }: RichTextImageRenderProps) {
    const asset = assetForHref(src);
    if (!asset && mediaIdFromHref(src)) return null;
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={asset ? asset.src : src}
        alt={alt}
        title={title}
        className="my-3 h-auto w-full max-w-full rounded-md"
      />
    );
  }

  function renderRichTextLink({ href, children, title }: RichTextLinkRenderProps) {
    const asset = assetForHref(href);
    if (asset) {
      const mime = asset.mimeType.toLowerCase();
      if (mime.startsWith('video/')) {
        return (
          <span className="my-3 block w-full max-w-full">
            <video controls preload="metadata" className="w-full rounded-md" src={asset.src} />
          </span>
        );
      }
      if (mime.startsWith('audio/')) {
        return (
          <span className="my-3 block w-full max-w-full">
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
            className="my-3 h-auto w-full max-w-full rounded-md"
          />
        );
      }
      return (
        <a className="underline underline-offset-2" href={asset.src} title={title}>
          {children}
        </a>
      );
    }

    if (mediaIdFromHref(href)) return <span>{children}</span>;

    const hostedEmbed = toHostedVideoEmbedSrc(href);
    if (hostedEmbed) {
      return (
        <span className="my-3 block w-full max-w-full">
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
        className="underline underline-offset-2"
        href={href}
        title={title}
        target="_blank"
        rel="noopener noreferrer nofollow"
      >
        {children}
      </a>
    );
  }

  function renderRichTextVideo({ src, title }: RichTextVideoRenderProps) {
    return renderRichTextLink({ href: src, title, children: title });
  }

  return (
    <div className="clinic-public-markdown flex flex-col gap-2 text-sm leading-relaxed [&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:italic [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_h1]:mt-4 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:mt-4 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:mt-3 [&_h3]:font-semibold [&_img]:max-w-full [&_li]:pl-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3 [&_table]:w-full [&_ul]:list-disc [&_ul]:pl-5">
      {document ? (
        <RichTextDocumentTree
          document={document}
          renderLink={renderRichTextLink}
          renderImage={renderRichTextImage}
          renderVideo={renderRichTextVideo}
        />
      ) : (
        <span className="whitespace-pre-wrap">{markdown}</span>
      )}
    </div>
  );
}

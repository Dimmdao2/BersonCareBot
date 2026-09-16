'use client';

import type { JSONContent } from '@tiptap/core';
import type { Mark, Node } from '@tiptap/pm/model';
import { renderToReactElement } from '@tiptap/static-renderer/pm/react';
import { useMemo, type ReactNode } from 'react';
import { createRichTextSchemaExtensions } from '@/shared/lib/richTextExtensions';
import { safeRichTextUrl } from '@/shared/lib/richText';

export type RichTextLinkRenderProps = {
  href: string;
  title?: string;
  target?: string;
  rel?: string;
  children: ReactNode;
};

export type RichTextImageRenderProps = {
  src: string;
  alt: string;
  title?: string;
};

type Props = {
  document: JSONContent;
  renderLink?: (props: RichTextLinkRenderProps) => ReactNode;
  renderImage?: (props: RichTextImageRenderProps) => ReactNode;
};

function stringAttribute(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function RichTextDocumentTree({ document, renderLink, renderImage }: Props) {
  return useMemo(() => {
    try {
      return renderToReactElement({
        content: document,
        extensions: createRichTextSchemaExtensions(),
        options: {
          markMapping: {
            link: ({ mark, children }: { mark: Mark; children?: ReactNode | ReactNode[] }) => {
              const href = safeRichTextUrl(mark.attrs.href);
              if (!href) return <>{children}</>;
              const props: RichTextLinkRenderProps = {
                href,
                children,
                ...(stringAttribute(mark.attrs.title) ? { title: String(mark.attrs.title) } : {}),
                ...(stringAttribute(mark.attrs.target) ? { target: String(mark.attrs.target) } : {}),
                ...(stringAttribute(mark.attrs.rel) ? { rel: String(mark.attrs.rel) } : {}),
              };
              return renderLink ? (
                renderLink(props)
              ) : (
                <a
                  href={props.href}
                  title={props.title}
                  target={props.target ?? '_blank'}
                  rel={props.rel ?? 'noopener noreferrer nofollow'}
                >
                  {props.children}
                </a>
              );
            },
          },
          nodeMapping: {
            image: ({ node }: { node: Node }) => {
              const src = safeRichTextUrl(node.attrs.src);
              if (!src) return null;
              const props: RichTextImageRenderProps = {
                src,
                alt: stringAttribute(node.attrs.alt) ?? '',
                ...(stringAttribute(node.attrs.title) ? { title: String(node.attrs.title) } : {}),
              };
              return renderImage ? (
                renderImage(props)
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={props.src} alt={props.alt} title={props.title} />
              );
            },
          },
        },
      });
    } catch {
      return null;
    }
  }, [document, renderImage, renderLink]);
}

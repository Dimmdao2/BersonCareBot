'use client';

import type { ReactNode } from 'react';
import { parseTiptapRichText } from '@/shared/lib/richText';
import {
  RichTextDocumentTree,
  type RichTextLinkRenderProps,
  type RichTextVideoRenderProps,
} from '@/shared/ui/rich-text/RichTextDocumentTree';
import { MarkdownEmbeddedLink } from './MarkdownEmbeddedLink';

function renderRichTextLink(props: RichTextLinkRenderProps): ReactNode {
  return <MarkdownEmbeddedLink {...props} />;
}

function renderRichTextVideo(props: RichTextVideoRenderProps): ReactNode {
  return (
    <MarkdownEmbeddedLink href={props.src} title={props.title}>
      {props.title}
    </MarkdownEmbeddedLink>
  );
}

/** Привязка общего дерева к зоне: дерево одно, ссылка зоны своя (§17). */
export function MarkdownBodyTree({ children }: { children: string }): ReactNode {
  const document = parseTiptapRichText(children);
  return document ? (
    <RichTextDocumentTree
      document={document}
      renderLink={renderRichTextLink}
      renderVideo={renderRichTextVideo}
    />
  ) : (
    <span className="whitespace-pre-wrap">{children}</span>
  );
}

'use client';

import type { ReactNode } from 'react';
import { parseTiptapRichText } from '@/shared/lib/richText';
import {
  RichTextDocumentTree,
  type RichTextLinkRenderProps,
} from '@/shared/ui/rich-text/RichTextDocumentTree';
import { MarkdownEmbeddedLink } from './MarkdownEmbeddedLink';

function renderRichTextLink(props: RichTextLinkRenderProps): ReactNode {
  return <MarkdownEmbeddedLink {...props} />;
}

/** Привязка общего дерева к зоне: дерево одно, ссылка зоны своя (§17). */
export function MarkdownBodyTree({ children }: { children: string }): ReactNode {
  const document = parseTiptapRichText(children);
  return document ? (
    <RichTextDocumentTree document={document} renderLink={renderRichTextLink} />
  ) : (
    <span className="whitespace-pre-wrap">{children}</span>
  );
}

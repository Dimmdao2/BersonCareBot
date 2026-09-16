'use client';

import DOMPurify from 'isomorphic-dompurify';
import type { ContentBodyFormat } from '@/modules/content-catalog/types';
import { MarkdownBodyTree } from '@/shared/ui/patient/markdown/markdownRenderTree';

type Props = {
  text: string;
  bodyFormat: ContentBodyFormat;
  className?: string;
};

/**
 * Patient-facing rich content: Tiptap JSON, plus sanitized legacy HTML from the retired CMS field.
 */
export function MarkdownContent({ text, bodyFormat, className }: Props) {
  const wrap = className ?? 'markdown-preview';

  if (bodyFormat === 'legacy-html') {
    const html = DOMPurify.sanitize(text, {
      USE_PROFILES: { html: true },
    });
    return <div className={wrap} dangerouslySetInnerHTML={{ __html: html }} />;
  }

  return (
    <div className={wrap}>
      <MarkdownBodyTree>{text.length > 0 ? text : ''}</MarkdownBodyTree>
    </div>
  );
}

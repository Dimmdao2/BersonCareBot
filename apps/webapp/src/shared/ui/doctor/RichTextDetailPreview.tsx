'use client';

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { doctorSectionCardClass, doctorSectionTitleClass } from '@/shared/ui/doctor/doctorVisual';
import { parseTiptapRichText } from '@/shared/lib/richText';
import { mediaPreviewMdUrl } from '@/shared/lib/mediaPreviewUrls';
import {
  RichTextDocumentTree,
  type RichTextVideoRenderProps,
} from '@/shared/ui/rich-text/RichTextDocumentTree';

const PREVIEW_SCALE = 0.5;
const PREVIEW_MIN_HEIGHT = 260;

function StaticRichTextPreview({ value }: { value: string }) {
  const document = parseTiptapRichText(value);

  function renderVideo({ src, title }: RichTextVideoRenderProps) {
    const poster = mediaPreviewMdUrl(src);
    return poster ? (
      <figure className="my-3 flex aspect-video w-full max-w-3xl flex-col overflow-hidden rounded-[10px] border border-border bg-muted">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={poster} alt={title} className="min-h-0 flex-1 object-cover" />
      </figure>
    ) : (
      <a href={src} target="_blank" rel="noopener noreferrer nofollow">
        {title}
      </a>
    );
  }

  return (
    <div className="markdown-preview rich-text-scaled-page-preview">
      {document ? (
        <RichTextDocumentTree document={document} renderVideo={renderVideo} />
      ) : (
        <span className="whitespace-pre-wrap">{value}</span>
      )}
    </div>
  );
}

function ScaledPagePreview({ children }: { children: ReactNode }) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState(PREVIEW_MIN_HEIGHT / PREVIEW_SCALE);

  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const updateHeight = () => {
      setContentHeight(Math.max(PREVIEW_MIN_HEIGHT / PREVIEW_SCALE, content.scrollHeight));
    };
    updateHeight();
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateHeight);
    observer?.observe(content);
    return () => observer?.disconnect();
  }, []);

  return (
    <div className="max-h-[520px] overflow-x-hidden overflow-y-auto rounded-[10px] border border-border bg-muted/20">
      <div
        className="relative w-full overflow-hidden"
        style={{ height: contentHeight * PREVIEW_SCALE }}
      >
        <div
          ref={contentRef}
          className="pointer-events-none absolute top-0 left-0 min-h-[520px] origin-top-left select-none bg-white p-3 text-foreground"
          style={{
            width: `${100 / PREVIEW_SCALE}%`,
            transform: `scale(${PREVIEW_SCALE})`,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

export function RichTextDetailPreview({
  id,
  value,
  disabled = false,
  onEdit,
}: {
  id?: string;
  value: string;
  disabled?: boolean;
  onEdit: () => void;
}) {
  return (
    <section id={id} className={doctorSectionCardClass}>
      <div className="flex items-center justify-between gap-3">
        <h3 className={doctorSectionTitleClass}>Подробное описание</h3>
        <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={onEdit}>
          Редактировать
        </Button>
      </div>
      <ScaledPagePreview>
        {value ? (
          <StaticRichTextPreview value={value} />
        ) : (
          <p className="text-sm text-muted-foreground">Описание не заполнено.</p>
        )}
      </ScaledPagePreview>
    </section>
  );
}

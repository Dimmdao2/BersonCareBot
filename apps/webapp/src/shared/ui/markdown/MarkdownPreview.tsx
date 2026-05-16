"use client";

import { MarkdownBodyTree } from "@/shared/ui/markdown/markdownRenderTree";

type Props = {
  markdown: string;
  className?: string;
};

export function MarkdownPreview({ markdown, className }: Props) {
  return (
    <div className={className ?? "markdown-preview text-sm"}>
      <MarkdownBodyTree>{markdown.length > 0 ? markdown : "*Пусто*"}</MarkdownBodyTree>
    </div>
  );
}

"use client";

import DOMPurify from "isomorphic-dompurify";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import type { ContentBodyFormat } from "@/modules/content-catalog/types";

type Props = {
  text: string;
  bodyFormat: ContentBodyFormat;
  className?: string;
};

/**
 * Patient-facing content: Markdown from CMS (`body_md`) or sanitized legacy HTML from `body_html`.
 * Does not enable raw HTML inside Markdown (no `rehype-raw`).
 */
export function MarkdownContent({ text, bodyFormat, className }: Props) {
  const wrap = className ?? "markdown-preview";

  if (bodyFormat === "legacy-html") {
    const html = DOMPurify.sanitize(text, {
      USE_PROFILES: { html: true },
    });
    return (
      <div className={wrap} dangerouslySetInnerHTML={{ __html: html }} />
    );
  }

  return (
    <div className={wrap}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
        {text.length > 0 ? text : ""}
      </ReactMarkdown>
    </div>
  );
}

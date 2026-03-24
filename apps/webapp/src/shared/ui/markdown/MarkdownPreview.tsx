"use client";

import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";

type Props = {
  markdown: string;
  className?: string;
};

export function MarkdownPreview({ markdown, className }: Props) {
  return (
    <div className={className ?? "markdown-preview text-sm"}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
        {markdown.length > 0 ? markdown : "*Пусто*"}
      </ReactMarkdown>
    </div>
  );
}

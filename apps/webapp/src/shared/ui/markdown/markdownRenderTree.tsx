"use client";

import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import type { ReactNode } from "react";
import { MarkdownEmbeddedLink } from "./MarkdownEmbeddedLink";

const remarkPlugins = [remarkGfm];
const rehypePlugins = [rehypeSanitize];

const markdownComponents = {
  a: MarkdownEmbeddedLink,
};

type Props = {
  children: string;
};

/** Общие remark/rehype/components для пациентского Markdown и локального превью редактора. */
export function MarkdownBodyTree({ children }: Props): ReactNode {
  return (
    <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={markdownComponents}>
      {children}
    </ReactMarkdown>
  );
}

"use client";

import dynamic from "next/dynamic";
import type { MarkdownEditorToastUiInnerProps } from "./MarkdownEditorToastUiInner";

const MarkdownEditorToastUiClient = dynamic(
  () => import("./MarkdownEditorToastUiInner"),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-xl border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
        Загрузка редактора…
      </div>
    ),
  },
);

export type MarkdownEditorToastUiProps = MarkdownEditorToastUiInnerProps;

/** Toast UI Editor (markdown + vertical preview). Прежний вариант: `MarkdownEditor` (textarea + react-markdown). */
export function MarkdownEditorToastUi(props: MarkdownEditorToastUiProps) {
  return <MarkdownEditorToastUiClient {...props} />;
}

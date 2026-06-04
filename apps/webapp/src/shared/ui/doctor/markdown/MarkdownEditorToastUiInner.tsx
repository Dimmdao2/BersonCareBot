"use client";

import "@toast-ui/editor/dist/toastui-editor.css";
import { Editor } from "@toast-ui/react-editor";
import type { ReactNode } from "react";
import { useCallback, useRef, useState } from "react";
import { MediaLibraryInsertDialog } from "./MediaLibraryInsertDialog";
import type { MediaLibraryInsertPickMeta } from "./MediaLibraryInsertDialog";
import { markdownSnippetForMediaUrl } from "./markdownMediaSnippet";

const MAX_BODY_MD = 50_000;

export type MarkdownEditorToastUiInnerProps = {
  name: string;
  defaultValue?: string;
  maxLength?: number;
  /** Подпись над редактором: строка — стиль «caption»; `ReactNode` — без изменений. */
  label?: ReactNode;
  /** По умолчанию — краткая справка; `null` — не показывать. */
  helpText?: ReactNode | null;
  /** For live preview outside the editor (hidden `name` field does not emit `input`). */
  onValueChange?: (markdown: string) => void;
};

const DEFAULT_HELP_TEXT = (maxLen: number) => (
  <>
    До {maxLen.toLocaleString("ru-RU")} символов. Редактор Toast UI (Markdown + предпросмотр). Таблицы и GitHub Flavored
    Markdown поддерживаются панелью инструментов.
  </>
);

export default function MarkdownEditorToastUiInner({
  name,
  defaultValue = "",
  maxLength = MAX_BODY_MD,
  label = "Содержимое (Markdown)",
  helpText,
  onValueChange,
}: MarkdownEditorToastUiInnerProps) {
  const editorRef = useRef<Editor>(null);
  const [markdown, setMarkdown] = useState(defaultValue);

  const syncFromEditor = useCallback(() => {
    const inst = editorRef.current?.getInstance();
    if (!inst) return;
    let next = inst.getMarkdown();
    if (next.length > maxLength) {
      next = next.slice(0, maxLength);
      inst.setMarkdown(next);
    }
    setMarkdown(next);
    onValueChange?.(next);
  }, [maxLength, onValueChange]);

  const onLoad = useCallback(() => {
    syncFromEditor();
  }, [syncFromEditor]);

  const insertFromMedia = useCallback(
    (url: string, filename: string, meta?: MediaLibraryInsertPickMeta) => {
      const inst = editorRef.current?.getInstance();
      if (!inst) return;
      inst.insertText(markdownSnippetForMediaUrl(url, filename, meta));
      syncFromEditor();
    },
    [syncFromEditor],
  );

  const helpBlock =
    helpText === null ? null : helpText === undefined ? (
      <p className="m-0 text-sm text-muted-foreground">{DEFAULT_HELP_TEXT(maxLength)}</p>
    ) : (
      <div className="m-0 text-sm text-muted-foreground">{helpText}</div>
    );

  return (
    <div className="flex flex-col gap-3">
      <input type="hidden" name={name} value={markdown} readOnly />
      {typeof label === "string" ? (
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      ) : (
        label
      )}
      {helpBlock}
      <div className="flex flex-wrap gap-2" role="toolbar" aria-label="Вставка из медиабиблиотеки или с устройства">
        <MediaLibraryInsertDialog onInsert={insertFromMedia} />
      </div>
      <div className="toastui-editor-host overflow-hidden rounded-xl border border-border [&_.toastui-editor-defaultUI]:rounded-b-xl [&_.toastui-editor-defaultUI-toolbar]:rounded-t-xl">
        <Editor
          ref={editorRef}
          initialValue={defaultValue}
          initialEditType="markdown"
          previewStyle="vertical"
          height="420px"
          usageStatistics={false}
          hideModeSwitch
          useCommandShortcut
          onChange={syncFromEditor}
          onLoad={onLoad}
        />
      </div>
    </div>
  );
}

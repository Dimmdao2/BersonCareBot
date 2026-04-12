"use client";

import "@toast-ui/editor/dist/toastui-editor.css";
import { Editor } from "@toast-ui/react-editor";
import { useCallback, useRef, useState } from "react";
import { MediaLibraryInsertDialog } from "./MediaLibraryInsertDialog";

const MAX_BODY_MD = 50_000;

export type MarkdownEditorToastUiInnerProps = {
  name: string;
  defaultValue?: string;
  maxLength?: number;
  label?: string;
  /** For live preview outside the editor (hidden `name` field does not emit `input`). */
  onValueChange?: (markdown: string) => void;
};

export default function MarkdownEditorToastUiInner({
  name,
  defaultValue = "",
  maxLength = MAX_BODY_MD,
  label = "Содержимое (Markdown)",
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
    (url: string, filename: string) => {
      const inst = editorRef.current?.getInstance();
      if (!inst) return;
      const safeName = filename.replace(/[[\]]/g, "");
      const imageExt = /\.(jpe?g|png|gif|webp)$/i.test(filename);
      const snippet = imageExt ? `![${safeName}](${url})` : `[${safeName}](${url})`;
      inst.insertText(`${snippet}\n`);
      syncFromEditor();
    },
    [syncFromEditor],
  );

  return (
    <div className="flex flex-col gap-3">
      <input type="hidden" name={name} value={markdown} readOnly />
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      <p className="m-0 text-sm text-muted-foreground">
        До {maxLength.toLocaleString("ru-RU")} символов. Редактор Toast UI (Markdown + предпросмотр). Таблицы и
        GitHub Flavored Markdown поддерживаются панелью инструментов.
      </p>
      <div className="flex flex-wrap gap-2" role="toolbar" aria-label="Вставки из медиатеки">
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

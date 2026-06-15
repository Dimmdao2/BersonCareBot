"use client";

import { useCallback, useId, useRef, useState } from "react";
import { Button } from "@/shared/ui/doctor/primitives/button";
import { Textarea } from "@/shared/ui/doctor/primitives/textarea";
import { insertLinePrefix, insertSnippet, wrapSelection } from "./markdownInsert";
import { MediaLibraryInsertDialog } from "./MediaLibraryInsertDialog";
import type { MediaLibraryInsertPickMeta } from "./MediaLibraryInsertDialog";
import { markdownSnippetForMediaUrl } from "./markdownMediaSnippet";
import { MarkdownPreview } from "./MarkdownPreview";

const MAX_BODY_MD = 50_000;

type Props = {
  name: string;
  defaultValue?: string;
  maxLength?: number;
  label?: string;
  /** Controlled mode: current value. When provided together with onChange, internal state is bypassed. */
  value?: string;
  /** Controlled mode: called with the new value on every change. */
  onChange?: (value: string) => void;
};

export function MarkdownEditor({
  name,
  defaultValue = "",
  maxLength = MAX_BODY_MD,
  label = "Содержимое (Markdown)",
  value: controlledValue,
  onChange: controlledOnChange,
}: Props) {
  const id = useId();
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const [internalValue, setInternalValue] = useState(defaultValue);

  const isControlled = controlledValue !== undefined;
  const value = isControlled ? controlledValue : internalValue;

  const handleChange = (next: string) => {
    if (isControlled) {
      controlledOnChange?.(next);
    } else {
      setInternalValue(next);
    }
  };

  const apply = useCallback(
    (fn: (text: string, start: number, end: number) => { next: string; caret: number }) => {
      const el = taRef.current;
      if (!el) return;
      const text = el.value;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const { next, caret } = fn(text, start, end);
      if (next.length > maxLength) return;
      handleChange(next);
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(caret, caret);
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [maxLength, isControlled, controlledOnChange],
  );

  return (
    <div className="flex flex-col gap-3">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      <p className="m-0 text-sm text-muted-foreground">
        До {maxLength.toLocaleString("ru-RU")} символов. Поддерживается Markdown (заголовки, списки, ссылки,
        таблицы).
      </p>
      <div className="flex flex-wrap gap-2" role="toolbar" aria-label="Форматирование Markdown и вставка из медиабиблиотеки или с устройства">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            apply((t, s, e) => wrapSelection(t, s, e, "**"))
          }
        >
          Жирный
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            apply((t, s, e) => wrapSelection(t, s, e, "`"))
          }
        >
          Код
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            apply((t, s, e) => insertSnippet(t, s, e, "[текст](https://)"))
          }
        >
          Ссылка
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => apply((t, s) => insertLinePrefix(t, s, "- "))}
        >
          Список
        </Button>
        <MediaLibraryInsertDialog
          onInsert={(url, filename, meta?: MediaLibraryInsertPickMeta) => {
            apply((t, s, e) => insertSnippet(t, s, e, markdownSnippetForMediaUrl(url, filename, meta)));
          }}
        />
      </div>
      <div className="grid items-start gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-1" htmlFor={id}>
          <span className="sr-only">Редактор</span>
          <Textarea
            ref={taRef}
            id={id}
            name={name}
            className="min-h-[320px] font-mono text-sm"
            rows={14}
            value={value}
            maxLength={maxLength}
            onChange={(e) => handleChange(e.target.value.slice(0, maxLength))}
          />
        </label>
        <div className="flex flex-col gap-2 rounded border border-border p-3">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Предпросмотр</span>
          <MarkdownPreview markdown={value} />
        </div>
      </div>
    </div>
  );
}

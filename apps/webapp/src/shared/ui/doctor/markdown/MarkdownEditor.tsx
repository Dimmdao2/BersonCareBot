'use client';

import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { cn } from '@/lib/utils';
import { MediaLibraryInsertDialog } from './MediaLibraryInsertDialog';
import type { MediaLibraryInsertPickMeta } from './MediaLibraryInsertDialog';
import { markdownSnippetForMediaUrl } from './markdownMediaSnippet';
import { createMarkdownEditorExtensions } from './markdownEditorExtensions';

const MAX_BODY_MD = 50_000;

export type MarkdownEditorProps = {
  name: string;
  defaultValue?: string;
  maxLength?: number;
  label?: ReactNode;
  /** Default is the character limit; `null` hides the helper. */
  helpText?: ReactNode | null;
  /** Controlled mode: current Markdown value. */
  value?: string;
  /** Receives the serialized Markdown after every accepted edit. */
  onChange?: (value: string) => void;
  disabled?: boolean;
  /** Keeps the shared editor usable in compact dialogs without forking its implementation. */
  minHeight?: number;
};

type ToolbarButtonProps = {
  active?: boolean;
  disabled?: boolean;
  children: ReactNode;
  onClick: () => void;
};

function ToolbarButton({
  active = false,
  disabled = false,
  children,
  onClick,
}: ToolbarButtonProps) {
  return (
    <Button
      type="button"
      variant={active ? 'default' : 'outline'}
      size="sm"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function safeMediaLabel(filename: string): string {
  const safe = filename.replace(/[[\]]/g, '').trim();
  return safe || 'Файл';
}

export function MarkdownEditor({
  name,
  defaultValue = '',
  maxLength = MAX_BODY_MD,
  label = 'Содержимое',
  helpText,
  value: controlledValue,
  onChange,
  disabled = false,
  minHeight = 320,
}: MarkdownEditorProps) {
  const isControlled = controlledValue !== undefined;
  const initialMarkdown = isControlled ? controlledValue : defaultValue;
  const [markdown, setMarkdown] = useState(initialMarkdown);
  const [limitReached, setLimitReached] = useState(false);
  const lastAcceptedMarkdownRef = useRef(initialMarkdown);
  const applyingExternalValueRef = useRef(false);
  const extensions = useMemo(() => createMarkdownEditorExtensions(), []);

  const acceptMarkdown = useCallback(
    (next: string) => {
      lastAcceptedMarkdownRef.current = next;
      setMarkdown(next);
      setLimitReached(false);
      onChange?.(next);
    },
    [onChange],
  );

  const editor = useEditor({
    extensions,
    content: initialMarkdown,
    contentType: 'markdown',
    editable: !disabled,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        'aria-label': 'Редактор',
        class: cn(
          'max-w-none px-[18px] py-3 text-sm leading-relaxed outline-none',
          '[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2',
          '[&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3',
          '[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono',
          '[&_h1]:mb-2 [&_h1]:text-base [&_h1]:font-bold',
          '[&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold',
          '[&_h3]:mb-1.5 [&_h3]:text-sm [&_h3]:font-semibold',
          '[&_img]:my-3 [&_img]:max-h-80 [&_img]:max-w-full [&_img]:rounded-lg',
          '[&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6',
          '[&_p]:my-1.5',
          '[&_table]:my-3 [&_table]:w-full [&_table]:border-collapse',
          '[&_td]:border [&_td]:border-border [&_td]:p-2',
          '[&_th]:border [&_th]:border-border [&_th]:bg-muted/40 [&_th]:p-2 [&_th]:text-left',
          '[&_[data-type=taskList]]:list-none [&_[data-type=taskList]]:pl-0',
          '[&_[data-type=taskItem]]:flex [&_[data-type=taskItem]]:items-start [&_[data-type=taskItem]]:gap-2',
        ),
        style: `min-height: ${minHeight}px`,
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      if (applyingExternalValueRef.current) return;
      const next = currentEditor.getMarkdown();
      if (next === lastAcceptedMarkdownRef.current) return;
      const previousLength = lastAcceptedMarkdownRef.current.length;
      const isRecoveringFromOverLimit = previousLength > maxLength && next.length < previousLength;
      if (next.length > maxLength && !isRecoveringFromOverLimit) {
        setLimitReached(true);
        applyingExternalValueRef.current = true;
        currentEditor.commands.setContent(lastAcceptedMarkdownRef.current, {
          contentType: 'markdown',
          emitUpdate: false,
        });
        applyingExternalValueRef.current = false;
        return;
      }
      acceptMarkdown(next);
      setLimitReached(next.length > maxLength);
    },
  });

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [disabled, editor]);

  useEffect(() => {
    if (!editor || controlledValue === undefined) return;
    if (controlledValue === lastAcceptedMarkdownRef.current) return;
    applyingExternalValueRef.current = true;
    editor.commands.setContent(controlledValue, { contentType: 'markdown', emitUpdate: false });
    applyingExternalValueRef.current = false;
    lastAcceptedMarkdownRef.current = controlledValue;
    setMarkdown(controlledValue);
    setLimitReached(false);
  }, [controlledValue, editor]);

  const run = useCallback(
    (command: () => boolean) => {
      if (disabled) return;
      command();
    },
    [disabled],
  );

  const setLink = useCallback(() => {
    if (!editor || disabled) return;
    const previous = editor.getAttributes('link').href;
    const href = window.prompt(
      'Адрес ссылки',
      typeof previous === 'string' ? previous : 'https://',
    );
    if (href === null) return;
    if (href.trim() === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: href.trim() }).run();
  }, [disabled, editor]);

  const insertFromMedia = useCallback(
    (url: string, filename: string, meta?: MediaLibraryInsertPickMeta) => {
      if (!editor || disabled) return;
      const snippet = markdownSnippetForMediaUrl(url, safeMediaLabel(filename), meta);
      editor.chain().focus().insertContent(snippet, { contentType: 'markdown' }).run();
    },
    [disabled, editor],
  );

  const helper =
    helpText === null ? null : helpText === undefined ? (
      <p className="m-0 text-sm text-muted-foreground">
        До {maxLength.toLocaleString('ru-RU')} символов.
      </p>
    ) : (
      <div className="m-0 text-sm text-muted-foreground">{helpText}</div>
    );

  return (
    <div className="flex flex-col gap-3">
      <input type="hidden" name={name} value={markdown} readOnly />
      {typeof label === 'string' ? (
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
      ) : (
        label
      )}
      {helper}
      <div className="flex flex-wrap gap-2" role="toolbar" aria-label="Форматирование текста">
        <ToolbarButton
          active={editor?.isActive('bold')}
          disabled={!editor || disabled}
          onClick={() => run(() => editor?.chain().focus().toggleBold().run() ?? false)}
        >
          Жирный
        </ToolbarButton>
        <ToolbarButton
          active={editor?.isActive('italic')}
          disabled={!editor || disabled}
          onClick={() => run(() => editor?.chain().focus().toggleItalic().run() ?? false)}
        >
          Курсив
        </ToolbarButton>
        <ToolbarButton
          active={editor?.isActive('heading', { level: 2 })}
          disabled={!editor || disabled}
          onClick={() =>
            run(() => editor?.chain().focus().toggleHeading({ level: 2 }).run() ?? false)
          }
        >
          Заголовок
        </ToolbarButton>
        <ToolbarButton
          active={editor?.isActive('bulletList')}
          disabled={!editor || disabled}
          onClick={() => run(() => editor?.chain().focus().toggleBulletList().run() ?? false)}
        >
          Список
        </ToolbarButton>
        <ToolbarButton
          active={editor?.isActive('orderedList')}
          disabled={!editor || disabled}
          onClick={() => run(() => editor?.chain().focus().toggleOrderedList().run() ?? false)}
        >
          Нумерация
        </ToolbarButton>
        <ToolbarButton
          active={editor?.isActive('code')}
          disabled={!editor || disabled}
          onClick={() => run(() => editor?.chain().focus().toggleCode().run() ?? false)}
        >
          Код
        </ToolbarButton>
        <ToolbarButton
          active={editor?.isActive('link')}
          disabled={!editor || disabled}
          onClick={setLink}
        >
          Ссылка
        </ToolbarButton>
        <ToolbarButton
          disabled={!editor || disabled}
          onClick={() =>
            run(
              () =>
                editor
                  ?.chain()
                  .focus()
                  .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
                  .run() ?? false,
            )
          }
        >
          Таблица
        </ToolbarButton>
        <MediaLibraryInsertDialog onInsert={insertFromMedia} disabled={disabled || !editor} />
      </div>
      <div
        className={cn(
          'overflow-hidden rounded-xl border border-border bg-white',
          'focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/15',
          disabled && 'bg-muted/30 opacity-70',
        )}
      >
        <EditorContent editor={editor} />
      </div>
      {limitReached ? (
        <p className="m-0 text-sm text-destructive" role="alert">
          Достигнут предел {maxLength.toLocaleString('ru-RU')} символов.
        </p>
      ) : null}
    </div>
  );
}

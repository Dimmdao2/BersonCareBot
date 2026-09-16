'use client';

import type { Content, Editor } from '@tiptap/core';
import { EditorContent, EditorContext, useEditor } from '@tiptap/react';
import { Table2 } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRichTextEditorExtensions } from '@/shared/lib/richTextExtensions';
import {
  normalizeTiptapRichTextValue,
  parseTiptapRichText,
  plainTextToTiptapDocument,
  richTextCharacterCount,
  serializeTiptapRichText,
} from '@/shared/lib/richText';
import { cn } from '@/lib/utils';
import {
  MediaLibraryInsertDialog,
  type MediaLibraryInsertPickMeta,
} from '@/shared/ui/doctor/tiptap/MediaLibraryInsertDialog';
import { Button } from '@/shared/ui/doctor/tiptap/primitives/button';
import { Spacer } from '@/shared/ui/doctor/tiptap/primitives/spacer';
import {
  Toolbar,
  ToolbarGroup,
  ToolbarSeparator,
} from '@/shared/ui/doctor/tiptap/primitives/toolbar';
import { HeadingDropdownMenu } from '@/shared/ui/doctor/tiptap/ui/heading-dropdown-menu';
import { ListDropdownMenu } from '@/shared/ui/doctor/tiptap/ui/list-dropdown-menu';
import { BlockquoteButton } from '@/shared/ui/doctor/tiptap/ui/blockquote-button';
import {
  ColorHighlightPopover,
  ColorHighlightPopoverButton,
  ColorHighlightPopoverContent,
} from '@/shared/ui/doctor/tiptap/ui/color-highlight-popover';
import { LinkButton, LinkContent, LinkPopover } from '@/shared/ui/doctor/tiptap/ui/link-popover';
import { MarkButton } from '@/shared/ui/doctor/tiptap/ui/mark-button';
import { TextAlignButton } from '@/shared/ui/doctor/tiptap/ui/text-align-button';
import { UndoRedoButton } from '@/shared/ui/doctor/tiptap/ui/undo-redo-button';
import {
  SearchAndReplace,
  SearchAndReplaceButton,
} from '@/shared/ui/doctor/tiptap/ui/search-and-replace';
import { ArrowLeftIcon } from '@/shared/ui/doctor/tiptap/icons/arrow-left-icon';
import { HighlighterIcon } from '@/shared/ui/doctor/tiptap/icons/highlighter-icon';
import { LinkIcon } from '@/shared/ui/doctor/tiptap/icons/link-icon';
import { useIsBreakpoint } from '@/shared/ui/doctor/tiptap/hooks/use-is-breakpoint';
import './TiptapEditor.scss';

const DEFAULT_MAX_LENGTH = 50_000;
const SEARCH_AND_REPLACE_SCROLL_OPTIONS: ScrollIntoViewOptions = { block: 'center' };

export type TiptapEditorProps = {
  name: string;
  defaultValue?: string;
  maxLength?: number;
  label?: ReactNode;
  /** Default is the character limit; `null` hides the helper. */
  helpText?: ReactNode | null;
  value?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
  minHeight?: number;
};

function editorContent(value: string): Content {
  const document = parseTiptapRichText(value);
  return document ?? plainTextToTiptapDocument(value);
}

function setEditorContent(editor: Editor, value: string): void {
  editor.commands.setContent(editorContent(value), { emitUpdate: false });
}

function isImage(meta: MediaLibraryInsertPickMeta | undefined, filename: string): boolean {
  const mimeType = meta?.mimeType?.toLowerCase() ?? '';
  return (
    meta?.kind === 'image' ||
    mimeType.startsWith('image/') ||
    /\.(jpe?g|png|gif|webp|avif|heic|heif|tiff|tif|svg)$/i.test(filename)
  );
}

function isVideo(meta: MediaLibraryInsertPickMeta | undefined, filename: string): boolean {
  const mimeType = meta?.mimeType?.toLowerCase() ?? '';
  return (
    meta?.kind === 'video' ||
    mimeType.startsWith('video/') ||
    /\.(mp4|mov|webm|m4v)$/i.test(filename)
  );
}

function cleanMediaLabel(filename: string): string {
  return filename.replace(/[\[\]]/g, '').trim() || 'Файл';
}

function TableButton({ editor }: { editor: Editor | null }) {
  const canInsert = editor?.can().insertTable({ rows: 3, cols: 3, withHeaderRow: true }) ?? false;
  return (
    <Button
      type="button"
      variant="ghost"
      disabled={!canInsert}
      data-disabled={!canInsert}
      tooltip="Вставить таблицу"
      aria-label="Вставить таблицу"
      onClick={() =>
        editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
      }
    >
      <Table2 className="tiptap-button-icon" />
    </Button>
  );
}

type MainToolbarProps = {
  editor: Editor | null;
  isMobile: boolean;
  isSearchAndReplaceOpen: boolean;
  searchAndReplaceButtonRef: React.RefObject<HTMLButtonElement | null>;
  onHighlighterClick: () => void;
  onLinkClick: () => void;
  onSearchAndReplaceClick: () => void;
  onInsertMedia: (url: string, filename: string, meta?: MediaLibraryInsertPickMeta) => void;
};

function MainToolbarContent({
  editor,
  isMobile,
  isSearchAndReplaceOpen,
  searchAndReplaceButtonRef,
  onHighlighterClick,
  onLinkClick,
  onSearchAndReplaceClick,
  onInsertMedia,
}: MainToolbarProps) {
  return (
    <>
      <ToolbarGroup>
        <UndoRedoButton action="undo" />
        <UndoRedoButton action="redo" />
      </ToolbarGroup>
      <ToolbarSeparator />
      <ToolbarGroup>
        <HeadingDropdownMenu modal={false} levels={[1, 2, 3, 4]} />
        <ListDropdownMenu modal={false} types={['bulletList', 'orderedList', 'taskList']} />
        <BlockquoteButton />
      </ToolbarGroup>
      <ToolbarSeparator />
      <ToolbarGroup>
        <MarkButton type="bold" />
        <MarkButton type="italic" />
        <MarkButton type="strike" />
        <MarkButton type="underline" />
        {isMobile ? (
          <ColorHighlightPopoverButton onClick={onHighlighterClick} />
        ) : (
          <ColorHighlightPopover />
        )}
        {isMobile ? <LinkButton onClick={onLinkClick} /> : <LinkPopover />}
      </ToolbarGroup>
      <ToolbarSeparator />
      <ToolbarGroup>
        <TextAlignButton align="left" />
        <TextAlignButton align="center" />
        <TextAlignButton align="right" />
        <TextAlignButton align="justify" />
      </ToolbarGroup>
      <ToolbarSeparator />
      <ToolbarGroup>
        <TableButton editor={editor} />
        <MediaLibraryInsertDialog onInsert={onInsertMedia} disabled={!editor?.isEditable} />
      </ToolbarGroup>
      <Spacer />
      <ToolbarGroup>
        <SearchAndReplaceButton
          ref={searchAndReplaceButtonRef}
          aria-expanded={isSearchAndReplaceOpen}
          data-active-state={isSearchAndReplaceOpen ? 'on' : 'off'}
          onClick={onSearchAndReplaceClick}
        />
      </ToolbarGroup>
    </>
  );
}

function MobileToolbarContent({
  type,
  onBack,
}: {
  type: 'highlighter' | 'link';
  onBack: () => void;
}) {
  return (
    <>
      <ToolbarGroup>
        <Button variant="ghost" onClick={onBack} aria-label="Назад">
          <ArrowLeftIcon className="tiptap-button-icon" />
          {type === 'highlighter' ? (
            <HighlighterIcon className="tiptap-button-icon" />
          ) : (
            <LinkIcon className="tiptap-button-icon" />
          )}
        </Button>
      </ToolbarGroup>
      <ToolbarSeparator />
      {type === 'highlighter' ? <ColorHighlightPopoverContent /> : <LinkContent />}
    </>
  );
}

export function TiptapEditor({
  name,
  defaultValue = '',
  maxLength = DEFAULT_MAX_LENGTH,
  label = 'Содержимое',
  helpText,
  value: controlledValue,
  onChange,
  disabled = false,
  minHeight = 320,
}: TiptapEditorProps) {
  const initialValue = normalizeTiptapRichTextValue(controlledValue ?? defaultValue);
  const initialContent = useMemo(() => editorContent(initialValue), [initialValue]);
  const extensions = useMemo(() => createRichTextEditorExtensions(), []);
  const [storedValue, setStoredValue] = useState(initialValue);
  const [limitReached, setLimitReached] = useState(false);
  const [mobileView, setMobileView] = useState<'main' | 'highlighter' | 'link'>('main');
  const [isSearchAndReplaceOpen, setIsSearchAndReplaceOpen] = useState(false);
  const lastAcceptedValueRef = useRef(initialValue);
  const applyingExternalValueRef = useRef(false);
  const searchAndReplaceButtonRef = useRef<HTMLButtonElement>(null);
  const isMobile = useIsBreakpoint();

  const acceptValue = useCallback(
    (next: string) => {
      lastAcceptedValueRef.current = next;
      setStoredValue(next);
      setLimitReached(false);
      onChange?.(next);
    },
    [onChange],
  );

  const editor = useEditor({
    extensions,
    content: initialContent,
    editable: !disabled,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        autocomplete: 'off',
        autocorrect: 'off',
        autocapitalize: 'off',
        'aria-label': 'Редактор текста',
        class: 'tiptap-editor-content',
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      if (applyingExternalValueRef.current) return;
      const next = serializeTiptapRichText(currentEditor.getJSON());
      const nextLength = currentEditor.getText({ blockSeparator: '\n' }).length;
      const previousLength = richTextCharacterCount(lastAcceptedValueRef.current);
      const isRecoveringFromOverLimit = previousLength > maxLength && nextLength < previousLength;
      if (nextLength > maxLength && !isRecoveringFromOverLimit) {
        setLimitReached(true);
        applyingExternalValueRef.current = true;
        setEditorContent(currentEditor, lastAcceptedValueRef.current);
        applyingExternalValueRef.current = false;
        return;
      }
      acceptValue(next);
      setLimitReached(nextLength > maxLength);
    },
  });

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [disabled, editor]);

  useEffect(() => {
    if (controlledValue === undefined) return;
    const normalizedValue = normalizeTiptapRichTextValue(controlledValue);
    if (normalizedValue !== controlledValue) onChange?.(normalizedValue);
  }, [controlledValue, onChange]);

  useEffect(() => {
    if (!editor || controlledValue === undefined) return;
    const normalizedValue = normalizeTiptapRichTextValue(controlledValue);
    if (normalizedValue === lastAcceptedValueRef.current) return;
    applyingExternalValueRef.current = true;
    setEditorContent(editor, normalizedValue);
    applyingExternalValueRef.current = false;
    lastAcceptedValueRef.current = normalizedValue;
    setStoredValue(normalizedValue);
    setLimitReached(richTextCharacterCount(normalizedValue) > maxLength);
  }, [controlledValue, editor, maxLength]);

  useEffect(() => {
    if (!isMobile && mobileView !== 'main') setMobileView('main');
  }, [isMobile, mobileView]);

  const closeSearchAndReplace = useCallback(() => {
    setIsSearchAndReplaceOpen(false);
    searchAndReplaceButtonRef.current?.focus();
  }, []);

  const openSearchAndReplace = useCallback(() => {
    setMobileView('main');
    setIsSearchAndReplaceOpen(true);
  }, []);

  const toggleSearchAndReplace = useCallback(() => {
    if (isSearchAndReplaceOpen) closeSearchAndReplace();
    else openSearchAndReplace();
  }, [closeSearchAndReplace, isSearchAndReplaceOpen, openSearchAndReplace]);

  const insertMedia = useCallback(
    (url: string, filename: string, meta?: MediaLibraryInsertPickMeta) => {
      if (!editor?.isEditable) return;
      const labelText = cleanMediaLabel(filename);
      if (isImage(meta, filename)) {
        editor.chain().focus().setImage({ src: url, alt: labelText, title: labelText }).run();
        return;
      }
      if (isVideo(meta, filename)) {
        editor
          .chain()
          .focus()
          .insertContent({ type: 'video', attrs: { src: url, title: labelText } })
          .run();
        return;
      }
      editor
        .chain()
        .focus()
        .insertContent({
          type: 'text',
          text: labelText,
          marks: [{ type: 'link', attrs: { href: url } }],
        })
        .insertContent(' ')
        .run();
    },
    [editor],
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
      <input type="hidden" name={name} value={storedValue} readOnly />
      {typeof label === 'string' ? (
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
      ) : (
        label
      )}
      {helper}
      <div
        className={cn('tiptap-editor-wrapper', disabled && 'tiptap-editor-disabled')}
        style={{ '--tiptap-editor-min-height': `${minHeight}px` } as CSSProperties}
      >
        <EditorContext.Provider value={{ editor }}>
          <Toolbar>
            {mobileView === 'main' ? (
              <MainToolbarContent
                editor={editor}
                isMobile={isMobile}
                isSearchAndReplaceOpen={isSearchAndReplaceOpen}
                searchAndReplaceButtonRef={searchAndReplaceButtonRef}
                onHighlighterClick={() => setMobileView('highlighter')}
                onLinkClick={() => setMobileView('link')}
                onSearchAndReplaceClick={toggleSearchAndReplace}
                onInsertMedia={insertMedia}
              />
            ) : (
              <MobileToolbarContent
                type={mobileView === 'highlighter' ? 'highlighter' : 'link'}
                onBack={() => setMobileView('main')}
              />
            )}
          </Toolbar>
          <SearchAndReplace
            className="tiptap-editor-search-and-replace"
            open={isSearchAndReplaceOpen}
            onOpen={openSearchAndReplace}
            onClose={closeSearchAndReplace}
            scrollIntoViewOptions={SEARCH_AND_REPLACE_SCROLL_OPTIONS}
          />
          <EditorContent editor={editor} className="tiptap-editor-surface" />
        </EditorContext.Provider>
      </div>
      {limitReached ? (
        <p className="m-0 text-sm text-destructive" role="alert">
          Достигнут предел {maxLength.toLocaleString('ru-RU')} символов.
        </p>
      ) : null}
    </div>
  );
}

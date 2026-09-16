import Image from '@tiptap/extension-image';
import { FindAndReplace } from '@tiptap/extension-find-and-replace';
import Highlight from '@tiptap/extension-highlight';
import HorizontalRule from '@tiptap/extension-horizontal-rule';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import TextAlign from '@tiptap/extension-text-align';
import { TableKit } from '@tiptap/extension-table';
import Typography from '@tiptap/extension-typography';
import StarterKit from '@tiptap/starter-kit';
import { Selection } from '@tiptap/extensions';

export function createRichTextSchemaExtensions() {
  return [
    StarterKit.configure({
      horizontalRule: false,
      link: {
        openOnClick: false,
        enableClickSelection: true,
      },
    }),
    HorizontalRule,
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Highlight.configure({ multicolor: true }),
    Image.configure({ allowBase64: false, inline: false }),
    Typography,
    Superscript,
    Subscript,
    TableKit.configure({ table: { resizable: true } }),
  ];
}

export function createRichTextEditorExtensions() {
  return [
    ...createRichTextSchemaExtensions(),
    Selection,
    FindAndReplace.configure({
      searchDebounceMs: 500,
      injectCSS: false,
    }),
  ];
}

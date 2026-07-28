import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import { TableKit } from '@tiptap/extension-table';
import TaskItem from '@tiptap/extension-task-item';
import TaskList from '@tiptap/extension-task-list';
import { Markdown } from '@tiptap/markdown';
import StarterKit from '@tiptap/starter-kit';

/** One canonical Tiptap schema for every doctor-facing Markdown write surface. */
export function createMarkdownEditorExtensions() {
  return [
    StarterKit.configure({
      link: false,
    }),
    Link.configure({
      autolink: true,
      defaultProtocol: 'https',
      openOnClick: false,
    }),
    Image.configure({
      allowBase64: false,
      inline: false,
    }),
    TableKit.configure({
      table: { resizable: false },
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Markdown.configure({
      markedOptions: { gfm: true },
    }),
  ];
}

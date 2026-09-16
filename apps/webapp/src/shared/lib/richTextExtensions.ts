import { mergeAttributes, Node as TiptapNode } from '@tiptap/core';
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
import { mediaPreviewMdUrl } from '@/shared/lib/mediaPreviewUrls';

const RichTextImage = Image.extend({
  renderHTML({ HTMLAttributes }) {
    const storedSrc = typeof HTMLAttributes.src === 'string' ? HTMLAttributes.src : '';
    const displaySrc = mediaPreviewMdUrl(storedSrc) ?? storedSrc;
    return [
      'img',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, { src: displaySrc }),
    ];
  },
});

const RichTextVideo = TiptapNode.create({
  name: 'video',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,
  addAttributes() {
    return {
      src: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-src'),
      },
      title: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-title'),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'figure[data-rich-text-video]' }];
  },
  renderHTML({ HTMLAttributes }) {
    const storedSrc = typeof HTMLAttributes.src === 'string' ? HTMLAttributes.src : '';
    const title = typeof HTMLAttributes.title === 'string' ? HTMLAttributes.title : 'Видео';
    const poster = mediaPreviewMdUrl(storedSrc);
    return [
      'figure',
      {
        'data-rich-text-video': '',
        'data-src': storedSrc,
        'data-title': title,
        contenteditable: 'false',
      },
      poster
        ? ['img', { src: poster, alt: title, draggable: 'false' }]
        : ['span', { 'data-rich-text-video-label': '' }, title],
    ];
  },
});

const RichTextFileAttachment = TiptapNode.create({
  name: 'fileAttachment',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,
  addAttributes() {
    return {
      src: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-src'),
      },
      title: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-title'),
      },
      mimeType: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-mime-type'),
      },
    };
  },
  parseHTML() {
    return [{ tag: '[data-rich-text-file]' }];
  },
  renderHTML({ HTMLAttributes }) {
    const storedSrc = typeof HTMLAttributes.src === 'string' ? HTMLAttributes.src : '';
    const title = typeof HTMLAttributes.title === 'string' ? HTMLAttributes.title : 'Файл';
    const mimeType = typeof HTMLAttributes.mimeType === 'string' ? HTMLAttributes.mimeType : '';
    return [
      'div',
      {
        'data-rich-text-file': '',
        'data-src': storedSrc,
        'data-title': title,
        'data-mime-type': mimeType,
        contenteditable: 'false',
      },
      ['span', { 'data-rich-text-file-icon': '', 'aria-hidden': 'true' }],
      ['span', { 'data-rich-text-file-title': '' }, title],
    ];
  },
});

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
    RichTextImage.configure({ allowBase64: false, inline: false }),
    RichTextVideo,
    RichTextFileAttachment,
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

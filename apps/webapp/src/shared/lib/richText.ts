import type { JSONContent } from '@tiptap/core';
import { escapeHtml } from '@/shared/lib/escapeHtml';

export const TIPTAP_JSON_PREFIX = 'tiptap-json:v1:';
export const RICH_TEXT_SERIALIZED_MAX_LENGTH = 1_000_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isJsonContent(value: unknown): value is JSONContent {
  if (!isRecord(value) || typeof value.type !== 'string') return false;
  if (value.text !== undefined && typeof value.text !== 'string') return false;
  if (value.content !== undefined) {
    if (!Array.isArray(value.content) || !value.content.every(isJsonContent)) return false;
  }
  if (value.marks !== undefined) {
    if (
      !Array.isArray(value.marks) ||
      !value.marks.every((mark) => isRecord(mark) && typeof mark.type === 'string')
    ) {
      return false;
    }
  }
  return true;
}

export function isTiptapRichText(value: string): boolean {
  return value.startsWith(TIPTAP_JSON_PREFIX);
}

export function parseTiptapRichText(value: string): JSONContent | null {
  if (!isTiptapRichText(value)) return null;
  try {
    const parsed: unknown = JSON.parse(value.slice(TIPTAP_JSON_PREFIX.length));
    return isJsonContent(parsed) && parsed.type === 'doc' ? parsed : null;
  } catch {
    return null;
  }
}

export function plainTextToTiptapDocument(value: string): JSONContent {
  return {
    type: 'doc',
    content: value.split('\n').map((line) => ({
      type: 'paragraph',
      ...(line.length > 0 ? { content: [{ type: 'text', text: line }] } : {}),
    })),
  };
}

function hasDocumentContent(node: JSONContent): boolean {
  if (typeof node.text === 'string' && node.text.length > 0) return true;
  if (node.type === 'image' || node.type === 'video' || node.type === 'fileAttachment') return true;
  return node.content?.some(hasDocumentContent) ?? false;
}

export function serializeTiptapRichText(document: JSONContent): string {
  return hasDocumentContent(document) ? `${TIPTAP_JSON_PREFIX}${JSON.stringify(document)}` : '';
}

/**
 * Every editor write uses the canonical versioned JSON representation. A pre-migration raw value
 * is preserved as literal text, never interpreted as Markdown.
 */
export function normalizeTiptapRichTextValue(value: string): string {
  const document = parseTiptapRichText(value);
  return document
    ? serializeTiptapRichText(document)
    : serializeTiptapRichText(plainTextToTiptapDocument(value));
}

export function isTiptapRichTextStorageValue(value: string): boolean {
  return value.length === 0 || parseTiptapRichText(value) !== null;
}

const BLOCK_NODE_TYPES = new Set([
  'paragraph',
  'heading',
  'blockquote',
  'codeBlock',
  'listItem',
  'taskItem',
  'tableRow',
]);

function nodePlainText(node: JSONContent): string {
  if (node.type === 'text') return node.text ?? '';
  if (node.type === 'hardBreak') return '\n';
  if (node.type === 'horizontalRule') return '\n—\n';
  if (node.type === 'image') {
    const attrs = node.attrs as Record<string, unknown> | undefined;
    return typeof attrs?.alt === 'string' ? attrs.alt : '';
  }
  if (node.type === 'video') {
    const attrs = node.attrs as Record<string, unknown> | undefined;
    return typeof attrs?.title === 'string' ? attrs.title : 'Видео';
  }
  if (node.type === 'fileAttachment') {
    const attrs = node.attrs as Record<string, unknown> | undefined;
    return typeof attrs?.title === 'string' ? attrs.title : 'Файл';
  }

  const text = node.content?.map(nodePlainText).join('') ?? '';
  return BLOCK_NODE_TYPES.has(node.type ?? '') ? `${text}\n` : text;
}

function normalizePlainText(value: string): string {
  return value.replace(/\n{3,}/g, '\n\n').trim();
}

/** Plain text used for limits and channels that cannot carry rich formatting. */
export function richTextToPlainText(value: string): string {
  const document = parseTiptapRichText(value);
  if (!document) return value;
  return normalizePlainText(nodePlainText(document));
}

export function richTextCharacterCount(value: string): number {
  return richTextToPlainText(value).length;
}

export function richTextWithinCharacterLimit(value: string, maxLength: number): boolean {
  return isTiptapRichTextStorageValue(value) && richTextCharacterCount(value) <= maxLength;
}

export function safeRichTextUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const url = value.trim();
  if (url.startsWith('/') || url.startsWith('#')) return url;
  try {
    const parsed = new URL(url);
    return ['http:', 'https:', 'mailto:', 'tel:'].includes(parsed.protocol) ? url : null;
  } catch {
    return null;
  }
}

function markedMessengerText(node: JSONContent): string {
  let value = escapeHtml(node.text ?? '');
  for (const mark of node.marks ?? []) {
    const attrs = mark.attrs as Record<string, unknown> | undefined;
    if (mark.type === 'bold') value = `<b>${value}</b>`;
    else if (mark.type === 'italic') value = `<i>${value}</i>`;
    else if (mark.type === 'strike') value = `<s>${value}</s>`;
    else if (mark.type === 'underline') value = `<u>${value}</u>`;
    else if (mark.type === 'code') value = `<code>${value}</code>`;
    else if (mark.type === 'link') {
      const href = safeRichTextUrl(attrs?.href);
      if (href) value = `<a href="${escapeHtml(href)}">${value}</a>`;
    }
  }
  return value;
}

function nodeMessengerHtml(node: JSONContent): string {
  if (node.type === 'text') return markedMessengerText(node);
  if (node.type === 'hardBreak') return '\n';
  if (node.type === 'horizontalRule') return '\n———\n';
  if (node.type === 'image') {
    const attrs = node.attrs as Record<string, unknown> | undefined;
    const src = safeRichTextUrl(attrs?.src);
    const alt = typeof attrs?.alt === 'string' ? attrs.alt : 'Изображение';
    return src ? `<a href="${escapeHtml(src)}">${escapeHtml(alt)}</a>` : escapeHtml(alt);
  }
  if (node.type === 'video') {
    const attrs = node.attrs as Record<string, unknown> | undefined;
    const src = safeRichTextUrl(attrs?.src);
    const title = typeof attrs?.title === 'string' ? attrs.title : 'Видео';
    return src ? `<a href="${escapeHtml(src)}">${escapeHtml(title)}</a>` : escapeHtml(title);
  }
  if (node.type === 'fileAttachment') {
    const attrs = node.attrs as Record<string, unknown> | undefined;
    const src = safeRichTextUrl(attrs?.src);
    const title = typeof attrs?.title === 'string' ? attrs.title : 'Файл';
    return src ? `<a href="${escapeHtml(src)}">${escapeHtml(title)}</a>` : escapeHtml(title);
  }

  const children = node.content?.map(nodeMessengerHtml).join('') ?? '';
  if (node.type === 'heading') return `<b>${children}</b>\n`;
  if (node.type === 'paragraph') return `${children}\n`;
  if (node.type === 'blockquote') return `<blockquote>${children.trim()}</blockquote>\n`;
  if (node.type === 'codeBlock') return `<pre>${children}</pre>\n`;
  if (node.type === 'listItem') return `• ${children.trim()}\n`;
  if (node.type === 'taskItem') {
    const attrs = node.attrs as Record<string, unknown> | undefined;
    return `${attrs?.checked === true ? '☑' : '☐'} ${children.trim()}\n`;
  }
  return children;
}

export function richTextToMessengerHtml(value: string): string | null {
  const document = parseTiptapRichText(value);
  return document
    ? nodeMessengerHtml(document)
        .replace(/\n{3,}/g, '\n\n')
        .trim()
    : null;
}

function mapTextNodes(node: JSONContent, transform: (value: string) => string): JSONContent {
  return {
    ...node,
    ...(typeof node.text === 'string' ? { text: transform(node.text) } : {}),
    ...(node.content
      ? { content: node.content.map((child) => mapTextNodes(child, transform)) }
      : {}),
  };
}

/** Applies template substitutions to text nodes without corrupting the serialized document. */
export function mapRichTextText(value: string, transform: (text: string) => string): string {
  const document = parseTiptapRichText(value);
  return document ? serializeTiptapRichText(mapTextNodes(document, transform)) : value;
}

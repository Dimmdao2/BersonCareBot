import { describe, expect, it } from 'vitest';
import type { JSONContent } from '@tiptap/core';
import {
  TIPTAP_JSON_PREFIX,
  isTiptapRichTextStorageValue,
  mapRichTextText,
  normalizeTiptapRichTextValue,
  parseTiptapRichText,
  richTextCharacterCount,
  richTextToMessengerHtml,
  richTextToPlainText,
  richTextWithinCharacterLimit,
  serializeTiptapRichText,
} from './richText';

const document: JSONContent = {
  type: 'doc',
  content: [
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: 'Привет, {name}', marks: [{ type: 'bold' }] }],
    },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Открыть ', marks: [] },
        {
          type: 'text',
          text: 'сайт',
          marks: [{ type: 'link', attrs: { href: 'https://example.test' } }],
        },
      ],
    },
  ],
};

/**
 * Ловимая поломка: сериализованный JSON уходит пациенту как текст либо ломается при подстановке
 * переменной. Это молчаливый дефект рассылки и публичных материалов, поэтому проверяем именно
 * наблюдаемые выходы каналов, а не строки реализации.
 */
describe('richText', () => {
  it('хранит и читает versioned Tiptap JSON без markdown-roundtrip', () => {
    const value = serializeTiptapRichText(document);

    expect(value.startsWith(TIPTAP_JSON_PREFIX)).toBe(true);
    expect(parseTiptapRichText(value)).toEqual(document);
    expect(richTextToPlainText(value)).toBe('Привет, {name}\nОткрыть сайт');
    expect(richTextCharacterCount(value)).toBe('Привет, {name}\nОткрыть сайт'.length);
  });

  it('подставляет переменные только в текстовые узлы, не повреждая ссылку и структуру документа', () => {
    const value = serializeTiptapRichText(document);
    const rendered = mapRichTextText(value, (text) => text.replace('{name}', 'Анна'));

    expect(richTextToPlainText(rendered)).toBe('Привет, Анна\nОткрыть сайт');
    expect(parseTiptapRichText(rendered)?.content?.[1]?.content?.[1]?.marks?.[0]?.attrs?.href).toBe(
      'https://example.test',
    );
  });

  it('преобразует документ в допустимое форматирование мессенджера, а не отправляет JSON', () => {
    const html = richTextToMessengerHtml(serializeTiptapRichText(document));

    expect(html).toBe(
      '<b><b>Привет, {name}</b></b>\nОткрыть <a href="https://example.test">сайт</a>',
    );
    expect(html).not.toContain(TIPTAP_JSON_PREFIX);
  });

  it('не интерпретирует старую строку как Markdown и нормализует её в Tiptap JSON', () => {
    const value = normalizeTiptapRichTextValue('**Старый текст**');

    expect(isTiptapRichTextStorageValue('**Старый текст**')).toBe(false);
    expect(richTextWithinCharacterLimit('**Старый текст**', 100)).toBe(false);
    expect(isTiptapRichTextStorageValue(value)).toBe(true);
    expect(richTextToPlainText(value)).toBe('**Старый текст**');
  });
});

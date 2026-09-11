'use client';

import ReactMarkdown, { type Components } from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import type { ReactNode } from 'react';

/**
 * ЕДИНСТВЕННОЕ дерево рендера Markdown в приложении.
 *
 * До 11.09 его копий было три: пациентская, докторская (побайтно одинаковые) и публичная карточка
 * клиники. Копировали не от лени — у зон разные плееры, а у публичной страницы вообще другой
 * источник прав на медиа (анониму сессионная дверь недоступна). Разница между копиями всегда
 * сводилась к ОДНОМУ: какие компоненты подставить. Поэтому дерево одно, а зона передаёт свою карту
 * компонентов параметром — изоляция зон (§17) держится параметром, а не копипастой.
 *
 * Набор плагинов общий и менять его в одной зоне нельзя: `remarkGfm` + `rehypeSanitize`, без
 * `rehype-raw`. Сырой HTML внутри Markdown не включается нигде и никогда.
 */
const remarkPlugins = [remarkGfm];
const rehypePlugins = [rehypeSanitize];

type Props = {
  children: string;
  /** Карта компонентов зоны: чем рисовать ссылку, картинку, заголовки. */
  components?: Components;
};

export function MarkdownBodyTree({ children, components }: Props): ReactNode {
  return (
    <ReactMarkdown
      remarkPlugins={remarkPlugins}
      rehypePlugins={rehypePlugins}
      components={components}
    >
      {children}
    </ReactMarkdown>
  );
}

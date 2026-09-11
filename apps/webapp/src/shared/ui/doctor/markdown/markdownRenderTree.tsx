'use client';

import type { ReactNode } from 'react';
import { MarkdownBodyTree as SharedMarkdownBodyTree } from '@/shared/ui/markdown/markdownRenderTree';
import { MarkdownEmbeddedLink } from './MarkdownEmbeddedLink';

const components = { a: MarkdownEmbeddedLink };

/** Привязка общего дерева к зоне: дерево одно, ссылка зоны своя (§17). */
export function MarkdownBodyTree({ children }: { children: string }): ReactNode {
  return <SharedMarkdownBodyTree components={components}>{children}</SharedMarkdownBodyTree>;
}

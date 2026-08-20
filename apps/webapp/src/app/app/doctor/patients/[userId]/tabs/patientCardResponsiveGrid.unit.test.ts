import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * PatientTabOverview and PatientTabAccount used to force a permanent 50/50 two-column grid via
 * `style={{ gridTemplateColumns: '1fr 1fr' }}`, which cannot fit a 320px viewport after outer and
 * inner padding and leaves a visible fragment of the right column on a phone. The fix replaces the
 * inline style with a Tailwind breakpoint (`grid-cols-1 md:grid-cols-2`), which jsdom cannot verify
 * via a real layout render (no media queries), so this checks the actual JSX parse tree instead of
 * grepping the file text.
 *
 * Named failure this pins: reintroducing `style={{ gridTemplateColumns: '1fr 1fr' }}` (or an
 * equivalent inline style that forces two columns regardless of viewport) on either file's top-level
 * grid container must fail this test.
 */

function findRootGridDiv(path: string): ts.JsxElement | ts.JsxSelfClosingElement | undefined {
  const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
  let found: ts.JsxElement | ts.JsxSelfClosingElement | undefined;

  function attrText(
    node: ts.JsxElement | ts.JsxSelfClosingElement,
    name: string,
  ): string | undefined {
    const opening = ts.isJsxElement(node) ? node.openingElement : node;
    for (const attr of opening.attributes.properties) {
      if (!ts.isJsxAttribute(attr) || attr.name.getText(source) !== name) continue;
      return attr.initializer ? attr.initializer.getText(source) : undefined;
    }
    return undefined;
  }

  function visit(node: ts.Node) {
    if (!found && (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node))) {
      const className = attrText(node, 'className');
      if (className?.includes('grid') && !className.includes('grid-cols-7')) {
        found = node;
        return;
      }
    }
    if (!found) ts.forEachChild(node, visit);
  }

  visit(source);
  return found;
}

const FILES = [
  {
    label: 'PatientTabOverview',
    path: fileURLToPath(new URL('./PatientTabOverview.tsx', import.meta.url)),
  },
  {
    label: 'PatientTabAccount',
    path: fileURLToPath(new URL('./PatientTabAccount.tsx', import.meta.url)),
  },
];

describe('patient card tabs — mobile width does not regress to a forced two-column grid', () => {
  for (const file of FILES) {
    it(`${file.label}: top grid container uses a responsive breakpoint, not a fixed inline style`, () => {
      const node = findRootGridDiv(file.path);
      expect(node, `${file.label}: no top-level grid container found`).toBeDefined();

      const source = ts.createSourceFile(
        file.path,
        readFileSync(file.path, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
      );
      const opening = ts.isJsxElement(node!) ? node!.openingElement : node!;
      let className = '';
      let styleText: string | undefined;
      for (const attr of opening.attributes.properties) {
        if (!ts.isJsxAttribute(attr)) continue;
        const attrName = attr.name.getText(source);
        if (attrName === 'className' && attr.initializer) {
          className = attr.initializer.getText(source);
        }
        if (attrName === 'style' && attr.initializer) {
          styleText = attr.initializer.getText(source);
        }
      }

      // Single column below the breakpoint, two columns from `md:` up — no JS viewport fork.
      expect(className).toContain('grid-cols-1');
      expect(className).toContain('md:grid-cols-2');
      // The old fixed 50/50 split must be gone — it cannot fit a 320px viewport.
      expect(styleText ?? '').not.toContain('gridTemplateColumns');
    });
  }
});

import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { getContentBundle, loadContentRegistry } from './index.js';

describe('contentRegistry', () => {
  it('loads scripts.json and templates.json per source folder', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'content-registry-'));
    const src = path.join(root, 'source-a');
    await mkdir(src, { recursive: true });
    await writeFile(
      path.join(src, 'scripts.json'),
      JSON.stringify([
        {
          id: 'tg_start',
          source: 'source-a',
          event: 'message.received',
          steps: [{ action: 'message.compose', mode: 'sync', params: { templateId: 'welcome' } }],
        },
      ]),
      'utf8',
    );
    await writeFile(
      path.join(src, 'templates.json'),
      JSON.stringify({ welcome: { text: 'hello' } }),
      'utf8',
    );

    const registry = await loadContentRegistry({ rootDir: root });
    const bundle = getContentBundle(registry, 'source-a');

    expect(bundle).not.toBeNull();
    expect(bundle?.scripts.length).toBe(1);
    expect(Object.keys(bundle?.templates ?? {})).toContain('welcome');
  });

  it('throws on invalid scripts.json schema', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'content-registry-invalid-'));
    const bad = path.join(root, 'source-b');
    await mkdir(bad, { recursive: true });
    await writeFile(path.join(bad, 'scripts.json'), JSON.stringify([{ bad: true }]), 'utf8');

    await expect(loadContentRegistry({ rootDir: root })).rejects.toThrow();
  });
});

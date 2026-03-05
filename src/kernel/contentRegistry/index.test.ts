import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { getContentBundle, loadContentRegistry } from './index.js';

describe('contentRegistry', () => {
  it('loads scripts.json and templates.json per source folder', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'content-registry-'));
    const tg = path.join(root, 'telegram');
    await mkdir(tg, { recursive: true });
    await writeFile(
      path.join(tg, 'scripts.json'),
      JSON.stringify([
        {
          id: 'tg_start',
          source: 'telegram',
          event: 'message.received',
          steps: [{ action: 'message.compose', mode: 'sync', params: { templateId: 'welcome' } }],
        },
      ]),
      'utf8',
    );
    await writeFile(
      path.join(tg, 'templates.json'),
      JSON.stringify({ welcome: { text: 'hello' } }),
      'utf8',
    );

    const registry = await loadContentRegistry({ rootDir: root });
    const bundle = getContentBundle(registry, 'telegram');

    expect(bundle).not.toBeNull();
    expect(bundle?.scripts.length).toBe(1);
    expect(Object.keys(bundle?.templates ?? {})).toContain('welcome');
  });

  it('throws on invalid scripts.json schema', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'content-registry-invalid-'));
    const rt = path.join(root, 'rubitime');
    await mkdir(rt, { recursive: true });
    await writeFile(path.join(rt, 'scripts.json'), JSON.stringify([{ bad: true }]), 'utf8');

    await expect(loadContentRegistry({ rootDir: root })).rejects.toThrow();
  });
});

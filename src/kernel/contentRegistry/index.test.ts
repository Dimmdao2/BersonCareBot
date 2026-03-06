import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { getContentBundle, loadContentRegistry } from './index.js';

describe('contentRegistry', () => {
  it('loads rubitime and telegram bundles from workspace content root', async () => {
    const root = path.resolve(process.cwd(), 'src/content');
    const registry = await loadContentRegistry({ rootDir: root });

    expect(getContentBundle(registry, 'rubitime')).not.toBeNull();
    expect(getContentBundle(registry, 'telegram')).not.toBeNull();
  });

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
    await writeFile(
      path.join(src, 'routes.json'),
      JSON.stringify([
        {
          id: 'route-1',
          match: { source: 'source-a', eventType: 'message.received' },
          scriptId: 'source-a:tg_start',
        },
      ]),
      'utf8',
    );

    const registry = await loadContentRegistry({ rootDir: root });
    const bundle = getContentBundle(registry, 'source-a');

    expect(bundle).not.toBeNull();
    expect(bundle?.scripts.length).toBe(1);
    expect(Object.keys(bundle?.templates ?? {})).toContain('welcome');
    expect(bundle?.routes).toHaveLength(1);
  });

  it('returns empty routes when routes.json is missing', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'content-registry-no-routes-'));
    const src = path.join(root, 'source-no-routes');
    await mkdir(src, { recursive: true });
    await writeFile(path.join(src, 'scripts.json'), JSON.stringify([]), 'utf8');
    await writeFile(path.join(src, 'templates.json'), JSON.stringify({}), 'utf8');

    const registry = await loadContentRegistry({ rootDir: root });
    const bundle = getContentBundle(registry, 'source-no-routes');

    expect(bundle).not.toBeNull();
    expect(bundle?.routes).toEqual([]);
  });

  it('throws on invalid scripts.json schema', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'content-registry-invalid-'));
    const bad = path.join(root, 'source-b');
    await mkdir(bad, { recursive: true });
    await writeFile(path.join(bad, 'scripts.json'), JSON.stringify([{ bad: true }]), 'utf8');

    await expect(loadContentRegistry({ rootDir: root })).rejects.toThrow();
  });

  it('ignores *-example.json files and reads only working json files', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'content-registry-example-'));
    const source = path.join(root, 'source-c');
    await mkdir(source, { recursive: true });

    await writeFile(
      path.join(source, 'scripts.json'),
      JSON.stringify([{ id: 'message.received', steps: [] }]),
      'utf8',
    );
    await writeFile(path.join(source, 'templates.json'), JSON.stringify({ welcome: 'ok' }), 'utf8');

    await writeFile(path.join(source, 'scripts-example.json'), '{"broken":', 'utf8');
    await writeFile(path.join(source, 'templates-example.json'), '{"broken":', 'utf8');
    await writeFile(path.join(source, 'routes.json'), JSON.stringify([]), 'utf8');
    await writeFile(path.join(source, 'routes-example.json'), '{"broken":', 'utf8');

    const registry = await loadContentRegistry({ rootDir: root });
    const bundle = getContentBundle(registry, 'source-c');

    expect(bundle).not.toBeNull();
    expect(bundle?.scripts).toHaveLength(1);
    expect(bundle?.templates).toMatchObject({ welcome: 'ok' });
    expect(bundle?.routes).toEqual([]);
  });
});

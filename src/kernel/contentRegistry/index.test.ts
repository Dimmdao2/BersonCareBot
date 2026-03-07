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

  it('keeps notifications.show self-sufficient by fetching state before rendering', async () => {
    const root = path.resolve(process.cwd(), 'src/content');
    const registry = await loadContentRegistry({ rootDir: root });
    const telegram = getContentBundle(registry, 'telegram');
    const script = telegram?.scripts.find((item) => item.id === 'telegram.notifications.show');

    expect(script?.steps[0]).toMatchObject({
      action: 'notifications.get',
      mode: 'sync',
    });
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
    const registry = await loadContentRegistry({ rootDir: root });
    const bundle = getContentBundle(registry, 'source-a');

    expect(bundle).not.toBeNull();
    expect(bundle?.scripts.length).toBe(1);
    expect(Object.keys(bundle?.templates ?? {})).toContain('welcome');
  });

  it('loads bundle with scripts/templates only', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'content-registry-no-routes-'));
    const src = path.join(root, 'source-no-routes');
    await mkdir(src, { recursive: true });
    await writeFile(path.join(src, 'scripts.json'), JSON.stringify([]), 'utf8');
    await writeFile(path.join(src, 'templates.json'), JSON.stringify({}), 'utf8');

    const registry = await loadContentRegistry({ rootDir: root });
    const bundle = getContentBundle(registry, 'source-no-routes');

    expect(bundle).not.toBeNull();
    expect(bundle?.scripts).toEqual([]);
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
    await writeFile(path.join(source, 'routes-example.json'), '{"broken":', 'utf8');

    const registry = await loadContentRegistry({ rootDir: root });
    const bundle = getContentBundle(registry, 'source-c');

    expect(bundle).not.toBeNull();
    expect(bundle?.scripts).toHaveLength(1);
    expect(bundle?.templates).toMatchObject({ welcome: 'ok' });
  });

  it('validates structured script matcher operators', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'content-registry-matchers-'));
    const source = path.join(root, 'source-m');
    await mkdir(source, { recursive: true });

    await writeFile(
      path.join(source, 'scripts.json'),
      JSON.stringify([
        {
          id: 'message.received',
          source: 'source-m',
          event: 'message.received',
          match: {
            input: {
              textPresent: true,
              excludeTexts: ['/start'],
              action: 'book',
            },
          },
          steps: [],
        },
      ]),
      'utf8',
    );
    await writeFile(path.join(source, 'templates.json'), JSON.stringify({}), 'utf8');

    const registry = await loadContentRegistry({ rootDir: root });
    const bundle = getContentBundle(registry, 'source-m');

    expect(bundle?.scripts).toHaveLength(1);
  });

  it('rejects invalid matcher operators in scripts.json', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'content-registry-bad-matchers-'));
    const source = path.join(root, 'source-bad-match');
    await mkdir(source, { recursive: true });

    await writeFile(
      path.join(source, 'scripts.json'),
      JSON.stringify([
        {
          id: 'message.received',
          match: {
            input: {
              excludeActions: [1, 2],
            },
          },
          steps: [],
        },
      ]),
      'utf8',
    );
    await writeFile(path.join(source, 'templates.json'), JSON.stringify({}), 'utf8');

    await expect(loadContentRegistry({ rootDir: root })).rejects.toThrow();
  });
});

import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ensureNoDuplicateScriptIds, getContentBundle, getEffectiveBundleKey, loadContentRegistry } from './index.js';

describe('contentRegistry', () => {
  it('loads rubitime and telegram/user, telegram/admin bundles from workspace content root', async () => {
    const root = path.resolve(process.cwd(), 'src/content');
    const registry = await loadContentRegistry({ rootDir: root });

    expect(getContentBundle(registry, 'rubitime')).not.toBeNull();
    expect(getContentBundle(registry, 'telegram/user')).not.toBeNull();
    expect(getContentBundle(registry, 'telegram/admin')).not.toBeNull();
  });

  it('rejects root scripts/templates when source has user/admin scoped bundles', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'content-registry-shadow-'));
    const source = path.join(root, 'telegram');
    const user = path.join(source, 'user');
    const admin = path.join(source, 'admin');
    await mkdir(user, { recursive: true });
    await mkdir(admin, { recursive: true });
    await writeFile(path.join(user, 'scripts.json'), JSON.stringify([]), 'utf8');
    await writeFile(path.join(user, 'templates.json'), JSON.stringify({}), 'utf8');
    await writeFile(path.join(admin, 'scripts.json'), JSON.stringify([]), 'utf8');
    await writeFile(path.join(admin, 'templates.json'), JSON.stringify({}), 'utf8');
    await writeFile(path.join(source, 'scripts.json'), JSON.stringify([]), 'utf8');

    await expect(loadContentRegistry({ rootDir: root })).rejects.toThrow(/forbidden to prevent shadow runtime content/);
  });

  it('keeps telegram.more.menu as webapp entry (message.received)', async () => {
    const root = path.resolve(process.cwd(), 'src/content');
    const registry = await loadContentRegistry({ rootDir: root });
    const telegramUser = getContentBundle(registry, 'telegram/user');
    const script = telegramUser?.scripts.find((item) => item.id === 'telegram.more.menu');

    expect(script?.match).toMatchObject({
      input: { action: 'menu.more' },
    });
    expect(script?.steps.some((s) => s.action === 'message.send')).toBe(true);
  });

  it('keeps booking.open safe by providing a fallback script', async () => {
    const root = path.resolve(process.cwd(), 'src/content');
    const registry = await loadContentRegistry({ rootDir: root });
    const telegramUser = getContentBundle(registry, 'telegram/user');
    const script = telegramUser?.scripts.find((item) => item.id === 'telegram.booking.open.fallback');

    expect(script?.match).toMatchObject({
      input: { action: 'booking.open' },
    });
    expect(script?.steps[0]).toMatchObject({
      action: 'user.state.set',
      mode: 'sync',
    });
    expect(script?.steps[1]).toMatchObject({
      action: 'message.replyKeyboard.show',
      mode: 'async',
    });
  });

  it('keeps bookings.show safe by providing a fallback callback script', async () => {
    const root = path.resolve(process.cwd(), 'src/content');
    const registry = await loadContentRegistry({ rootDir: root });
    const telegramUser = getContentBundle(registry, 'telegram/user');
    const script = telegramUser?.scripts.find((item) => item.id === 'telegram.contact.link.request.bookings.fallback');

    expect(script?.match).toMatchObject({
      input: { action: 'bookings.show' },
    });
    expect(script?.steps.at(-1)).toMatchObject({
      action: 'callback.answer',
      mode: 'async',
    });
  });

  it('ensures each callback from telegram user menu has a matching callback script', async () => {
    const root = path.resolve(process.cwd(), 'src/content');
    const registry = await loadContentRegistry({ rootDir: root });
    const telegramUser = getContentBundle(registry, 'telegram/user');
    const menus = telegramUser?.menus ?? {};
    const menuRows = Array.isArray((menus as Record<string, unknown>).main)
      ? ((menus as Record<string, unknown>).main as unknown[])
      : [];
    const callbackActions = menuRows.flatMap((row) => {
      if (!Array.isArray(row)) return [];
      return row
        .map((button) => (typeof button === 'object' && button !== null ? (button as Record<string, unknown>).callbackData : undefined))
        .filter((value): value is string => typeof value === 'string' && value.length > 0);
    });
    const scripts = telegramUser?.scripts ?? [];
    for (const action of callbackActions) {
      const hasScript = scripts.some((script) => {
        const match = script.match as Record<string, unknown> | undefined;
        const input = match?.input as Record<string, unknown> | undefined;
        const ev = script.event;
        return (
          (ev === 'callback.received' || ev === 'message.received')
          && input?.action === action
        );
      });
      expect(hasScript).toBe(true);
    }
  });

  it('forbids hardcoded actor authorization in telegram user scripts', async () => {
    const root = path.resolve(process.cwd(), 'src/content');
    const registry = await loadContentRegistry({ rootDir: root });
    const telegramUser = getContentBundle(registry, 'telegram/user');
    const scripts = telegramUser?.scripts ?? [];
    const hasHardcodedActorGate = scripts.some((script) => {
      const match = script.match as Record<string, unknown> | undefined;
      const actor = match?.actor as Record<string, unknown> | undefined;
      return typeof actor?.channelUserId === 'number' || typeof actor?.channelUserId === 'string';
    });
    expect(hasHardcodedActorGate).toBe(false);
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

  it('throws on duplicate script id within same scope', () => {
    const bundle = {
      scripts: [
        { id: 'dup', steps: [{ action: 'a', params: {} }] },
        { id: 'dup', steps: [{ action: 'b', params: {} }] },
      ],
      templates: {},
    };
    expect(() => ensureNoDuplicateScriptIds(bundle, 'test/scope')).toThrow(/duplicate script id "dup"/);
  });

  it('getEffectiveBundleKey returns scope key when present, else source', () => {
    const registry = {
      'telegram/user': { scripts: [], templates: {} },
      'telegram/admin': { scripts: [], templates: {} },
      rubitime: { scripts: [], templates: {} },
    };
    expect(getEffectiveBundleKey(registry, 'telegram', 'user')).toBe('telegram/user');
    expect(getEffectiveBundleKey(registry, 'telegram', 'admin')).toBe('telegram/admin');
    expect(getEffectiveBundleKey(registry, 'rubitime', 'user')).toBe('rubitime');
  });
});

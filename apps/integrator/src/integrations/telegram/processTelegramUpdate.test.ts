import { describe, expect, it, vi } from 'vitest';
import { getCurrentOrganizationPrincipalId } from '../../infra/principal/organizationPrincipal.js';
import { processTelegramUpdate, type TelegramWebhookDeps } from './webhook.js';
import type { TelegramWebhookBodyValidated } from './schema.js';

// Keep the unit isolated from real Telegram/config side-effects.
vi.mock('./setupMenuButton.js', () => ({
  setupTelegramMenuButton: vi.fn(async () => undefined),
  ensureNoMenuButtonForUser: vi.fn(async () => undefined),
}));
vi.mock('./config.js', () => ({
  telegramConfig: {
    adminTelegramId: 999001,
    botToken: 'test',
    sendMenuOnButtonPress: true,
    mode: 'long_polling',
  },
}));

const stubLogger = {
  warn: vi.fn(),
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
} as unknown as Parameters<typeof processTelegramUpdate>[2]['logger'];

const ctx = { correlationId: 'test-corr', eventId: 'test-evt', logger: stubLogger };

function depsWith(
  handle: (event: unknown) => Promise<{ status: 'accepted' | 'rejected'; reason?: string }>,
): { deps: TelegramWebhookDeps; handle: ReturnType<typeof vi.fn> } {
  const handleMock = vi.fn(handle);
  const deps = {
    eventGateway: { handleIncomingEvent: handleMock },
  } as unknown as TelegramWebhookDeps;
  return { deps, handle: handleMock };
}

describe('processTelegramUpdate (shared webhook + long-polling core)', () => {
  it('runs a message update through the pipeline and returns ok', async () => {
    const { deps, handle } = depsWith(async () => ({ status: 'accepted' }));
    const body: TelegramWebhookBodyValidated = {
      update_id: 1,
      message: { from: { id: 100, is_bot: false, first_name: 'A' }, chat: { id: 100, type: 'private' }, text: 'hi' },
    };
    const out = await processTelegramUpdate(body, deps, ctx);
    expect(out.status).toBe('ok');
    expect(handle).toHaveBeenCalledTimes(1);
  });

  it('runs eventGateway under resolved organization context and clears it after', async () => {
    const organizationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const { deps, handle } = depsWith(async () => {
      expect(getCurrentOrganizationPrincipalId()).toBe(organizationId);
      return { status: 'accepted' };
    });
    deps.resolveOrganizationIdForMessengerIdentity = vi.fn(async () => organizationId);
    const body: TelegramWebhookBodyValidated = {
      update_id: 10,
      message: { from: { id: 100, is_bot: false, first_name: 'A' }, chat: { id: 100, type: 'private' }, text: 'hi' },
    };

    const out = await processTelegramUpdate(body, deps, ctx);

    expect(out.status).toBe('ok');
    expect(deps.resolveOrganizationIdForMessengerIdentity).toHaveBeenCalledWith('100', 'telegram');
    expect(handle).toHaveBeenCalledTimes(1);
    expect(getCurrentOrganizationPrincipalId()).toBeUndefined();
  });

  it('leaves eventGateway context unset when source identity has no single organization and no deployment fallback is configured', async () => {
    const { deps, handle } = depsWith(async () => {
      expect(getCurrentOrganizationPrincipalId()).toBeUndefined();
      return { status: 'accepted' };
    });
    deps.resolveOrganizationIdForMessengerIdentity = vi.fn(async () => null);
    const body: TelegramWebhookBodyValidated = {
      update_id: 11,
      message: { from: { id: 101, is_bot: false, first_name: 'B' }, chat: { id: 101, type: 'private' }, text: 'hi' },
    };

    const out = await processTelegramUpdate(body, deps, ctx);

    expect(out.status).toBe('ok');
    expect(handle).toHaveBeenCalledTimes(1);
    expect(getCurrentOrganizationPrincipalId()).toBeUndefined();
  });

  it('T0.4: falls back to the deployment channel-binding organization for a first-contact (unenrolled) identity', async () => {
    const deploymentOrganizationId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    const { deps, handle } = depsWith(async () => {
      expect(getCurrentOrganizationPrincipalId()).toBe(deploymentOrganizationId);
      return { status: 'accepted' };
    });
    // First-contact identity: per-user resolution has nothing to resolve yet (not enrolled).
    deps.resolveOrganizationIdForMessengerIdentity = vi.fn(async () => null);
    deps.resolveDeploymentOrganizationId = vi.fn(async () => deploymentOrganizationId);
    const body: TelegramWebhookBodyValidated = {
      update_id: 12,
      message: { from: { id: 102, is_bot: false, first_name: 'C' }, chat: { id: 102, type: 'private' }, text: '/start' },
    };

    const out = await processTelegramUpdate(body, deps, ctx);

    expect(out.status).toBe('ok');
    expect(deps.resolveOrganizationIdForMessengerIdentity).toHaveBeenCalledWith('102', 'telegram');
    expect(deps.resolveDeploymentOrganizationId).toHaveBeenCalledTimes(1);
    expect(handle).toHaveBeenCalledTimes(1);
    expect(getCurrentOrganizationPrincipalId()).toBeUndefined();
  });

  it('T0.4: prefers the per-user organization over the deployment fallback when both resolve', async () => {
    const perUserOrganizationId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    const deploymentOrganizationId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    const { deps, handle } = depsWith(async () => {
      expect(getCurrentOrganizationPrincipalId()).toBe(perUserOrganizationId);
      return { status: 'accepted' };
    });
    deps.resolveOrganizationIdForMessengerIdentity = vi.fn(async () => perUserOrganizationId);
    const deploymentResolver = vi.fn(async () => deploymentOrganizationId);
    deps.resolveDeploymentOrganizationId = deploymentResolver;
    const body: TelegramWebhookBodyValidated = {
      update_id: 13,
      message: { from: { id: 103, is_bot: false, first_name: 'D' }, chat: { id: 103, type: 'private' }, text: 'hi' },
    };

    const out = await processTelegramUpdate(body, deps, ctx);

    expect(out.status).toBe('ok');
    expect(deploymentResolver).not.toHaveBeenCalled();
    expect(handle).toHaveBeenCalledTimes(1);
  });

  it('returns ignored and skips the pipeline when the update maps to nothing', async () => {
    const { deps, handle } = depsWith(async () => ({ status: 'accepted' }));
    const body = {} as TelegramWebhookBodyValidated;
    const out = await processTelegramUpdate(body, deps, ctx);
    expect(out.status).toBe('ignored');
    expect(handle).not.toHaveBeenCalled();
  });

  it('returns rejected when the event pipeline rejects', async () => {
    const { deps } = depsWith(async () => ({ status: 'rejected', reason: 'duplicate' }));
    const body: TelegramWebhookBodyValidated = {
      update_id: 2,
      message: { from: { id: 101, is_bot: false, first_name: 'B' }, chat: { id: 101, type: 'private' }, text: 'x' },
    };
    const out = await processTelegramUpdate(body, deps, ctx);
    expect(out.status).toBe('rejected');
    expect(out.reason).toBe('duplicate');
  });
});

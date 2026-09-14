import { describe, expect, it } from 'vitest';
import {
  COMMUNICATIONS_SURFACE_TABS,
  resolveCommunicationsSurface,
  type CommunicationsSurfaceTabId,
} from './communicationsSurface';

const BOTH_MODULES_ON = { direct_chat: true, program_comments: true } as const;
const BOTH_CHANNELS_ON = { direct_chat: 'all', program_comments: 'on_support' } as const;

describe('resolveCommunicationsSurface', () => {
  it.each([
    ['direct_chat', 'chats'],
    ['program_comments', 'comments'],
  ] as const)('removes %s when its organization-wide channel default is off', (channel, tabId) => {
    const surface = resolveCommunicationsSurface(BOTH_MODULES_ON, {
      ...BOTH_CHANNELS_ON,
      [channel]: 'off',
    });

    expect(surface.visibleTabIds).not.toContain(tabId);
  });

  it.each(['chats', 'comments'] as const)(
    'uses the surviving tab own name when only %s remains',
    (survivingTabId) => {
      const surface = resolveCommunicationsSurface(
        {
          direct_chat: survivingTabId === 'chats',
          program_comments: survivingTabId === 'comments',
        },
        BOTH_CHANNELS_ON,
      );
      const survivingTab = COMMUNICATIONS_SURFACE_TABS.find((tab) => tab.id === survivingTabId);

      expect(surface.kind).toBe('single');
      expect(surface.label).toBe(survivingTab?.label);
    },
  );

  it('distinguishes a multi-tab surface from an absent surface', () => {
    const multiple = resolveCommunicationsSurface(BOTH_MODULES_ON, BOTH_CHANNELS_ON);
    const hidden = resolveCommunicationsSurface(
      { direct_chat: false, program_comments: false },
      BOTH_CHANNELS_ON,
    );

    expect(multiple.kind).toBe('multiple');
    expect(multiple.label).not.toBeNull();
    expect(hidden).toEqual({ kind: 'hidden', visibleTabIds: [], label: null });
  });

  it('never reports a visible tab whose module is unavailable', () => {
    const moduleAvailability = { direct_chat: false, program_comments: true } as const;
    const surface = resolveCommunicationsSurface(moduleAvailability, BOTH_CHANNELS_ON);
    const unavailableTabIds = COMMUNICATIONS_SURFACE_TABS.filter(
      (tab) => !moduleAvailability[tab.workspaceModule],
    ).map((tab) => tab.id satisfies CommunicationsSurfaceTabId);

    for (const tabId of unavailableTabIds) {
      expect(surface.visibleTabIds).not.toContain(tabId);
    }
  });
});

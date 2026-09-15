import type {
  DoctorWorkspaceClientDefaults,
  WorkspaceModuleEffective,
} from '@/modules/system-settings/doctorWorkspaceComposition';

export type CommunicationsSurfaceTabId = 'chats' | 'comments' | 'leads';

type CommunicationsSurfaceTab = Readonly<{
  id: CommunicationsSurfaceTabId;
  label: string;
  workspaceModule: Extract<
    keyof WorkspaceModuleEffective,
    'direct_chat' | 'program_comments' | 'leads'
  >;
  channelDefault?: Extract<
    keyof DoctorWorkspaceClientDefaults['channelDefaults'],
    'direct_chat' | 'program_comments'
  >;
}>;

export const COMMUNICATIONS_SURFACE_TABS: readonly CommunicationsSurfaceTab[] = [
  {
    id: 'chats',
    label: 'Чаты',
    workspaceModule: 'direct_chat',
    channelDefault: 'direct_chat',
  },
  {
    id: 'comments',
    label: 'Комментарии',
    workspaceModule: 'program_comments',
    channelDefault: 'program_comments',
  },
  {
    id: 'leads',
    label: 'Заявки',
    workspaceModule: 'leads',
  },
];

export type CommunicationsSurface =
  | Readonly<{
      kind: 'hidden';
      visibleTabIds: readonly [];
      label: null;
    }>
  | Readonly<{
      kind: 'single';
      visibleTabIds: readonly [CommunicationsSurfaceTabId];
      label: string;
    }>
  | Readonly<{
      kind: 'multiple';
      visibleTabIds: readonly CommunicationsSurfaceTabId[];
      label: string;
    }>;

type CommunicationsWorkspaceModules = Pick<
  WorkspaceModuleEffective,
  'direct_chat' | 'program_comments' | 'leads'
>;

type CommunicationsChannelDefaults = Pick<
  DoctorWorkspaceClientDefaults['channelDefaults'],
  'direct_chat' | 'program_comments'
>;

/**
 * One projection for every communications entry point: page, menu and shell chrome.
 * Inputs are already resolved at the organization boundary; this function performs no reads.
 */
export function resolveCommunicationsSurface(
  workspaceModules: CommunicationsWorkspaceModules,
  channelDefaults: CommunicationsChannelDefaults,
): CommunicationsSurface {
  const visibleTabs = COMMUNICATIONS_SURFACE_TABS.filter(
    (tab) =>
      workspaceModules[tab.workspaceModule] &&
      (tab.channelDefault === undefined || channelDefaults[tab.channelDefault] !== 'off'),
  );

  if (visibleTabs.length === 0) {
    return { kind: 'hidden', visibleTabIds: [], label: null };
  }

  if (visibleTabs.length === 1) {
    const tab = visibleTabs[0]!;
    return { kind: 'single', visibleTabIds: [tab.id], label: tab.label };
  }

  return {
    kind: 'multiple',
    visibleTabIds: visibleTabs.map((tab) => tab.id),
    label: 'Коммуникации',
  };
}

export const DEFAULT_COMMUNICATIONS_SURFACE = resolveCommunicationsSurface(
  { direct_chat: true, program_comments: true, leads: true },
  { direct_chat: 'all', program_comments: 'on_support' },
) as Exclude<CommunicationsSurface, { kind: 'hidden' }>;

export const DEFAULT_COMMUNICATIONS_SURFACE_LABEL = DEFAULT_COMMUNICATIONS_SURFACE.label;

export const SHELL_RUNTIME_CAPABILITIES = {
  jitsi: false,
  media: false,
  push: false,
} as const;

export type ShellRuntimeCapabilities = typeof SHELL_RUNTIME_CAPABILITIES;

export interface ShellRuntimeInfo {
  readonly kind: 'capacitor-android';
  readonly version: string;
  readonly brand: 'therapygo' | 'therapysto';
  readonly capabilities: ShellRuntimeCapabilities;
}

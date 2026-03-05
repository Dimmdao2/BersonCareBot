import type { OutgoingIntent } from '../../kernel/contracts/index.js';

export type RuntimeDispatchAdapter = {
  canHandle: (intent: OutgoingIntent) => boolean;
  send: (intent: OutgoingIntent) => Promise<void>;
};

/** Thin runtime dispatcher: selects adapter and forwards intent as-is. */
export async function dispatchIntent(
  intent: OutgoingIntent,
  adapters: RuntimeDispatchAdapter[],
): Promise<void> {
  for (const adapter of adapters) {
    if (!adapter.canHandle(intent)) continue;
    await adapter.send(intent);
    return;
  }
  throw new Error(`DISPATCH_ADAPTER_NOT_FOUND:${intent.type}`);
}

/**
 * Unified send façade (PLAN S3).
 *
 * `createUnifiedSender` is THE ergonomic entry point for the whole system to send any message.
 * It:
 *   1. Validates `msg.channel ∈ Channel`.
 *   2. Maps `UnifiedOutgoingMessage` → `OutgoingIntent` via `messageToIntent`.
 *   3. Delegates to `dispatchPort.dispatchOutgoing(intent)` — the chokepoint.
 *
 * The pre-fork redirect inside `dispatchOutgoing` is applied unchanged, so every
 * UnifiedOutgoingMessage inherits the redirect automatically — including future channels
 * that have no adapter yet (they collapse to the telegram test chat in dev). (PLAN D7)
 *
 * This is a PURE additive façade (Phase A). No send path moves yet; call-site migration
 * is Phase B+. The redirect chokepoint (`applyPreForkDevRedirect` inside `dispatchOutgoing`)
 * stays exactly as is.
 */
import type { DeliverySendResult, DispatchPort } from '../../kernel/contracts/index.js';
import type { UnifiedOutgoingMessage } from '../../kernel/contracts/unifiedMessage.js';
import { messageToIntent } from './channelRouting.js';

/** The supported channel tag vocabulary (matches Channel type, D3). */
const VALID_CHANNELS = new Set(['telegram', 'max', 'smsc', 'email', 'web_push']);

/** The public API of the unified sender. */
export type UnifiedSender = {
  send(msg: UnifiedOutgoingMessage): Promise<DeliverySendResult>;
};

/**
 * Creates the unified sender façade wired to an existing `dispatchPort`.
 *
 * @example
 * ```ts
 * const unifiedSender = createUnifiedSender({ dispatchPort });
 * await unifiedSender.send({ kind: 'message.send', channel: 'telegram', ... });
 * ```
 */
export function createUnifiedSender(deps: { dispatchPort: DispatchPort }): UnifiedSender {
  return {
    async send(msg: UnifiedOutgoingMessage): Promise<DeliverySendResult> {
      // Guard: channel must be a known Channel literal.
      if (!VALID_CHANNELS.has(msg.channel)) {
        throw new Error(`UNKNOWN_CHANNEL:${String(msg.channel)}`);
      }

      // Map to the legacy OutgoingIntent shape (wire/DB shape unchanged, D2).
      const intent = messageToIntent(msg);

      // Delegate to the chokepoint — redirect is applied inside, unchanged (D7).
      return deps.dispatchPort.dispatchOutgoing(intent);
    },
  };
}

import { cn } from "@/lib/utils";
import type { ChatMessageDeliveryStatus } from "@/modules/messaging/chatMessageDeliveryStatus";
import { ChatMessageDeliveryTicks } from "./ChatMessageDeliveryTicks";

type Props = {
  timeLabel: string;
  deliveryStatus: ChatMessageDeliveryStatus;
  className?: string;
  ticksClassName?: string;
};

/** Time + delivery ticks inside outgoing bubble (Telegram-style, bottom-right). */
export function ChatBubbleOutgoingMeta({ timeLabel, deliveryStatus, className, ticksClassName }: Props) {
  return (
    <div className={cn("mt-1 flex items-center justify-end gap-0.5", className)}>
      <span className="text-[11px] leading-none tabular-nums opacity-80">{timeLabel}</span>
      <ChatMessageDeliveryTicks status={deliveryStatus} className={cn("opacity-90", ticksClassName)} />
    </div>
  );
}

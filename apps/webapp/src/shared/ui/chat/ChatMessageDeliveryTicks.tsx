import { Check, CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChatMessageDeliveryStatus } from "@/modules/messaging/chatMessageDeliveryStatus";

type Props = {
  status: ChatMessageDeliveryStatus;
  className?: string;
};

/** Telegram-style delivery ticks: one = sent, two = read by peer. */
export function ChatMessageDeliveryTicks({ status, className }: Props) {
  const Icon = status === "read" ? CheckCheck : Check;
  return (
    <Icon
      className={cn("size-[14px] shrink-0 stroke-[2.25]", className)}
      aria-hidden
      data-delivery-status={status}
    />
  );
}

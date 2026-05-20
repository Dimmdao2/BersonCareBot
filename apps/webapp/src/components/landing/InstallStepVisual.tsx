import { Download, MoreVertical, PlusSquare, Share2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type InstallHintKind =
  | "ios-share"
  | "ios-add-home"
  | "ios-add"
  | "android-menu"
  | "android-install"
  | "android-confirm";

type InstallStepVisualProps = {
  kind: InstallHintKind;
};

const chip = "mt-2 inline-flex max-w-full items-center gap-1.5 rounded-lg border border-[#E6ECF8] bg-[#F8FAFF] px-2.5 py-1.5 text-sm font-medium text-[#17264A]";

/** Компактные подсказки к шагам установки. */
export function InstallStepVisual({ kind }: InstallStepVisualProps) {
  switch (kind) {
    case "ios-share":
      return (
        <span className={cn(chip, "text-[#007AFF]")} aria-hidden>
          <Share2 className="h-4 w-4 shrink-0" strokeWidth={2} />
          Поделиться
        </span>
      );
    case "ios-add-home":
      return (
        <span className={chip} aria-hidden>
          <PlusSquare className="h-4 w-4 shrink-0 text-[#2F55B7]" />
          На экран «Домой»
        </span>
      );
    case "ios-add":
      return (
        <span className="mt-2 inline-flex rounded-lg bg-[#007AFF] px-3 py-1.5 text-sm font-semibold text-white" aria-hidden>
          Добавить
        </span>
      );
    case "android-menu":
      return (
        <span className={chip} aria-hidden>
          <MoreVertical className="h-4 w-4 shrink-0 text-[#17264A]" />
          Меню ⋮
        </span>
      );
    case "android-install":
      return (
        <span className={chip} aria-hidden>
          <Download className="h-4 w-4 shrink-0 text-[#2F55B7]" />
          Установить приложение
        </span>
      );
    case "android-confirm":
      return (
        <span className="mt-2 inline-flex rounded-lg bg-[#2F55B7] px-3 py-1.5 text-sm font-semibold text-white" aria-hidden>
          Подтвердить
        </span>
      );
    default:
      return null;
  }
}

"use client";

import { useCallback, useState } from "react";
import { Button } from "@/shared/ui/doctor/primitives/button";

type CopyForAiButtonProps = {
  payload: Record<string, unknown>;
  label?: string;
  className?: string;
};

export function CopyForAiButton({ payload, label = "Скопировать для ИИ", className }: CopyForAiButtonProps) {
  const [copied, setCopied] = useState(false);

  const onCopy = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      } catch {
        setCopied(false);
      }
    },
    [payload],
  );

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={className}
      onClick={(e) => void onCopy(e)}
      aria-label={label}
    >
      {copied ? "Скопировано" : label}
    </Button>
  );
}

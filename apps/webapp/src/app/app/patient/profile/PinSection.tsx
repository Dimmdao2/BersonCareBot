"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { PinInput } from "@/shared/ui/auth/PinInput";

/** Установка PIN после входа (сессия обязательна). Два шага: ввод и подтверждение, 4 ячейки. */
export function PinSection() {
  const [stage, setStage] = useState<"first" | "second">("first");
  const [firstPin, setFirstPin] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submitPin = async (pin: string, confirmPin: string) => {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/pin/set", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ pin, pinConfirm: confirmPin }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string };
      if (!res.ok) {
        toast.error(data.message ?? "Не удалось сохранить PIN");
        setStage("first");
        setFirstPin(null);
        return;
      }
      toast.success("PIN сохранён");
      setStage("first");
      setFirstPin(null);
    } finally {
      setLoading(false);
    }
  };

  if (stage === "first") {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-muted-foreground text-sm">
          Задайте PIN для быстрого входа по номеру телефона.
        </p>
        <PinInput
          disabled={loading}
          onSubmit={(pin) => {
            setFirstPin(pin);
            setStage("second");
          }}
          onForgot={() => {}}
          forgotHidden
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-sm">Повторите PIN-код.</p>
      <PinInput
        disabled={loading}
        onSubmit={async (confirmPin) => {
          if (confirmPin !== firstPin) {
            toast.error("PIN не совпадает. Введите снова.");
            setStage("first");
            setFirstPin(null);
            return;
          }
          await submitPin(firstPin!, confirmPin);
        }}
        onForgot={() => {
          setStage("first");
          setFirstPin(null);
        }}
        forgotLabel="Назад"
      />
    </div>
  );
}

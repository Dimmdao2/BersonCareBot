"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { PinInput } from "@/shared/ui/auth/PinInput";

type PinSectionProps = {
  /** На сервере: есть ли уже PIN у пользователя. */
  hasPin: boolean;
};

/**
 * Установка / смена PIN после входа (сессия обязательна).
 * Два шага: ввод и подтверждение, 4 ячейки.
 * При уже существующем PIN форма скрыта до «Сбросить PIN».
 */
export function PinSection({ hasPin: initialHasPin }: PinSectionProps) {
  const router = useRouter();
  const [resetting, setResetting] = useState(false);
  const [stage, setStage] = useState<"first" | "second">("first");
  const [firstPin, setFirstPin] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const showPinForm = !initialHasPin || resetting;

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
      setResetting(false);
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  if (!showPinForm) {
    return (
      <div id="patient-profile-pin-created" className="flex flex-col gap-3">
        <p className="text-muted-foreground text-sm">
          Вы можете войти по номеру телефона и PIN без кода из SMS или мессенджера.
        </p>
        <Button type="button" variant="outline" className="w-fit" onClick={() => setResetting(true)}>
          Сбросить PIN
        </Button>
      </div>
    );
  }

  if (stage === "first") {
    return (
      <div id="patient-profile-pin-step-1" className="flex flex-col gap-3">
        <p className="text-muted-foreground text-sm">
          {initialHasPin
            ? "Задайте новый PIN для входа по номеру телефона."
            : "Задайте PIN для быстрого входа по номеру телефона."}
        </p>
        <PinInput
          disabled={loading}
          submitLabel="Далее"
          onSubmit={(pin) => {
            setFirstPin(pin);
            setStage("second");
          }}
          onForgot={() => {}}
          forgotHidden
        />
        {initialHasPin ? (
          <Button type="button" variant="link" className="h-auto min-h-0 w-fit px-0 py-0 text-sm font-normal" onClick={() => setResetting(false)}>
            Отмена
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div id="patient-profile-pin-step-2" className="flex flex-col gap-3">
      <p className="text-muted-foreground text-sm">Повторите PIN-код.</p>
      <PinInput
        disabled={loading}
        submitLabel="Сохранить PIN"
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

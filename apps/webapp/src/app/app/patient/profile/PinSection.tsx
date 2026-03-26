"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Установка PIN после входа (сессия обязательна). */
export function PinSection() {
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pin !== pinConfirm) {
      toast.error("PIN не совпадает");
      return;
    }
    if (!/^\d{4}$/.test(pin)) {
      toast.error("Введите 4 цифры");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/pin/set", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ pin, pinConfirm }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string };
      if (!res.ok) {
        toast.error(data.message ?? "Не удалось сохранить PIN");
        return;
      }
      toast.success("PIN сохранён");
      setPin("");
      setPinConfirm("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className={cn("flex max-w-sm flex-col gap-3")}>
      <p className="text-muted-foreground text-sm">
        Задайте PIN для быстрого входа по номеру (после проверки телефона).
      </p>
      <div className="flex flex-col gap-1.5">
        <label className="text-muted-foreground text-xs font-medium uppercase tracking-wide" htmlFor="profile-pin">
          Новый PIN
        </label>
        <Input
          id="profile-pin"
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          maxLength={4}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
          disabled={loading}
          aria-label="Новый PIN"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label
          className="text-muted-foreground text-xs font-medium uppercase tracking-wide"
          htmlFor="profile-pin-confirm"
        >
          Повторите PIN
        </label>
        <Input
          id="profile-pin-confirm"
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          maxLength={4}
          value={pinConfirm}
          onChange={(e) => setPinConfirm(e.target.value.replace(/\D/g, "").slice(0, 4))}
          disabled={loading}
          aria-label="Повторите PIN"
        />
      </div>
      <Button type="submit" disabled={loading}>
        {loading ? "Сохранение…" : "Сохранить PIN"}
      </Button>
    </form>
  );
}

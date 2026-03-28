"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PinInputProps = {
  disabled?: boolean;
  onSubmit: (pin: string) => void | Promise<void>;
  onForgot: () => void;
  /** Текст ссылки под формой; по умолчанию «Не помню PIN» */
  forgotLabel?: string;
  /** Скрыть ссылку (например при первом вводе PIN в профиле) */
  forgotHidden?: boolean;
};

const CELL =
  "w-12 h-14 rounded-lg border border-input bg-background text-center text-2xl font-bold tabular-nums outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive";

function digitsOnly(s: string): string {
  return s.replace(/\D/g, "");
}

/** Ввод PIN (ровно 4 цифры), без хранения в sessionStorage. */
export function PinInput({
  disabled,
  onSubmit,
  onForgot,
  forgotLabel,
  forgotHidden = false,
}: PinInputProps) {
  const [digits, setDigits] = useState(["", "", "", ""]);
  const [error, setError] = useState<string | null>(null);
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);
  /** Последний PIN, для которого уже вызван auto-submit (сбрасывается при правке). */
  const autoSubmittedForRef = useRef<string | null>(null);
  const submitInFlightRef = useRef(false);

  const pin = digits.join("");

  const focusAt = useCallback((index: number) => {
    const el = inputsRef.current[index];
    if (el) {
      el.focus();
      el.select();
    }
  }, []);

  const runSubmit = useCallback(
    (code: string) => {
      if (disabled || submitInFlightRef.current) return;
      submitInFlightRef.current = true;
      void Promise.resolve(onSubmit(code)).finally(() => {
        submitInFlightRef.current = false;
      });
    },
    [disabled, onSubmit],
  );

  useEffect(() => {
    if (disabled || !/^\d{4}$/.test(pin)) {
      autoSubmittedForRef.current = null;
      return;
    }
    if (autoSubmittedForRef.current === pin) return;
    autoSubmittedForRef.current = pin;
    runSubmit(pin);
  }, [pin, disabled, runSubmit]);

  const handleChange = (index: number, raw: string) => {
    setError(null);
    const d = digitsOnly(raw).slice(-1);
    setDigits((prev) => {
      const next = [...prev] as [string, string, string, string];
      next[index] = d;
      return next;
    });
    if (d && index < 3) {
      queueMicrotask(() => focusAt(index + 1));
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      if (digits[index]) {
        return;
      }
      e.preventDefault();
      if (index > 0) {
        setDigits((prev) => {
          const next = [...prev] as [string, string, string, string];
          next[index - 1] = "";
          return next;
        });
        focusAt(index - 1);
      }
    }
    if (e.key === "ArrowLeft" && index > 0) {
      e.preventDefault();
      focusAt(index - 1);
    }
    if (e.key === "ArrowRight" && index < 3) {
      e.preventDefault();
      focusAt(index + 1);
    }
  };

  /** Вставка из буфера в любом из четырёх полей: первые 4 цифры распределяются слева направо. */
  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    setError(null);
    const chunk = digitsOnly(e.clipboardData.getData("text")).slice(0, 4);
    if (!chunk) return;
    const next: [string, string, string, string] = ["", "", "", ""];
    for (let i = 0; i < 4; i += 1) {
      next[i] = chunk[i] ?? "";
    }
    setDigits(next);
    queueMicrotask(() => focusAt(chunk.length >= 4 ? 3 : Math.max(0, chunk.length - 1)));
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{4}$/.test(pin)) {
      setError("Введите 4 цифры");
      return;
    }
    runSubmit(pin);
  };

  return (
    <form className={cn("flex max-w-sm flex-col gap-2")} onSubmit={handleManualSubmit}>
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">PIN-код</span>
      <div className="flex w-full flex-row justify-start gap-3" role="group" aria-label="PIN-код из 4 цифр">
        {digits.map((value, i) => (
          <input
            key={`pin-slot-${i}`}
            ref={(el) => {
              inputsRef.current[i] = el;
            }}
            id={i === 0 ? "auth-pin-field" : undefined}
            type="text"
            inputMode="numeric"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            maxLength={1}
            value={value}
            disabled={disabled}
            aria-label={`Цифра ${i + 1} из 4`}
            aria-invalid={!!error}
            className={CELL}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onPaste={handlePaste}
            onFocus={(e) => e.target.select()}
          />
        ))}
      </div>
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      <Button type="submit" disabled={disabled} aria-label="Войти">
        {disabled ? "Проверка…" : "Войти"}
      </Button>
      {!forgotHidden ? (
        <Button
          type="button"
          variant="link"
          className="h-auto min-h-0 px-0 py-0 text-sm font-normal"
          onClick={onForgot}
        >
          {forgotLabel ?? "Не помню PIN"}
        </Button>
      ) : null}
    </form>
  );
}

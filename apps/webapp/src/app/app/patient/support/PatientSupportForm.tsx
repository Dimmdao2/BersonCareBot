"use client";

import { usePathname } from "next/navigation";
import { useCallback, useState } from "react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isMessengerMiniAppHost } from "@/shared/lib/messengerMiniApp";
import { routePaths } from "@/app-layer/routes/paths";

const MAX_LEN = 4000;

type Props = {
  defaultEmail: string;
  /** По умолчанию — сессия пациента; для экрана до входа — `/api/public/support`. */
  supportSubmitPath?: string;
};

export function PatientSupportForm({ defaultEmail, supportSubmitPath = "/api/patient/support" }: Props) {
  const pathname = usePathname();
  const [email, setEmail] = useState(defaultEmail.trim());
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = useCallback(async () => {
    const em = email.trim();
    const msg = message.trim();
    if (!em) {
      toast.error("Укажите email");
      return;
    }
    if (!msg) {
      toast.error("Введите текст сообщения");
      return;
    }
    if (msg.length > MAX_LEN) {
      toast.error(`Сообщение не длиннее ${MAX_LEN} символов`);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(supportSubmitPath, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: em,
          message: msg,
          surface: isMessengerMiniAppHost() ? "mini_app" : "browser",
          from: pathname?.startsWith("/app") ? pathname : routePaths.patientSupport,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        message?: string;
      };
      if (res.status === 429 || data.error === "rate_limited") {
        toast.error("Подождите минуту перед повторной отправкой.");
        return;
      }
      if (!res.ok || !data.ok) {
        toast.error(data.message ?? data.error ?? "Не удалось отправить");
        return;
      }
      toast.success(data.message ?? "Сообщение отправлено");
      setMessage("");
    } catch {
      toast.error("Нет соединения с сервером. Проверьте сеть.");
    } finally {
      setLoading(false);
    }
  }, [email, message, pathname, supportSubmitPath]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor="support-email" className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
          Email для ответа
        </label>
        <Input
          id="support-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          disabled={loading}
        />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="support-message" className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
          Сообщение
        </label>
        <textarea
          id="support-message"
          className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-[140px] w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Опишите вопрос или проблему"
          maxLength={MAX_LEN}
          disabled={loading}
        />
        <p className="text-muted-foreground text-xs">{message.length} / {MAX_LEN}</p>
      </div>
      <Button type="button" onClick={() => void submit()} disabled={loading}>
        {loading ? "Отправка…" : "Отправить"}
      </Button>
    </div>
  );
}

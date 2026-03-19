"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type AskQuestionFABProps = {
  /** Показывать только когда пользователь зашёл через браузер (без telegram/max). */
  visible: boolean;
};

export function AskQuestionFAB({ visible }: AskQuestionFABProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const close = useCallback(() => {
    setOpen(false);
    setError(null);
    setSuccess(false);
  }, []);

  const toggle = useCallback(() => {
    setOpen((v) => !v);
    if (open) {
      setError(null);
      setSuccess(false);
    }
  }, [open]);

  useEffect(() => {
    if (open) document.body.classList.add("ask-question-panel-open");
    else document.body.classList.remove("ask-question-panel-open");
    return () => document.body.classList.remove("ask-question-panel-open");
  }, [open]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [close]);

  const handleSend = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/patient/question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed, from: pathname || "/app/patient" }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        message?: string;
        redirectTo?: string;
      };

      if (data.redirectTo && res.status === 403) {
        window.location.href = data.redirectTo;
        return;
      }

      if (!res.ok) {
        setError(data.message ?? "Ошибка отправки");
        return;
      }

      setSuccess(true);
      setText("");
      setTimeout(() => {
        setSuccess(false);
        close();
      }, 1500);
    } catch {
      setError("Ошибка сети");
    } finally {
      setSending(false);
    }
  }, [text, sending, pathname, close]);

  if (!visible) return null;

  return (
    <>
      <button
        type="button"
        id="ask-question-fab-button"
        className="ask-question-fab"
        onClick={toggle}
        aria-label="Задать вопрос"
        aria-expanded={open}
      >
        Задать вопрос
      </button>

      <div
        id="ask-question-overlay"
        className="ask-question-overlay"
        aria-hidden={!open}
        onClick={close}
        onKeyDown={(e) => e.key === "Escape" && close()}
        tabIndex={-1}
        role="presentation"
      />
      <div
        id="ask-question-panel"
        className={`ask-question-panel ${open ? "ask-question-panel--open" : ""}`}
        role="dialog"
        aria-label="Отправить вопрос"
        aria-modal="true"
      >
        <div className="ask-question-panel__header">
          <h3 className="ask-question-panel__title">Задать вопрос</h3>
          <button
            type="button"
            className="ask-question-panel__close"
            onClick={close}
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>
        <div className="ask-question-panel__body">
          {success ? (
            <p className="ask-question-panel__success">Вопрос отправлен</p>
          ) : (
            <>
              <div className="ask-question-input-wrap">
                <textarea
                  className="ask-question-input"
                  placeholder="Напишите ваш вопрос..."
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={3}
                  maxLength={4000}
                  disabled={sending}
                  aria-label="Текст вопроса"
                />
              </div>
              {error && <p className="ask-question-panel__error">{error}</p>}
              <button
                type="button"
                className="button ask-question-send"
                onClick={handleSend}
                disabled={!text.trim() || sending}
              >
                {sending ? "Отправка…" : "Отправить"}
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}

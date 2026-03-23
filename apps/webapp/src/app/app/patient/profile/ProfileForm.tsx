"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useEffect, useState, useTransition } from "react";
import { BindPhoneBlock } from "@/shared/ui/auth/BindPhoneBlock";
import { updateDisplayName } from "./actions";

type Props = {
  displayName: string;
  phone: string | null;
  /** Контекст для SMS-привязки (как на странице bind-phone). */
  phoneChannel: "telegram" | "web";
  phoneChatId: string;
};

export function ProfileForm({ displayName, phone, phoneChannel, phoneChatId }: Props) {
  const router = useRouter();
  const [name, setName] = useState(displayName);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const [editingPhone, setEditingPhone] = useState(false);

  useEffect(() => {
    setName(displayName);
  }, [displayName]);

  const handleSaveName = () => {
    const trimmedName = name.trim();
    if (!trimmedName || trimmedName === displayName) return;
    setSaved(false);
    startTransition(async () => {
      await updateDisplayName(trimmedName);
      setSaved(true);
      router.refresh();
    });
  };

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div>
        <label className="eyebrow" htmlFor="profile-name" style={{ display: "block", marginBottom: 4 }}>
          Имя
        </label>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            id="profile-name"
            type="text"
            className="auth-input"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setSaved(false);
            }}
            disabled={pending}
          />
          <button
            type="button"
            className="button"
            onClick={handleSaveName}
            disabled={pending || !name.trim() || name.trim() === displayName}
          >
            {pending ? "..." : "Сохранить"}
          </button>
        </div>
        {saved ? (
          <p style={{ color: "#16a34a", fontSize: "0.875rem", margin: "4px 0 0" }}>
            Сохранено
          </p>
        ) : null}
      </div>

      <div>
        <span className="eyebrow" style={{ display: "block", marginBottom: 4 }}>
          Телефон
        </span>
        {phone && editingPhone ? (
          <div className="stack" style={{ gap: 8 }}>
            <Suspense fallback={<p className="empty-state">Загрузка формы…</p>}>
              <BindPhoneBlock
                channel={phoneChannel}
                chatId={phoneChatId}
                nextPathOverride="/app/patient/profile"
                onBindSuccess={() => {
                  setEditingPhone(false);
                  router.refresh();
                }}
              />
            </Suspense>
            <button type="button" className="button button--ghost" onClick={() => setEditingPhone(false)}>
              Отмена
            </button>
          </div>
        ) : phone ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span>{phone}</span>
            <button type="button" className="button button--ghost" style={{ fontSize: "0.875rem" }} onClick={() => setEditingPhone(true)}>
              Изменить
            </button>
          </div>
        ) : (
          <Link href="/app/patient/bind-phone?next=/app/patient/profile" className="button">
            Привязать номер
          </Link>
        )}
      </div>

      <div>
        <span className="eyebrow" style={{ display: "block", marginBottom: 4 }}>
          Email
        </span>
        <input type="email" className="auth-input" placeholder="email@example.com" disabled />
        <p className="empty-state" style={{ fontSize: "0.8rem", margin: "4px 0 0" }}>
          Привязка email будет доступна в следующем обновлении.
        </p>
      </div>
    </div>
  );
}

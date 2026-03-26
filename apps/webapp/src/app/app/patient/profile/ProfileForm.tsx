"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BindPhoneBlock } from "@/shared/ui/auth/BindPhoneBlock";
import { EmailAccountPanel } from "@/shared/ui/EmailAccountPanel";
import { InlineEditField } from "@/shared/ui/InlineEditField";
import { updateDisplayName } from "./actions";

type Props = {
  displayName: string;
  phone: string | null;
  /** Контекст для SMS-привязки (как на странице bind-phone). */
  phoneChannel: "telegram" | "web";
  phoneChatId: string;
  initialEmail: string | null;
  emailVerified: boolean;
};

export function ProfileForm({
  displayName,
  phone,
  phoneChannel,
  phoneChatId,
  initialEmail,
  emailVerified,
}: Props) {
  const router = useRouter();
  const [editingPhone, setEditingPhone] = useState(false);

  const handleSaveName = async (next: string) => {
    const trimmedName = next.trim();
    if (!trimmedName || trimmedName === displayName) return;
    await updateDisplayName(trimmedName);
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-6">
      <InlineEditField
        label="ФИО"
        value={displayName}
        placeholder="Иванов Иван Иванович"
        type="text"
        emptyLabel="не указано"
        onSave={handleSaveName}
      />

      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Телефон</span>
          {!phone ? (
            <Link
              href="/app/patient/bind-phone?next=/app/patient/profile"
              className={cn(buttonVariants({ variant: "link", size: "sm" }), "h-auto min-h-0 px-0")}
            >
              Привязать номер
            </Link>
          ) : !editingPhone ? (
            <Button
              type="button"
              variant="link"
              size="sm"
              className="text-primary h-auto min-h-0 px-0 py-0 text-sm font-medium"
              onClick={() => setEditingPhone(true)}
            >
              Изменить
            </Button>
          ) : null}
        </div>
        {phone && !editingPhone ? (
          <p className="text-sm">{phone}</p>
        ) : null}
        {phone && editingPhone ? (
          <div className="flex flex-col gap-2 sm:max-w-md">
            <Suspense fallback={<p className="text-muted-foreground text-sm">Загрузка формы…</p>}>
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
            <Button
              type="button"
              variant="link"
              className="h-auto min-h-0 px-0 text-muted-foreground"
              onClick={() => setEditingPhone(false)}
            >
              Отмена
            </Button>
          </div>
        ) : null}
      </div>

      <EmailAccountPanel initialEmail={initialEmail} emailVerified={emailVerified} />
    </div>
  );
}

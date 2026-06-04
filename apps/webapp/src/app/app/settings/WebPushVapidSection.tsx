"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/shared/ui/doctor/primitives/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/doctor/primitives/card";
import { Input } from "@/shared/ui/doctor/primitives/input";
import { patchAdminSetting } from "./patchAdminSetting";

export type WebPushVapidSectionProps = {
  initialPublicKey: string;
  hasStoredPrivateKey: boolean;
};

export function WebPushVapidSection({ initialPublicKey, hasStoredPrivateKey }: WebPushVapidSectionProps) {
  const router = useRouter();
  const [publicKey, setPublicKey] = useState(initialPublicKey);
  const [privateKeyInput, setPrivateKeyInput] = useState("");
  const [hasPrivate, setHasPrivate] = useState(hasStoredPrivateKey);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setHasPrivate(hasStoredPrivateKey);
  }, [hasStoredPrivateKey]);

  useEffect(() => {
    setPublicKey(initialPublicKey);
  }, [initialPublicKey]);

  function handleSave() {
    setSaved(false);
    setError(null);
    startTransition(async () => {
      try {
        const trimmedPriv = privateKeyInput.trim();
        if (!hasPrivate && trimmedPriv.length === 0) {
          setError("Укажите приватный ключ при первой настройке");
          return;
        }
        const ok = await patchAdminSetting("web_push_vapid", {
          publicKey,
          privateKey: privateKeyInput,
        });
        if (!ok) {
          setError("Не удалось сохранить");
          return;
        }
        if (trimmedPriv.length > 0) {
          setHasPrivate(true);
        }
        setPrivateKeyInput("");
        setSaved(true);
        router.refresh();
      } catch {
        setError("Ошибка при сохранении");
      }
    });
  }

  return (
    <Card className="mt-6 border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Web Push (VAPID)</CardTitle>
        <p className="text-xs text-muted-foreground">
          Пара ключей: pnpm --filter @bersoncare/webapp exec web-push generate-vapid-keys (локально).
        </p>
      </CardHeader>
      <CardContent className="flex max-w-xl flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium">Публичный ключ</span>
          <Input
            value={publicKey}
            onChange={(e) => setPublicKey(e.target.value)}
            disabled={isPending}
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium">Приватный ключ</span>
          <Input
            type="password"
            value={privateKeyInput}
            onChange={(e) => setPrivateKeyInput(e.target.value)}
            disabled={isPending}
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={handleSave} disabled={isPending}>
            Сохранить
          </Button>
          {saved ? <span className="text-sm text-muted-foreground">Сохранено</span> : null}
          {error ? <span className="text-sm text-destructive">{error}</span> : null}
        </div>
      </CardContent>
    </Card>
  );
}

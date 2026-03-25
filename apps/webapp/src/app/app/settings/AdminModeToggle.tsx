"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { ShieldAlert } from "lucide-react";

type AdminModeToggleProps = {
  adminMode: boolean;
  onToggle?: (newMode: boolean) => void;
};

export function AdminModeToggle({ adminMode, onToggle }: AdminModeToggleProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    startTransition(async () => {
      try {
        const res = await fetch("/api/admin/mode", { method: "POST" });
        const data = (await res.json()) as { ok: boolean; adminMode?: boolean };
        if (data.ok && data.adminMode !== undefined) {
          onToggle?.(data.adminMode);
        }
        setOpen(false);
        router.refresh();
      } catch {
        setOpen(false);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant={adminMode ? "destructive" : "outline"}
            size="sm"
            className="flex items-center gap-2"
          />
        }
      >
        <ShieldAlert className="size-4" aria-hidden />
        {adminMode ? "Выключить режим администратора" : "Включить режим администратора"}
      </DialogTrigger>

      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>
            {adminMode ? "Выключить режим администратора?" : "Включить режим администратора?"}
          </DialogTitle>
          <DialogDescription>
            {adminMode
              ? "Административные функции будут скрыты до следующего включения."
              : "В режиме администратора доступны опасные операции: dev_mode, debug forwarding, тестовые ID. Включайте только при необходимости."}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Отмена</DialogClose>
          <Button
            variant={adminMode ? "outline" : "destructive"}
            onClick={handleConfirm}
            disabled={isPending}
          >
            {isPending ? "..." : "Подтвердить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

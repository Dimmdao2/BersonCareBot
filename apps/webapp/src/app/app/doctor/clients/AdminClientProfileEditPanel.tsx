"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  userId: string;
  displayName: string;
  firstName: string | null | undefined;
  lastName: string | null | undefined;
  email: string | null | undefined;
  emailVerifiedAt: string | null | undefined;
  /** Нормализованный телефон из карточки (`platform_users.phone_normalized`). */
  phone: string | null | undefined;
};

export function AdminClientProfileEditPanel({
  userId,
  displayName: initialDisplayName,
  firstName: initialFirst,
  lastName: initialLast,
  email: initialEmail,
  emailVerifiedAt,
  phone: initialPhone,
}: Props) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [firstName, setFirstName] = useState(initialFirst ?? "");
  const [lastName, setLastName] = useState(initialLast ?? "");
  const [email, setEmail] = useState(initialEmail ?? "");
  const [phone, setPhone] = useState(initialPhone ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setPending(true);
      try {
        const body: Record<string, unknown> = {};
        if (displayName !== initialDisplayName) body.displayName = displayName;
        if (firstName !== (initialFirst ?? "")) body.firstName = firstName.trim() === "" ? null : firstName.trim();
        if (lastName !== (initialLast ?? "")) body.lastName = lastName.trim() === "" ? null : lastName.trim();
        const emailNorm = email.trim();
        const initialEmailNorm = (initialEmail ?? "").trim();
        if (emailNorm !== initialEmailNorm) {
          body.email = emailNorm === "" ? null : emailNorm;
        }
        const phoneNorm = phone.trim();
        const initialPhoneNorm = (initialPhone ?? "").trim();
        if (phoneNorm !== initialPhoneNorm) {
          body.phone = phoneNorm === "" ? null : phoneNorm;
        }
        if (Object.keys(body).length === 0) {
          setError("Нет изменений.");
          setPending(false);
          return;
        }
        const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/profile`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(body),
        });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!res.ok || json.ok !== true) {
          if (res.status === 409 && json.error === "email_conflict") {
            setError("Такой email уже занят другим пользователем.");
          } else if (res.status === 409 && json.error === "phone_conflict") {
            setError("Этот телефон уже привязан к другому пользователю.");
          } else if (json.error === "invalid_phone") {
            setError("Некорректный номер. Ожидается российский формат (например +79991234567).");
          } else if (json.error === "forbidden") {
            setError("Нужны роль admin и режим администратора.");
          } else {
            setError(json.error ?? `Ошибка сохранения (${res.status})`);
          }
          setPending(false);
          return;
        }
        router.refresh();
      } catch {
        setError("Сеть недоступна.");
      } finally {
        setPending(false);
      }
    },
    [
      displayName,
      firstName,
      lastName,
      email,
      phone,
      initialDisplayName,
      initialFirst,
      initialLast,
      initialEmail,
      initialPhone,
      userId,
      router,
    ],
  );

  return (
    <div className="flex flex-col gap-4" aria-labelledby="admin-client-profile-edit-heading">
      <h2 id="admin-client-profile-edit-heading" className="text-base font-semibold">
        Данные клиента (админ)
      </h2>
      <form onSubmit={onSubmit} className="flex flex-col gap-3 max-w-lg">
        <div className="space-y-1.5">
          <Label htmlFor="admin-edit-display-name">Отображаемое имя (ФИО)</Label>
          <Input
            id="admin-edit-display-name"
            value={displayName}
            onChange={(ev) => setDisplayName(ev.target.value)}
            autoComplete="name"
            maxLength={500}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="admin-edit-first-name">Имя</Label>
            <Input
              id="admin-edit-first-name"
              value={firstName}
              onChange={(ev) => setFirstName(ev.target.value)}
              maxLength={200}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="admin-edit-last-name">Фамилия</Label>
            <Input
              id="admin-edit-last-name"
              value={lastName}
              onChange={(ev) => setLastName(ev.target.value)}
              maxLength={200}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="admin-edit-phone">Телефон (E.164, РФ)</Label>
          <Input
            id="admin-edit-phone"
            type="tel"
            value={phone}
            onChange={(ev) => setPhone(ev.target.value)}
            placeholder="+79991234567"
            autoComplete="off"
            maxLength={20}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="admin-edit-email">Email</Label>
          <Input
            id="admin-edit-email"
            type="email"
            value={email}
            onChange={(ev) => setEmail(ev.target.value)}
            autoComplete="off"
            maxLength={320}
          />
          {emailVerifiedAt ? (
            <p className="text-xs text-muted-foreground">Был подтверждён; при смене адреса подтверждение сбрасывается.</p>
          ) : initialEmail?.trim() ? (
            <p className="text-xs text-muted-foreground">Не подтверждён.</p>
          ) : null}
        </div>
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <Button type="submit" disabled={pending} className="w-fit">
          {pending ? "Сохранение…" : "Сохранить"}
        </Button>
      </form>
    </div>
  );
}

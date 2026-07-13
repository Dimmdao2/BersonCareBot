"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import { DoctorEmptyState } from "@/shared/ui/doctor/DoctorEmptyState";
import {
  DoctorSection,
  DoctorSectionHeader,
  DoctorSectionTitle,
} from "@/shared/ui/doctor/DoctorSection";
import { DoctorModal } from "@/shared/ui/doctor/DoctorModal";
import { doctorSectionItemClass } from "@/shared/ui/doctor/doctorVisual";
import { Button } from "@/shared/ui/doctor/primitives/button";
import { Input } from "@/shared/ui/doctor/primitives/input";
import { Label } from "@/shared/ui/doctor/primitives/label";
import { Badge } from "@/shared/ui/doctor/primitives/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/shared/ui/doctor/primitives/select";
import type { ClinicInviteView, ClinicMemberView } from "./types";

type InviteRole = "doctor" | "admin";

type Props = {
  initialMembers: ClinicMemberView[];
  initialInvites: ClinicInviteView[];
};

const roleLabels: Record<InviteRole | "owner" | "assistant", string> = {
  owner: "Владелец",
  admin: "Администратор",
  doctor: "Врач",
  assistant: "Ассистент",
};

const statusLabels: Record<ClinicMemberView["status"], string> = {
  active: "Активен",
  invited: "Приглашён",
  disabled: "Отключён",
};

function recordFromUnknown(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" ? value as Record<string, unknown> : null;
}

function parseMembersResponse(value: unknown): ClinicMemberView[] {
  const root = recordFromUnknown(value);
  const members = root && Array.isArray(root.members) ? root.members : [];
  return members.flatMap((item) => {
    const row = recordFromUnknown(item);
    if (!row || typeof row.id !== "string") return [];
    const role = row.role;
    const status = row.status;
    if (role !== "owner" && role !== "admin" && role !== "doctor" && role !== "assistant") return [];
    if (status !== "active" && status !== "invited" && status !== "disabled") return [];
    return [{
      id: row.id,
      displayName: typeof row.displayName === "string" ? row.displayName : null,
      role,
      status,
      specialistLinked: row.specialistLinked === true,
    }];
  });
}

function parseInvitesResponse(value: unknown): ClinicInviteView[] {
  const root = recordFromUnknown(value);
  const invites = root && Array.isArray(root.invites) ? root.invites : [];
  return invites.flatMap((item) => {
    const row = recordFromUnknown(item);
    if (!row || typeof row.id !== "string") return [];
    const invitedRole = row.invitedRole;
    const status = row.status;
    if (invitedRole !== "admin" && invitedRole !== "doctor") return [];
    if (status !== "pending" && status !== "accepted" && status !== "revoked" && status !== "expired") return [];
    return [{
      id: row.id,
      invitedEmail: typeof row.invitedEmail === "string" ? row.invitedEmail : "",
      invitedRole,
      status,
      expiresAt: typeof row.expiresAt === "string" ? row.expiresAt : "",
    }];
  });
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

async function readJson(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

export function ClinicMembersClient({ initialMembers, initialInvites }: Props) {
  const [members, setMembers] = useState(initialMembers);
  const [invites, setInvites] = useState(initialInvites);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InviteRole>("doctor");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const inviteRoleLabel = useMemo(() => roleLabels[role], [role]);

  async function reloadMembers() {
    const response = await fetch("/api/clinic/members", { cache: "no-store" });
    if (!response.ok) throw new Error("members_load_failed");
    setMembers(parseMembersResponse(await readJson(response)));
  }

  async function reloadInvites() {
    const response = await fetch("/api/clinic/invites", { cache: "no-store" });
    if (!response.ok) throw new Error("invites_load_failed");
    setInvites(parseInvitesResponse(await readJson(response)));
  }

  function submitInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setInviteUrl(null);
    startTransition(async () => {
      const response = await fetch("/api/clinic/invites", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      const json = await readJson(response);
      const root = recordFromUnknown(json);
      if (!response.ok || !root || root.ok !== true) {
        setError("Не удалось создать приглашение.");
        return;
      }
      setInviteUrl(typeof root.inviteUrl === "string" ? root.inviteUrl : null);
      setEmail("");
      await reloadInvites();
    });
  }

  function revokeInvite(inviteId: string) {
    setError(null);
    startTransition(async () => {
      const response = await fetch(`/api/clinic/invites/${inviteId}`, { method: "DELETE" });
      if (!response.ok) {
        setError("Не удалось отозвать приглашение.");
        return;
      }
      await reloadInvites();
    });
  }

  function refreshAll() {
    setError(null);
    startTransition(async () => {
      await Promise.all([reloadMembers(), reloadInvites()]);
    });
  }

  return (
    <>
      <DoctorSection>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <DoctorSectionHeader>
            <DoctorSectionTitle>Команда клиники</DoctorSectionTitle>
            <p className="text-xs text-muted-foreground">Участники текущей организации.</p>
          </DoctorSectionHeader>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={refreshAll} disabled={isPending}>
              Обновить
            </Button>
            <Button type="button" size="sm" onClick={() => setInviteOpen(true)}>
              Пригласить врача
            </Button>
          </div>
        </div>

        {members.length === 0 ? (
          <DoctorEmptyState>В клинике пока нет участников.</DoctorEmptyState>
        ) : (
          <div className="flex flex-col gap-2">
            {members.map((member) => (
              <div key={member.id} className={doctorSectionItemClass}>
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {member.displayName || "Без имени"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {member.specialistLinked ? "Карточка специалиста привязана" : "Без карточки специалиста"}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                    <Badge variant="secondary">{roleLabels[member.role]}</Badge>
                    <Badge variant={member.status === "active" ? "outline" : "secondary"}>
                      {statusLabels[member.status]}
                    </Badge>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </DoctorSection>

      <DoctorSection>
        <DoctorSectionHeader>
          <DoctorSectionTitle>Ожидают приглашения</DoctorSectionTitle>
          <p className="text-xs text-muted-foreground">Активные email-ссылки для входа в клинику.</p>
        </DoctorSectionHeader>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {invites.length === 0 ? (
          <DoctorEmptyState>Нет ожидающих приглашений.</DoctorEmptyState>
        ) : (
          <div className="flex flex-col gap-2">
            {invites.map((invite) => (
              <div key={invite.id} className={doctorSectionItemClass}>
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{invite.invitedEmail}</p>
                    <p className="text-xs text-muted-foreground">Действует до {formatDateTime(invite.expiresAt)}</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                    <Badge variant="secondary">{roleLabels[invite.invitedRole]}</Badge>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => revokeInvite(invite.id)}
                      disabled={isPending}
                    >
                      Отозвать
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </DoctorSection>

      <DoctorModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Пригласить врача"
        size="sm"
        footer={(
          <>
            <Button type="button" variant="outline" size="sm" onClick={() => setInviteOpen(false)}>
              Закрыть
            </Button>
            <Button type="submit" size="sm" form="clinic-member-invite-form" disabled={isPending || !email.trim()}>
              Создать
            </Button>
          </>
        )}
      >
        <form id="clinic-member-invite-form" className="flex flex-col gap-3" onSubmit={submitInvite}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="clinic-member-invite-email">Email</Label>
            <Input
              id="clinic-member-invite-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              placeholder="doctor@example.com"
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Роль</Label>
            <Select value={role} onValueChange={(value) => setRole(value === "admin" ? "admin" : "doctor")}>
              <SelectTrigger className="w-full" displayLabel={inviteRoleLabel} />
              <SelectContent align="start">
                <SelectItem value="doctor">Врач</SelectItem>
                <SelectItem value="admin">Администратор</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {inviteUrl ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="clinic-member-invite-url">Ссылка приглашения</Label>
              <Input id="clinic-member-invite-url" readOnly value={inviteUrl} />
            </div>
          ) : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </form>
      </DoctorModal>
    </>
  );
}

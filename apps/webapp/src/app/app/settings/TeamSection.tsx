"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiJson } from "@/shared/lib/apiJson";
import { Button } from "@/shared/ui/doctor/primitives/button";
import { Input } from "@/shared/ui/doctor/primitives/input";
import { Badge } from "@/shared/ui/doctor/primitives/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/doctor/primitives/select";
import { DoctorSection, DoctorSectionHeader, DoctorSectionTitle } from "@/shared/ui/doctor/DoctorSection";
import { DoctorEmptyState } from "@/shared/ui/doctor/DoctorEmptyState";
import type { OrganizationInviteRole } from "@/modules/organization-invites/ports";

const ROLE_LABELS: Record<string, string> = {
  owner: "Владелец",
  admin: "Администратор",
  doctor: "Врач",
  assistant: "Ассистент",
};

const INVITE_ERROR_MESSAGES: Record<string, string> = {
  seat_limit_reached: "Достигнут лимит мест специалистов по тарифу. Освободите место или расширьте тариф.",
  already_member: "Этот email уже участвует в организации.",
  invalid_email: "Некорректный email",
};

export type TeamMemberRow = {
  id: string;
  displayName: string | null;
  role: string;
  status: string;
  seatConsuming: boolean;
};

export type TeamInviteRow = {
  id: string;
  invitedEmail: string;
  invitedRole: string;
  expiresAt: string;
};

export type TeamSeatStatus = {
  limit: number;
  used: number;
  available: number;
};

type Props = {
  members: TeamMemberRow[];
  invites: TeamInviteRow[];
  seats: TeamSeatStatus;
};

function formatSeatStatus(seats: TeamSeatStatus): string {
  return `Занято мест: ${seats.used} из ${seats.limit}`;
}

export function TeamSection({ members, invites, seats }: Props) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OrganizationInviteRole>("doctor");
  const [submitting, setSubmitting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const seatsExhaustedForDoctor = seats.available === 0;

  async function submitInvite() {
    setInviteError(null);
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setInviteError("Введите email");
      return;
    }
    setSubmitting(true);
    try {
      await apiJson("/api/clinic/invites", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail, role }),
      });
      setEmail("");
      router.refresh();
    } catch (e) {
      const code = e instanceof Error ? e.message : "error";
      setInviteError(INVITE_ERROR_MESSAGES[code] ?? "Не удалось отправить приглашение");
    } finally {
      setSubmitting(false);
    }
  }

  async function revokeInvite(inviteId: string) {
    setRevokingId(inviteId);
    try {
      await apiJson(`/api/clinic/invites/${inviteId}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setRevokingId(null);
    }
  }

  return (
    <>
      <DoctorSection>
        <DoctorSectionHeader>
          <DoctorSectionTitle>Команда</DoctorSectionTitle>
        </DoctorSectionHeader>
        <p className="text-muted-foreground text-sm">{formatSeatStatus(seats)}</p>
        {members.length === 0 ? (
          <DoctorEmptyState>В организации пока нет участников.</DoctorEmptyState>
        ) : (
          <ul className="flex flex-col gap-2">
            {members.map((member) => (
              <li key={member.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>{member.displayName ?? "Без имени"}</span>
                <span className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline">{ROLE_LABELS[member.role] ?? member.role}</Badge>
                  {member.seatConsuming ? <Badge variant="secondary">Место</Badge> : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </DoctorSection>

      <DoctorSection>
        <DoctorSectionHeader>
          <DoctorSectionTitle>Пригласить в команду</DoctorSectionTitle>
        </DoctorSectionHeader>
        <div className="flex max-w-md flex-col gap-3">
          <Input
            type="email"
            autoComplete="email"
            placeholder="email@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={submitting}
          />
          <Select value={role} onValueChange={(value) => setRole(value as OrganizationInviteRole)}>
            <SelectTrigger displayLabel={ROLE_LABELS[role]} disabled={submitting}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="doctor">Врач</SelectItem>
              <SelectItem value="admin">Администратор</SelectItem>
            </SelectContent>
          </Select>
          {role === "doctor" && seatsExhaustedForDoctor ? (
            <p className="text-muted-foreground text-xs">
              Все места специалистов по тарифу заняты. Приглашение врача сейчас будет отклонено.
            </p>
          ) : null}
          {inviteError ? <p className="text-destructive text-sm">{inviteError}</p> : null}
          <Button type="button" size="sm" disabled={submitting} onClick={() => void submitInvite()}>
            {submitting ? "Отправка…" : "Пригласить"}
          </Button>
        </div>
      </DoctorSection>

      <DoctorSection>
        <DoctorSectionHeader>
          <DoctorSectionTitle>Приглашения в ожидании</DoctorSectionTitle>
        </DoctorSectionHeader>
        {invites.length === 0 ? (
          <DoctorEmptyState>Нет приглашений в ожидании подтверждения.</DoctorEmptyState>
        ) : (
          <ul className="flex flex-col gap-2">
            {invites.map((invite) => (
              <li key={invite.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="min-w-0 flex-1">
                  {invite.invitedEmail}
                  <span className="text-muted-foreground ml-2 text-xs">
                    {ROLE_LABELS[invite.invitedRole] ?? invite.invitedRole}
                  </span>
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={revokingId === invite.id}
                  onClick={() => void revokeInvite(invite.id)}
                >
                  Отозвать
                </Button>
              </li>
            ))}
          </ul>
        )}
      </DoctorSection>
    </>
  );
}

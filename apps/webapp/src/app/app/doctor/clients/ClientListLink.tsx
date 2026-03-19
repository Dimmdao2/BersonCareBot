"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

type ClientListLinkProps = {
  userId: string;
  searchParams: { q?: string; telegram?: string; max?: string; appointment?: string };
  children: React.ReactNode;
};

export function ClientListLink({ userId, searchParams, children }: ClientListLinkProps) {
  const router = useRouter();

  const handleClick = (e: React.MouseEvent) => {
    if (typeof window !== "undefined" && window.innerWidth >= 768) {
      e.preventDefault();
      const params = new URLSearchParams();
      if (searchParams.q) params.set("q", searchParams.q);
      if (searchParams.telegram === "1") params.set("telegram", "1");
      if (searchParams.max === "1") params.set("max", "1");
      if (searchParams.appointment === "1") params.set("appointment", "1");
      params.set("selected", userId);
      router.push(`/app/doctor/clients?${params.toString()}`);
    }
  };

  return (
    <Link
      href={`/app/doctor/clients/${userId}`}
      onClick={handleClick}
      style={{ fontWeight: 600 }}
    >
      {children}
    </Link>
  );
}

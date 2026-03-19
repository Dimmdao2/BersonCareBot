"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

type ClientsSearchBarProps = {
  defaultValue?: string | null;
};

export function ClientsSearchBar({ defaultValue }: ClientsSearchBarProps) {
  const router = useRouter();
  const [value, setValue] = useState(defaultValue ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applySearch = useCallback(
    (q: string) => {
      const params = new URLSearchParams(window.location.search);
      if (q.trim()) {
        params.set("q", q.trim());
      } else {
        params.delete("q");
      }
      const query = params.toString();
      router.push(`/app/doctor/clients${query ? `?${query}` : ""}`);
    },
    [router]
  );

  useEffect(() => {
    const initial = defaultValue ?? "";
    if (value === initial) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      applySearch(value);
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value, defaultValue, applySearch]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    applySearch(value);
  };

  return (
    <form onSubmit={handleSubmit} className="stack" style={{ marginBottom: "0.5rem" }}>
      <input
        type="search"
        className="auth-input"
        placeholder="Поиск по имени, телефону, Telegram..."
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-label="Поиск клиентов"
      />
    </form>
  );
}

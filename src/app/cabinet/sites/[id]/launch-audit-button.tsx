"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function LaunchAuditButton({ siteId }: { siteId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function launch() {
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/audits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId, maxPages: 20, measureCwv: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Erreur");
        return;
      }
      router.push(`/cabinet/audits/${data.audit.id}`);
      router.refresh();
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={launch}
        disabled={pending}
        className="rounded-lg bg-cyan-500/20 px-4 py-2 text-sm font-medium text-cyan-100 ring-1 ring-cyan-500/40 hover:bg-cyan-500/30 disabled:opacity-50"
      >
        {pending ? "Lancement…" : "Lancer un audit"}
      </button>
      {error ? <p className="mt-1 text-xs text-rose-300">{error}</p> : null}
    </div>
  );
}

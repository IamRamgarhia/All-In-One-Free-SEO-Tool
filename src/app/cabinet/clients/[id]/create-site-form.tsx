"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function CreateSiteForm({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, url, name: name || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Erreur");
        return;
      }
      router.push(`/cabinet/sites/${data.site.id}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2">
      <label className="block text-xs text-muted-foreground">
        URL
        <input
          required
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="mt-1 block w-56 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
          placeholder="https://example.com"
        />
      </label>
      <label className="block text-xs text-muted-foreground">
        Nom
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 block w-36 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
          placeholder="Prod"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-cyan-500/20 px-4 py-2 text-sm font-medium text-cyan-100 ring-1 ring-cyan-500/40 hover:bg-cyan-500/30 disabled:opacity-50"
      >
        {pending ? "…" : "Ajouter un site"}
      </button>
      {error ? <p className="w-full text-xs text-rose-300">{error}</p> : null}
    </form>
  );
}

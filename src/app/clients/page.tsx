import Link from "next/link";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

import { Users, Globe, Plus, Sparkles } from "lucide-react";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/shell/page-header";
import { ImportClientsButton } from "./import-form";
import { getGoogleConnectionStatus } from "@/lib/google-oauth";

const nicheLabels: Record<string, string> = {
  local: "Local",
  ecommerce: "E-commerce",
  saas: "SaaS",
  blog: "Blog",
  services: "Services",
};

const nicheTone: Record<string, string> = {
  local: "bg-violet-500/15 text-violet-300 ring-violet-500/20",
  ecommerce: "bg-cyan-500/15 text-cyan-300 ring-cyan-500/20",
  saas: "bg-amber-500/15 text-amber-300 ring-amber-500/20",
  blog: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/20",
  services: "bg-rose-500/15 text-rose-300 ring-rose-500/20",
};

export default async function ClientsPage() {
  const rows = await db.select().from(clients).orderBy(desc(clients.createdAt));
  const googleStatus = await getGoogleConnectionStatus();

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Clients"
        description="Sites you're managing in this workspace. Each one gets its own dashboard, audits, tasks, and reports."
        icon={Users}
        accent="violet"
        actions={
          <div className="flex items-center gap-2">
            {googleStatus.configured && (
              <Link
                href="/clients/import"
                className={buttonVariants({
                  variant: "outline",
                  className: "border-violet-500/30 bg-violet-500/10",
                })}
              >
                <Sparkles className="size-4" />
                Import from Google
              </Link>
            )}
            <ImportClientsButton />
            <Link
              href="/clients/new"
              className={buttonVariants({
                className:
                  "shadow-lg shadow-violet-500/25 ring-1 ring-inset ring-white/15",
              })}
            >
              <Plus className="size-4" />
              Add client
            </Link>
          </div>
        }
      />

      {rows.length === 0 ? (
        <div className="relative overflow-hidden rounded-2xl border border-white/5 bg-card/40 px-6 py-16 text-center backdrop-blur-md">
          <div className="pointer-events-none absolute left-1/2 top-1/2 size-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-500/10 blur-3xl" />
          <div className="relative mx-auto flex max-w-md flex-col items-center gap-4">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-violet-500/15 ring-1 ring-violet-400/30">
              <Globe className="size-6 text-violet-300" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">No clients yet</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {googleStatus.configured
                  ? "Easiest path: import every site in your Google account in one click. Or add manually."
                  : "Add your first one — we'll auto-fetch the logo, name, address, and social links from the URL."}
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {googleStatus.configured && (
                <Link
                  href="/clients/import"
                  className={buttonVariants({
                    className: "shadow-lg shadow-violet-500/25",
                  })}
                >
                  <Sparkles className="size-4" />
                  Import from Google
                </Link>
              )}
              <Link
                href="/clients/new"
                className={buttonVariants({
                  variant: googleStatus.configured ? "outline" : "default",
                  className: googleStatus.configured
                    ? "border-white/10 bg-white/5"
                    : "shadow-lg shadow-violet-500/25",
                })}
              >
                Add manually
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white/5 bg-card/40 backdrop-blur-md">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-5 py-3 text-left font-medium">Name</th>
                <th className="px-5 py-3 text-left font-medium">URL</th>
                <th className="px-5 py-3 text-left font-medium">Niche</th>
                <th className="px-5 py-3 text-left font-medium">Tech</th>
                <th className="px-5 py-3 text-left font-medium">Added</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.map((c) => (
                <tr
                  key={c.id}
                  className="group transition-colors hover:bg-white/[0.03]"
                >
                  <td className="px-5 py-4">
                    <Link
                      href={`/clients/${c.id}`}
                      className="flex items-center gap-3"
                    >
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 text-xs font-bold text-white shadow-md shadow-violet-500/25 ring-1 ring-inset ring-white/20">
                        {c.name.slice(0, 1).toUpperCase()}
                      </div>
                      <span className="font-medium group-hover:underline">
                        {c.name}
                      </span>
                    </Link>
                  </td>
                  <td className="px-5 py-4 text-muted-foreground">
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:text-foreground hover:underline"
                    >
                      {c.url.replace(/^https?:\/\//, "")}
                    </a>
                  </td>
                  <td className="px-5 py-4">
                    {c.niche ? (
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${nicheTone[c.niche] ?? "bg-muted text-muted-foreground"}`}
                      >
                        {nicheLabels[c.niche] ?? c.niche}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    {c.techStack && c.techStack.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {c.techStack.slice(0, 3).map((t) => (
                          <Badge
                            key={t}
                            variant="outline"
                            className="border-white/10 bg-white/5 text-foreground/80"
                          >
                            {t}
                          </Badge>
                        ))}
                        {c.techStack.length > 3 && (
                          <Badge
                            variant="outline"
                            className="border-white/10 bg-white/5 text-muted-foreground"
                          >
                            +{c.techStack.length - 3}
                          </Badge>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-xs text-muted-foreground">
                    {c.createdAt.toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * Custom 404. Replaces Next's default bare "404 / This page could not be
 * found" with a helpful fallback: explains the situation, offers a few
 * popular destinations, and points at the global search so the user
 * isn't dead-ended.
 */

import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  ArrowRight,
  Bot,
  ClipboardList,
  Compass,
  FileDown,
  Home,
  Search,
  Wrench,
} from "lucide-react";
import { NotFoundPath } from "@/components/not-found-path";

export default async function NotFound() {
  const t = await getTranslations("errors.notFound");

  const popular = [
    { href: "/", label: t("links.dashboard"), icon: Home },
    { href: "/welcome", label: t("links.getStarted"), icon: Compass },
    { href: "/tools", label: t("links.tools"), icon: Wrench },
    { href: "/audits", label: t("links.audits"), icon: ClipboardList },
    { href: "/reports", label: t("links.reports"), icon: FileDown },
    { href: "/agent", label: t("links.agent"), icon: Bot },
  ];

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-2xl flex-col justify-center space-y-6 py-12">
      <div className="space-y-2">
        <div className="inline-flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] font-medium text-amber-300">
          {t("badge")}
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          {t("title")}
        </h1>
        <p className="text-[14px] text-muted-foreground">{t("body")}</p>
        <NotFoundPath />
        <p className="text-[13px] text-muted-foreground">{t("hints")}</p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {popular.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="group flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2.5 transition-colors hover:border-border/80 hover:bg-accent"
          >
            <Icon className="size-4 text-muted-foreground transition-colors group-hover:text-foreground" />
            <span className="text-[13px] font-medium text-foreground">
              {label}
            </span>
            <ArrowRight className="ml-auto size-3 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5" />
          </Link>
        ))}
      </div>

      <div className="rounded-md border border-border bg-muted/30 p-3 text-[12px] text-muted-foreground">
        <div className="flex items-center gap-2 font-medium text-foreground">
          <Search className="size-3.5 text-violet-300" />
          {t("searchTitle")}
        </div>
        <p className="mt-1">{t("searchBody")}</p>
      </div>
    </div>
  );
}

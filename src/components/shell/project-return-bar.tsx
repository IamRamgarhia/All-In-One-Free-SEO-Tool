"use client";

import { Suspense, useEffect } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { useProjectContext } from "@/lib/project-context";
import { projectIdOfRoute } from "@/lib/tool-families";
import { ToolClientContext } from "@/components/tools/client-context";

/**
 * On a tool opened for a project (`?clientId=`): the way back to that
 * project, above the page. A link opened from a client stays in that
 * client (docs/HANDOFF.md §C, rule 5); a tool page is shared by every
 * project, so it cannot carry the project's tabs itself.
 *
 * Rendered once in the root layout, so no tool page has to remember it.
 * Nothing on the project's own pages (they have the full navigation) nor
 * in the tool drawer (`?embed=1`), which sits on the project page.
 */
function Bar() {
  const t = useTranslations("tools.common");
  const pathname = usePathname() ?? "";
  const params = useSearchParams();
  const known = useProjectContext();

  const raw = Number(params?.get("clientId"));
  const id = Number.isInteger(raw) && raw > 0 ? raw : null;
  const url = params?.get("url") ?? "";
  const shown = id !== null && params?.get("embed") !== "1" && projectIdOfRoute(pathname) === null;

  // The site's address, typed for the reader. Tools that read `?url=`
  // themselves (usePresetUrl) already have it; this covers the plain
  // forms whose "url" field is not held in React state. An empty field
  // only: nothing the reader typed is replaced.
  useEffect(() => {
    if (!shown || !url) return;
    for (const el of document.querySelectorAll<HTMLInputElement>('main input[name="url"]')) {
      if (!el.value) el.value = url;
    }
  }, [shown, url, pathname]);

  if (!shown) return null;
  const back = (
    <div className="mx-auto mb-3 w-full max-w-5xl">
      <Link
        href={`/clients/${id}`}
        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
      >
        <ArrowLeft className="size-3 shrink-0" />
        {known?.id === id ? t("backToProjectNamed", { name: known.name }) : t("backToProject")}
      </Link>
    </div>
  );
  // On a tool: the client's file, with what the reader can add to it
  // (components/tools/client-context.tsx). The plain link above stays
  // the fallback while it loads, and when the client is not theirs.
  if (pathname.startsWith("/tools/")) return <ToolClientContext fallback={back} />;
  return back;
}

export function ProjectReturnBar() {
  // useSearchParams needs a boundary on statically rendered pages.
  return (
    <Suspense fallback={null}>
      <Bar />
    </Suspense>
  );
}

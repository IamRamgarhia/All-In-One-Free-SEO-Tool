"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

export function NotFoundPath() {
  const pathname = usePathname();
  const t = useTranslations("errors.notFound");

  if (!pathname || pathname === "/404") return null;

  return (
    <p className="rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-[12px] text-muted-foreground">
      {t("pathLabel")}{" "}
      <span className="text-foreground">{pathname}</span>
    </p>
  );
}

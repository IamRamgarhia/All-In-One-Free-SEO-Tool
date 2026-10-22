"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useQuickAddClient } from "./quick-add-client-dialog";

/** Globally-available "Add client" button — opens the one-field modal. */
export function AddClientButton() {
  const { open } = useQuickAddClient();
  const t = useTranslations("common");
  return (
    <button
      type="button"
      onClick={open}
      className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-violet-500/15 px-2.5 text-[13px] font-medium text-violet-200 ring-1 ring-inset ring-violet-500/30 transition-colors hover:bg-violet-500/25 hover:text-white sm:px-3"
      title={t("addClientTitle")}
    >
      <Plus className="size-3.5 shrink-0" />
      <span className="hidden sm:inline">{t("addClient")}</span>
    </button>
  );
}

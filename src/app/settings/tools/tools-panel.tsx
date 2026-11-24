"use client";

import Link from "next/link";
import { createElement, useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  ClipboardPlus,
  FileUp,
  ScanLine,
  Briefcase,
  ClipboardList,
  ExternalLink,
  FileText,
  Link2,
  MapPin,
  Megaphone,
  Plug,
  Search,
  Shuffle,
  Sparkles,
  Stethoscope,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { resolveToolCopy } from "@/lib/i18n/tool-copy";
import { MISSION_CATEGORIES, type MissionCategoryId } from "@/lib/tool-catalog";
import { familyOf } from "@/lib/tool-families";
import { NAV_ITEMS } from "@/components/shell/nav-items";
import { toolIcon } from "@/lib/tool-registry";
import { GskSheet } from "../gsk-sheet";
import { setToolEnabled } from "./actions";

export type ToolCardState = "ready" | "setup" | "off";

export type ToolCard = {
  href: string;
  category: MissionCategoryId;
  aiUsage: "none" | "partial" | "required";
  usesBrowser: boolean;
  needsGsc: boolean;
  /** Off until turned on: outside SEO work, or needs a paid key. */
  offByDefault: boolean;
  state: ToolCardState;
};

type Tab = "all" | ToolCardState;

const CATEGORY_ICONS: Record<MissionCategoryId, LucideIcon> = {
  prospecting: Briefcase,
  setup: Plug,
  audit: Stethoscope,
  strategy: Search,
  content: FileText,
  links: Link2,
  local: MapPin,
  ai: Sparkles,
  ads: Megaphone,
  reporting: TrendingUp,
  special: Shuffle,
  agency: ClipboardList,
};

/** Catalogue pages that are neither in the tool registry nor in the menu. */
const EXTRA_ICONS: Record<string, LucideIcon> = {
  "/csv-import": FileUp,
  "/report-data": ClipboardPlus,
  "/capture": ScanLine,
};

const NAV_ICONS = new Map(NAV_ITEMS.map((it) => [it.href, it.icon] as const));

/** The tool's own icon, from the registry or the menu. */
function iconOf(href: string, category: MissionCategoryId): LucideIcon {
  return toolIcon(href) ?? NAV_ICONS.get(href) ?? EXTRA_ICONS[href] ?? CATEGORY_ICONS[category];
}

const TAG: Record<ToolCardState, string> = {
  ready: "gsk-tag gsk-tag--success",
  setup: "gsk-tag gsk-tag--warning",
  off: "gsk-tag gsk-tag--default",
};

/** Name and one line for a tool, by the rule every surface shares. */
function useToolCopy() {
  const settings = useTranslations("settings.tools");
  const catalog = useTranslations("tools.catalog");
  const nav = useTranslations("nav.items");
  return (href: string) =>
    resolveToolCopy(href, { settings, catalog, nav }) ?? { title: href, description: "" };
}

export function ToolsPanel({
  cards: initial,
  canToggle,
  hasAiKey,
  gscConnected,
}: {
  cards: ToolCard[];
  canToggle: boolean;
  hasAiKey: boolean;
  gscConnected: boolean;
}) {
  const t = useTranslations("settings.tools");
  const copyOf = useToolCopy();
  const [cards, setCards] = useState(initial);
  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const withCopy = cards.map((c) => ({ ...c, ...copyOf(c.href) }));
  const q = query.trim().toLowerCase();
  const shown = withCopy.filter(
    (c) =>
      (tab === "all" || c.state === tab) &&
      (!q || c.title.toLowerCase().includes(q) || c.description.toLowerCase().includes(q)),
  );
  const counts = useMemo(() => {
    const n: Record<Tab, number> = { all: cards.length, ready: 0, setup: 0, off: 0 };
    for (const c of cards) n[c.state]++;
    return n;
  }, [cards]);

  const current = open ? withCopy.find((c) => c.href === open) ?? null : null;

  /** What a tool's state becomes when it is turned back on. */
  const onState = (c: ToolCard): ToolCardState =>
    (c.aiUsage === "required" && !hasAiKey) || (c.needsGsc && !gscConnected) ? "setup" : "ready";

  const setEnabled = (href: string, enabled: boolean) =>
    setCards((all) =>
      all.map((c) => (c.href === href ? { ...c, state: enabled ? onState(c) : "off" } : c)),
    );

  return (
    <>
      <section className="gsk-block">
        <div className="flex flex-wrap items-center gap-3">
          <div className="gsk-tabbar max-w-full overflow-x-auto" role="tablist">
            {(["all", "ready", "setup", "off"] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={tab === k}
                className="gsk-tab whitespace-nowrap"
                onClick={() => setTab(k)}
              >
                {t(`tab_${k}`)}
                <span className="gsk-tab__count">{counts[k]}</span>
              </button>
            ))}
          </div>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("search")}
            aria-label={t("search")}
            className="gsk-input ml-auto w-full sm:w-64"
          />
        </div>
        {shown.length === 0 ? <p className="gsk-help">{t("empty")}</p> : null}
      </section>

      {MISSION_CATEGORIES.map((cat) => {
        const list = shown.filter((c) => c.category === cat);
        if (list.length === 0) return null;
        const Icon = CATEGORY_ICONS[cat];
        return (
          <section key={cat} className="gsk-block" aria-labelledby={`tools-cat-${cat}`}>
            <div className="gsk-block-head">
              <h2 id={`tools-cat-${cat}`} className="gsk-block-title flex items-center gap-2">
                <Icon className="size-4" strokeWidth={1.75} />
                {t(`categories.${cat}.label`)}
                <span className="gsk-tab__count">{t("count", { count: list.length })}</span>
              </h2>
              <p className="gsk-block-description">{t(`categories.${cat}.description`)}</p>
            </div>
            <div className="gsk-card-grid">
              {list.map((c) => (
                <button
                  key={c.href}
                  type="button"
                  className={c.state === "ready" ? "gsk-card gsk-card--on items-start" : "gsk-card items-start"}
                  onClick={() => setOpen(c.href)}
                  aria-haspopup="dialog"
                >
                  <span className="gsk-card__badge" aria-hidden>
                    <ToolIcon href={c.href} category={c.category} />
                  </span>
                  <span className="gsk-card__body">
                    <span className="gsk-card__header">
                      <span className="gsk-card__title">{c.title}</span>
                    </span>
                    {c.description ? (
                      <span className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-[var(--gsk-text-2)]">
                        {c.description}
                      </span>
                    ) : null}
                    <span className="gsk-card__subtitle mt-1.5">
                      <span className={TAG[c.state]}>{t(c.state)}</span>
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        );
      })}

      {current ? (
        <ToolSheet
          key={current.href}
          card={current}
          canToggle={canToggle}
          hasAiKey={hasAiKey}
          gscConnected={gscConnected}
          onToggle={setEnabled}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </>
  );
}

function ToolSheet({
  card: c,
  canToggle,
  hasAiKey,
  gscConnected,
  onToggle,
  onClose,
}: {
  card: ToolCard & { title: string; description: string };
  canToggle: boolean;
  hasAiKey: boolean;
  gscConnected: boolean;
  onToggle: (href: string, enabled: boolean) => void;
  onClose: () => void;
}) {
  const t = useTranslations("settings.tools");
  const tFamilies = useTranslations("toolFamilies");
  const family = familyOf(c.href)?.family ?? null;
  const [pending, startTransition] = useTransition();
  const enabled = c.state !== "off";

  const toggle = (next: boolean) => {
    onToggle(c.href, next);
    startTransition(async () => {
      const r = await setToolEnabled(c.href, next).catch(() => ({ ok: false }));
      if (!r.ok) onToggle(c.href, !next);
    });
  };

  return (
    <GskSheet
      title={c.title}
      subtitle={`${t(`categories.${c.category}.label`)} · ${t(c.state)}`}
      icon={<ToolIcon href={c.href} category={c.category} />}
      closeLabel={t("close")}
      onClose={onClose}
    >
      <div className="gsk-drawer__body">
        {c.description ? (
          <p className="m-0 text-[13px] leading-relaxed text-[var(--gsk-text-2)]">{c.description}</p>
        ) : null}

        {family ? (
          <div>
            <h4 className="gsk-section-title">{t("sheetIncludes")}</h4>
            <ul className="m-0 list-none space-y-1.5 p-0 text-[13px]">
              {family.members.map((m) => (
                <li key={m.href}>
                  <Link href={m.href} className="hover:underline" onClick={onClose}>
                    {tFamilies(`${family.id}.tabs.${m.tab}`)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div>
          <h4 className="gsk-section-title">{t("sheetNeeds")}</h4>
          <ul className="m-0 list-none space-y-3 p-0 text-[13px]">
            <Need
              label={t("needAi")}
              ok={c.aiUsage !== "required" || hasAiKey}
              detail={
                c.aiUsage === "required"
                  ? `${t("needAiRequired")} ${hasAiKey ? t("configured") : t("missing")}`
                  : c.aiUsage === "partial"
                    ? t("needAiPartial")
                    : t("needAiNone")
              }
              fixHref={c.aiUsage !== "none" && !hasAiKey ? "/settings/ai" : null}
              fixLabel={t("configure")}
            />
            {c.needsGsc ? (
              <Need
                label={t("needGsc")}
                ok={gscConnected}
                detail={gscConnected ? t("needGscOk") : t("needGscMissing")}
                fixHref={gscConnected ? null : "/settings/google"}
                fixLabel={t("configure")}
              />
            ) : null}
            {c.usesBrowser ? (
              <Need label={t("needBrowser")} ok detail={t("needBrowserHint")} />
            ) : null}
          </ul>
        </div>

        <div className="gsk-row">
          <div className="gsk-row-info">
            <label className="gsk-row-label" htmlFor="tool-enabled">
              {t("enabled")}
            </label>
            <p className="gsk-row-desc">{canToggle ? t("enabledHint") : t("adminOnly")}</p>
            {c.offByDefault ? <p className="gsk-row-desc">{t("offByDefault")}</p> : null}
          </div>
          <div className="gsk-row-control">
            <input
              id="tool-enabled"
              type="checkbox"
              role="switch"
              className="gsk-switch"
              checked={enabled}
              disabled={!canToggle || pending}
              onChange={(e) => toggle(e.target.checked)}
            />
          </div>
        </div>
      </div>

      <footer className="gsk-drawer__footer">
        <div />
        <Link href={c.href} className="gsk-btn gsk-btn--primary" onClick={onClose}>
          {t("open")}
          <ExternalLink className="size-3.5" />
        </Link>
      </footer>
    </GskSheet>
  );
}

function Need({
  label,
  ok,
  detail,
  fixHref = null,
  fixLabel,
}: {
  label: string;
  ok: boolean;
  detail: string;
  fixHref?: string | null;
  fixLabel?: string;
}) {
  return (
    <li className="flex items-start gap-2">
      <span className={ok ? "gsk-dot gsk-dot--on mt-1.5" : "gsk-dot mt-1.5"} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-[var(--gsk-text-1)]">{label}</span>
        <span className="block text-[var(--gsk-text-2)]">{detail}</span>
      </span>
      {fixHref ? (
        <Link href={fixHref} className="gsk-btn shrink-0">
          {fixLabel}
        </Link>
      ) : null}
    </li>
  );
}

function ToolIcon({ href, category }: { href: string; category: MissionCategoryId }) {
  // createElement, not <Icon />: the icon is looked up, not declared here.
  return createElement(iconOf(href, category), { className: "size-4", strokeWidth: 1.75 });
}

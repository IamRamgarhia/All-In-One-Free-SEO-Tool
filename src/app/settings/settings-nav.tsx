"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Fragment, useEffect } from "react";
import { useTranslations } from "next-intl";
import {
  Activity,
  Archive,
  Bell,
  Brain,
  Bug,
  Cloud,
  Database,
  Gauge,
  Globe,
  Key,
  Mail,
  Palette,
  Plug,
  Settings,
  Shield,
  Sparkles,
  UserRound,
  Users2,
  Wrench,
  type LucideIcon,
  Search,
} from "lucide-react";
import {
  LEGACY_ANCHORS,
  SETTINGS_NAV,
  activeSettingsItem,
  type SettingsIconName,
} from "./nav";

const ICONS: Record<SettingsIconName, LucideIcon> = {
  user: UserRound,
  settings: Settings,
  sparkles: Sparkles,
  gauge: Gauge,
  brain: Brain,
  wrench: Wrench,
  plug: Plug,
  mail: Mail,
  search: Search,
  bell: Bell,
  key: Key,
  palette: Palette,
  users: Users2,
  database: Database,
  archive: Archive,
  globe: Globe,
  cloud: Cloud,
  activity: Activity,
  bug: Bug,
  shield: Shield,
};

export function SettingsNav({ isOwner }: { isOwner: boolean }) {
  const t = useTranslations("settings.nav");
  const pathname = usePathname();
  const router = useRouter();
  const active = activeSettingsItem(pathname);

  // /settings#ai and friends: the hash never reaches the server, so the
  // old single-page anchors are resolved here.
  useEffect(() => {
    if (pathname !== "/settings") return;
    const target = LEGACY_ANCHORS[window.location.hash.slice(1)];
    if (target && target !== "/settings") router.replace(target);
  }, [pathname, router]);

  const groups = SETTINGS_NAV.map((g) => ({
    ...g,
    items: g.items.filter((i) => isOwner || !i.ownerOnly),
  })).filter((g) => g.items.length > 0);

  return (
    <>
      {/* Phones: one scrolling row of sections. */}
      <div className="gsk-tabs" role="navigation" aria-label={t("aria")}>
        {groups.flatMap((g) => g.items).map((item) => {
          const Icon = ICONS[item.icon];
          return (
            <Link
              key={item.id}
              href={item.href}
              aria-current={active?.id === item.id ? "page" : undefined}
              className="gsk-nav-item"
            >
              <Icon className="gsk-nav-icon" strokeWidth={1.75} />
              {t(`items.${item.id}`)}
            </Link>
          );
        })}
      </div>

      {/* Desktop: the rail. */}
      <nav aria-label={t("aria")} className="gsk-nav">
        {groups.map((g) => (
          <Fragment key={g.id}>
            <div className="gsk-nav-group-title">{t(`groups.${g.id}`)}</div>
            {g.items.map((item) => {
              const Icon = ICONS[item.icon];
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  aria-current={active?.id === item.id ? "page" : undefined}
                  className="gsk-nav-item"
                >
                  <Icon className="gsk-nav-icon" strokeWidth={1.75} />
                  <span className="flex-1">{t(`items.${item.id}`)}</span>
                </Link>
              );
            })}
          </Fragment>
        ))}
      </nav>
    </>
  );
}

import { SearchPalette } from "./search-palette";
import { NotificationsBell } from "./notifications-bell";
import { MobileNav } from "./mobile-nav";
import { AiUsagePill } from "./ai-usage-pill";
import { ProfileMenu } from "./profile-menu";
import { NextStep } from "./next-step";
import { ThemeToggle } from "./theme-toggle";
import { getUiMode } from "@/app/settings/ui-actions";
import type { ThemePreference } from "@/app/settings/theme-actions";

export async function TopBar({
  unreadByHref,
  theme = "system",
}: {
  unreadByHref?: Record<string, number>;
  theme?: ThemePreference;
}) {
  const mode = await getUiMode();
  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background px-4">
      <MobileNav unreadByHref={unreadByHref} />
      <SearchPalette />
      <NextStep />
      <div className="ml-auto flex items-center gap-1">
        {/* NO dot legend here.

            It was moved to the top bar because the foot of the rail hid
            it when the sidebar collapsed. But the per-client tools panel
            renders its own ToolDotLegend right above the dots it
            describes — so the two existed at once, and the top bar was
            explaining a colour code for dots that are not in the top
            bar, on every page, including pages with no dots at all.

            That is the same shape as the profile block and the
            guided/pro toggle that were duplicated between the rail and
            this bar until 30 Oct: global chrome carrying something that
            belongs beside the thing it is about. A legend goes next to
            its dots.

            The nav rail's own dots keep the same words as a tooltip, so
            nothing here is now unexplained. */}
        {/* Three things left this bar on 19 Nov, asked for directly:
            the AI spend pill, "+ Add client", and the guided/pro
            toggle.

            What they had in common: none was about the page underneath
            them. A client page's own heading sat below a row carrying
            an install-wide spend figure, a global create button and a
            preference set once a year — permanent width, on every
            screen, for things you touch rarely or that belong
            elsewhere.

            Spend and detail level are now in the profile menu, which is
            where "about me and my install" already lives (Settings,
            Team, AI keys, Backup). "+ Add client" is on /clients, which
            already had its own prominent button — so this was the
            second copy, and the one further from where you look for it.

            Search, the next-step banner, theme, notifications and the
            profile menu stay: each is either page-agnostic by nature or
            needed from anywhere. */}
        <ThemeToggle theme={theme} />
        <NotificationsBell />
        <ProfileMenu mode={mode} aiUsage={<AiUsagePill />} />
      </div>
    </header>
  );
}

import { SearchPalette } from "./search-palette";
import { NotificationsBell } from "./notifications-bell";
import { ModeToggle } from "./mode-toggle";
import { AddClientButton } from "./add-client-button";
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
        <AiUsagePill />
        <AddClientButton />
        <ThemeToggle theme={theme} />
        <ModeToggle mode={mode} />
        <NotificationsBell />
        <ProfileMenu />
      </div>
    </header>
  );
}

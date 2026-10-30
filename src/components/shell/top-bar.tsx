import { SearchPalette } from "./search-palette";
import { NotificationsBell } from "./notifications-bell";
import { ModeToggle } from "./mode-toggle";
import { AddClientButton } from "./add-client-button";
import { MobileNav } from "./mobile-nav";
import { AiUsagePill } from "./ai-usage-pill";
import { ProfileMenu } from "./profile-menu";
import { NextStep } from "./next-step";
import { ThemeToggle } from "./theme-toggle";
import { ToolDotLegend } from "@/components/tool-dot";
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
        {/* What the sidebar's green/amber dots mean. It used to live at
            the foot of the rail, where a collapsed sidebar hid it; here
            it is visible either way.
            xl, not lg: measured at 1024px the legend's ~120px tipped
            this row into 9px of overflow and the next-step banner and
            the AI-spend pill drew on top of each other. Below xl the
            dots still carry the same words as a tooltip. */}
        <div className="mr-2 hidden shrink-0 xl:block">
          <ToolDotLegend wrap={false} />
        </div>
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

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
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background px-3 sm:gap-3 sm:px-4">
      <MobileNav unreadByHref={unreadByHref} />
      <div className="min-w-0 flex-1">
        <SearchPalette />
      </div>
      <div className="hidden min-w-0 lg:block">
        <NextStep />
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-1">
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

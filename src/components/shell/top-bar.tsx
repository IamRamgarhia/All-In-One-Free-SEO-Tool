import { SearchPalette } from "./search-palette";
import { NotificationsBell } from "./notifications-bell";
import { ModeToggle } from "./mode-toggle";
import { AddClientButton } from "./add-client-button";
import { MobileNav } from "./mobile-nav";
import { AiUsagePill } from "./ai-usage-pill";
import { ProfileMenu } from "./profile-menu";
import { NextStep } from "./next-step";
import { getUiMode } from "@/app/settings/ui-actions";

export async function TopBar({
  unreadByHref,
}: {
  unreadByHref?: Record<string, number>;
}) {
  const mode = await getUiMode();
  return (
    <header
      data-shell-chrome="topbar"
      className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background px-4"
    >
      <MobileNav unreadByHref={unreadByHref} />
      <SearchPalette />
      <NextStep />
      <div className="ml-auto flex items-center gap-1">
        <AiUsagePill />
        <AddClientButton />
        <ModeToggle mode={mode} />
        <NotificationsBell />
        <ProfileMenu />
      </div>
    </header>
  );
}

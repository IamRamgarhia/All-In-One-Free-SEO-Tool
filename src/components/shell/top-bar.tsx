import { SearchPalette } from "./search-palette";
import { NotificationsBell } from "./notifications-bell";
import { ModeToggle } from "./mode-toggle";
import { AddClientButton } from "./add-client-button";
import { MobileNav } from "./mobile-nav";
import { getUiMode } from "@/app/settings/ui-actions";

export async function TopBar({
  unreadByHref,
}: {
  unreadByHref?: Record<string, number>;
}) {
  const mode = await getUiMode();
  return (
    <header className="glass-apple sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-white/[0.06] px-4 md:px-6">
      <MobileNav unreadByHref={unreadByHref} />
      <SearchPalette />
      <div className="ml-auto flex items-center gap-2">
        <AddClientButton />
        <ModeToggle mode={mode} />
        <NotificationsBell />
        <div className="relative size-8 rounded-full bg-gradient-to-br from-violet-500 via-fuchsia-500 to-indigo-600 grid place-items-center text-xs font-semibold text-white shadow-lg shadow-violet-500/40 ring-1 ring-inset ring-white/30">
          <span className="relative">P</span>
          <span className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-br from-white/30 to-transparent opacity-50" />
        </div>
      </div>
    </header>
  );
}

import Link from "next/link";
import { ClipboardList, Building2 } from "lucide-react";

export default function CabinetLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-white/5 bg-card/40 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-3">
            <Building2 className="size-5 text-cyan-300" />
            <div>
              <div className="text-sm font-semibold tracking-tight">
                Cabinet d&apos;audit
              </div>
              <div className="text-[11px] text-muted-foreground">
                SEOmator · historique · plan d&apos;action
              </div>
            </div>
          </div>
          <nav className="flex items-center gap-1 text-sm">
            <Link
              href="/cabinet"
              className="rounded-lg px-3 py-1.5 text-muted-foreground hover:bg-white/5 hover:text-foreground"
            >
              Clients
            </Link>
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-muted-foreground hover:bg-white/5 hover:text-foreground"
            >
              <ClipboardList className="size-3.5" />
              SEO Tool
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  );
}

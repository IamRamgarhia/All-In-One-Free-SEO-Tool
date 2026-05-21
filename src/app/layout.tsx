import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { headers } from "next/headers";
import { Sidebar } from "@/components/shell/sidebar";
import { TopBar } from "@/components/shell/top-bar";
import { AIAssistant } from "@/components/shell/ai-assistant";
import { PowerWidget } from "@/components/shell/power-widget";
import { FirstRunPrompt } from "@/components/shell/first-run-prompt";
import { Toaster } from "@/components/shell/toaster";
import { ConfirmDialogProvider } from "@/components/ui/confirm-dialog";
import { ServiceWorkerRegister } from "@/components/shell/sw-register";
import { ClientErrorCapture } from "@/components/shell/client-error-capture";
import { QuickAddClientProvider } from "@/components/shell/quick-add-client-dialog";
import { ShortcutsHelpHotkey } from "@/components/shell/shortcuts-help-hotkey";
import { getUnreadCounts } from "@/lib/unread-counts";
import { getUiMode } from "./settings/ui-actions";
import "./globals.css";

// Inter is warmer + more readable at small sizes than Geist's precise grotesk.
// Same web-safe quality; same variable-weight support.
const sansFont = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const monoFont = JetBrains_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "SEO Tool",
  description: "Self-hosted SEO platform — free, modern, beginner-friendly.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "SEO Tool",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#7c3aed",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Fetch unread counts so the sidebar can render badges next to sections
  // with new content. Failure is non-fatal — empty counts = no badges.
  let unreadByHref: Record<string, number> = {};
  try {
    const u = await getUnreadCounts();
    unreadByHref = {
      "/news": u.news,
      "/agent": u.suggestions,
      "/monitor": u.pageChanges,
      "/settings": u.updateAvailable,
    };
  } catch {
    unreadByHref = {};
  }

  const uiMode = await getUiMode();

  // Server-side embed detection. The middleware sees ?embed=1 in the
  // request URL and forwards it as an x-embed header (see
  // src/middleware.ts). When set, we render a minimal shell — no
  // sidebar, no top-bar, no floating widgets — so the per-client tool
  // drawer's iframe shows ONLY the tool content. No client script, no
  // flash, no late hydration.
  const isEmbed = (await headers()).get("x-embed") === "1";

  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-ui-mode={uiMode}
      data-embed={isEmbed ? "1" : undefined}
      className={`dark ${sansFont.variable} ${monoFont.variable} h-full antialiased`}
    >
      <body className="h-screen overflow-hidden bg-background text-foreground">
        <ConfirmDialogProvider>
          <QuickAddClientProvider>
            {isEmbed ? (
              // Minimal embedded shell — just the page content. The
              // host (drawer) owns the chrome.
              <main className="h-full overflow-y-auto p-4 md:p-6">
                {children}
              </main>
            ) : (
              <>
                <div className="flex h-full">
                  <Sidebar unreadByHref={unreadByHref} uiMode={uiMode} />
                  <div className="flex h-full min-w-0 flex-1 flex-col">
                    <TopBar unreadByHref={unreadByHref} />
                    <main className="flex-1 overflow-y-auto p-4 md:p-6">
                      {children}
                    </main>
                  </div>
                </div>
                <AIAssistant />
                <PowerWidget />
                <FirstRunPrompt />
              </>
            )}
            <Toaster />
            <ServiceWorkerRegister />
            <ClientErrorCapture />
            <ShortcutsHelpHotkey />
          </QuickAddClientProvider>
        </ConfirmDialogProvider>
      </body>
    </html>
  );
}

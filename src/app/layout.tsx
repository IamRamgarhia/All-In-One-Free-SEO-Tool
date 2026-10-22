import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { headers } from "next/headers";
import { getLocale, getMessages } from "next-intl/server";
import { Sidebar } from "@/components/shell/sidebar";
import { NeedsKeyBanner } from "@/components/shell/needs-key-banner";
import { IntlProvider } from "@/components/shell/intl-provider";
import { getAiAvailability } from "@/lib/ai-availability";
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
import { currentUser } from "@/lib/auth";
import { getUiMode } from "./settings/ui-actions";
import { getThemePreference } from "./settings/theme-actions";
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
  title: "global_rank",
  description: "Console agence · audits, positions, IA, rapports · global-rank.io",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icon.ico?v=6", sizes: "32x32" },
      { url: "/icon.svg?v=6", type: "image/svg+xml" },
    ],
    shortcut: [{ url: "/icon.ico?v=6" }],
    apple: [{ url: "/icon.svg?v=6", type: "image/svg+xml" }],
  },
  appleWebApp: {
    capable: true,
    title: "global_rank",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#1a2744",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const reqHeadersForShell = await headers();
  const skipAppShell =
    reqHeadersForShell.get("x-embed") === "1" ||
    reqHeadersForShell.get("x-auth-page") === "1";

  // Fetch unread counts so the sidebar can render badges next to sections
  // with new content. Failure is non-fatal — empty counts = no badges.
  let unreadByHref: Record<string, number> = {};
  let uiMode: Awaited<ReturnType<typeof getUiMode>> = "guided";
  let userRole: string | null = null;
  let aiAvailability: Awaited<ReturnType<typeof getAiAvailability>> = {
    available: false,
    hasKey: false,
    hasSubscription: false,
    client: null,
  };

  if (!skipAppShell) {
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

    uiMode = await getUiMode();
    const me = await currentUser().catch(() => null);
    userRole = me?.role ?? null;

    aiAvailability = await getAiAvailability().catch(() => ({
      available: false,
      hasKey: false,
      hasSubscription: false,
      client: null,
    }));
  }

  const isEmbed = reqHeadersForShell.get("x-embed") === "1";
  const isAuthPage = reqHeadersForShell.get("x-auth-page") === "1";

  // Theme. `dark` used to be hardcoded here, which made the whole app
  // dark-only with no toggle and no way to follow the OS preference —
  // awkward in a bright office, and worse on the client-facing portal.
  //
  // "system" can only be resolved in the browser, so the class is
  // applied by the inline script below before first paint. Explicit
  // light/dark is resolved here on the server, which avoids the flash
  // entirely for users who have chosen one.
  const theme = await getThemePreference();
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      data-ui-mode={uiMode}
      data-theme={theme}
      data-embed={isEmbed ? "1" : undefined}
      className={`${theme === "dark" ? "dark" : ""} ${sansFont.variable} ${monoFont.variable} h-full antialiased`}
    >
      <head>
        {/*
          Runs before first paint, so a "system" user never sees a
          white flash before the dark class lands (or vice versa).
          Deliberately tiny and dependency-free — it blocks rendering.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=document.documentElement.dataset.theme;if(t==="system"){var d=window.matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.classList.toggle("dark",d);}}catch(e){}})();`,
          }}
        />
      </head>
      <body
        className={
          isAuthPage
            ? "h-svh overflow-hidden bg-background text-foreground"
            : "h-screen overflow-hidden bg-background text-foreground"
        }
      >
        <IntlProvider locale={locale} messages={messages}>
          <ConfirmDialogProvider>
            <QuickAddClientProvider>
              {isAuthPage ? (
                // Auth pages: login/register/invite only — no app chrome.
                children
              ) : isEmbed ? (
                // Minimal embedded shell — just the page content. The
                // host (drawer) owns the chrome.
                <main className="h-full overflow-y-auto p-4 md:p-6">
                  {children}
                </main>
              ) : (
                <>
                  <div className="flex h-full">
                    <Sidebar
                      unreadByHref={unreadByHref}
                      uiMode={uiMode}
                      hasAiKey={aiAvailability.hasKey}
                      userRole={userRole}
                    />
                    <div className="flex h-full min-w-0 flex-1 flex-col">
                      <TopBar
                        unreadByHref={unreadByHref}
                        theme={theme}
                        userRole={userRole}
                      />
                      <main className="flex-1 overflow-y-auto overflow-x-hidden p-3 pb-24 sm:p-4 sm:pb-20 md:p-6 md:pb-6">
                        {/* One place, so all 38 AI pages say the same thing
                            — and /agent, /blog and the assistant too, not
                            only /tools/*. */}
                        <NeedsKeyBanner
                          hasKey={aiAvailability.hasKey}
                          hasSubscription={aiAvailability.hasSubscription}
                          client={aiAvailability.client}
                        />
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
        </IntlProvider>
      </body>
    </html>
  );
}

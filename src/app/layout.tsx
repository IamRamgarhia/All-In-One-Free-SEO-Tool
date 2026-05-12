import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Sidebar } from "@/components/shell/sidebar";
import { TopBar } from "@/components/shell/top-bar";
import { EmbedModeToggle } from "@/components/shell/embed-mode";
import { AIAssistant } from "@/components/shell/ai-assistant";
import { PowerWidget } from "@/components/shell/power-widget";
import { FirstRunPrompt } from "@/components/shell/first-run-prompt";
import { Toaster } from "@/components/shell/toaster";
import { ConfirmDialogProvider } from "@/components/ui/confirm-dialog";
import { ServiceWorkerRegister } from "@/components/shell/sw-register";
import { ClientErrorCapture } from "@/components/shell/client-error-capture";
import { QuickAddClientProvider } from "@/components/shell/quick-add-client-dialog";
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

  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-ui-mode={uiMode}
      className={`dark ${sansFont.variable} ${monoFont.variable} h-full antialiased`}
    >
      <head>
        {/*
          Synchronous embed-mode detection. Runs before React hydrates so
          the chrome-hiding CSS rule kicks in on the very first paint —
          no flash of full-shell content inside iframes that load with
          ?embed=1 (used by the per-client tool drawer).
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(new URL(location.href).searchParams.get('embed')==='1')document.documentElement.dataset.embed='1';}catch(e){}`,
          }}
        />
      </head>
      <body className="h-screen overflow-hidden bg-background text-foreground">
        <EmbedModeToggle />
        <ConfirmDialogProvider>
          <QuickAddClientProvider>
            <div className="flex h-full">
              <Sidebar unreadByHref={unreadByHref} />
              <div className="flex h-full min-w-0 flex-1 flex-col">
                <TopBar unreadByHref={unreadByHref} />
                <main className="flex-1 overflow-y-auto p-4 md:p-6">
                  {children}
                </main>
              </div>
            </div>
            <div data-shell-chrome="ambient">
              <AIAssistant />
              <PowerWidget />
              <FirstRunPrompt />
            </div>
            <Toaster />
            <ServiceWorkerRegister />
            <ClientErrorCapture />
          </QuickAddClientProvider>
        </ConfirmDialogProvider>
      </body>
    </html>
  );
}

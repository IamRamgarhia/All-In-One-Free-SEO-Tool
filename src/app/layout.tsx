import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Sidebar } from "@/components/shell/sidebar";
import { TopBar } from "@/components/shell/top-bar";
import { AIAssistant } from "@/components/shell/ai-assistant";
import { PowerWidget } from "@/components/shell/power-widget";
import { Toaster } from "@/components/shell/toaster";
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
      <body className="h-screen overflow-hidden bg-background text-foreground">
        <QuickAddClientProvider>
          <div className="flex h-full">
            <Sidebar unreadByHref={unreadByHref} />
            <div className="flex h-full min-w-0 flex-1 flex-col">
              <TopBar unreadByHref={unreadByHref} />
              <main className="flex-1 overflow-y-auto px-8 py-8">
                {children}
              </main>
            </div>
          </div>
          <AIAssistant />
          <PowerWidget />
          <Toaster />
          <ServiceWorkerRegister />
          <ClientErrorCapture />
        </QuickAddClientProvider>
      </body>
    </html>
  );
}

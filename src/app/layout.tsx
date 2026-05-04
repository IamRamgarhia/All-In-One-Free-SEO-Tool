import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Sidebar } from "@/components/shell/sidebar";
import { TopBar } from "@/components/shell/top-bar";
import { AIAssistant } from "@/components/shell/ai-assistant";
import { ServiceWorkerRegister } from "@/components/shell/sw-register";
import { QuickAddClientProvider } from "@/components/shell/quick-add-client-dialog";
import { getUnreadCounts } from "@/lib/unread-counts";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
    };
  } catch {
    unreadByHref = {};
  }

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
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
          <ServiceWorkerRegister />
        </QuickAddClientProvider>
      </body>
    </html>
  );
}

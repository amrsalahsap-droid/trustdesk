import type { Metadata } from "next";
import { Geist, Geist_Mono, Outfit, Inter } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/ui/toast";

// Import dev cache helpers in development
if (process.env.NODE_ENV === 'development') {
  import("@/lib/dev-cache-reset");
  import("@/lib/dev-cache-buster");
}

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TrustDesk",
  description: "Enterprise questionnaire automation platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Apply cache-busting in development to prevent stale UI between browsers
  if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
    const { bustCriticalAssets } = require("@/lib/dev-cache-buster");
    // Execute after a short delay to ensure DOM is ready
    setTimeout(() => {
      try {
        bustCriticalAssets();
      } catch (error) {
        console.warn('Cache-busting failed:', error);
      }
    }, 1000);
  }

  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${outfit.variable} ${inter.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <ToastProvider>
          {children}
        </ToastProvider>
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Archivo, IBM_Plex_Mono } from "next/font/google";
import { themeScript } from "@/components/ThemeToggle";
import { ToastProvider } from "@/components/Toast";
import "./globals.css";

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");

export const metadata: Metadata = {
  metadataBase: siteUrl ? new URL(siteUrl) : undefined,
  title: {
    default: "anyupload — a transfer desk for your files",
    template: "%s · anyupload",
  },
  description:
    "Move files, folders, and text between devices without an account, an app, or a cable. The browser sends directly to the bucket; any other device can collect it.",
  applicationName: "anyupload",
  keywords: ["file transfer", "send files", "upload", "share files", "anyupload"],
  openGraph: {
    type: "website",
    siteName: "anyupload",
    title: "anyupload — a transfer desk for your files",
    description:
      "Send files from one device. Collect them on another. No account, no app, no cable.",
    url: siteUrl ?? "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "anyupload",
    description: "Send files from one device. Collect them on another.",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f1ece2" },
    { media: "(prefers-color-scheme: dark)", color: "#141210" },
  ],
  colorScheme: "light dark",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${archivo.variable} ${plexMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Applies the saved theme before the first paint. */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex min-h-full flex-col">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}

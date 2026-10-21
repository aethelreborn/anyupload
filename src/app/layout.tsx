import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { themeScript } from "@/components/ThemeToggle";
import { ToastProvider } from "@/components/Toast";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");

export const metadata: Metadata = {
  metadataBase: siteUrl ? new URL(siteUrl) : undefined,
  title: {
    default: "anyupload — send and receive files from anywhere",
    template: "%s · anyupload",
  },
  description:
    "Upload any file, folder, or text from one device and pick it up on another. Files travel browser-to-bucket directly, so size limits do not get in the way.",
  applicationName: "anyupload",
  keywords: ["file transfer", "send files", "upload", "share files", "anyupload"],
  openGraph: {
    type: "website",
    siteName: "anyupload",
    title: "anyupload — send and receive files from anywhere",
    description:
      "Upload any file, folder, or text from one device and pick it up on another.",
    url: siteUrl ?? "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "anyupload",
    description: "Send a file from one device, pick it up on another.",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7f9" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0b0e" },
  ],
  colorScheme: "light dark",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
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

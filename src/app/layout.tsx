import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Geist, Geist_Mono } from "next/font/google";
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
  title: {
    default: "anyupload — send and receive files from anywhere",
    template: "%s · anyupload",
  },
  description:
    "Upload any file, folder, or text from one device and pick it up on another. Files travel browser-to-bucket directly, so size limits do not get in the way.",
  applicationName: "anyupload",
  openGraph: {
    title: "anyupload",
    description: "Send and receive files from anywhere.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

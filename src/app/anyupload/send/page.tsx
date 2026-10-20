import type { Metadata } from "next";
import { SendClient } from "@/components/SendClient";

export const metadata: Metadata = {
  title: "Send",
  description: "Upload files, folders or text and get a shareable link.",
};

export default function SendPage() {
  return <SendClient />;
}

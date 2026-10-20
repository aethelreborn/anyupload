import type { Metadata } from "next";
import { ReceiveClient } from "@/components/ReceiveClient";

export const metadata: Metadata = {
  title: "Receive",
  description: "Everything that has been sent, ready to download.",
};

export default function ReceivePage() {
  return <ReceiveClient />;
}

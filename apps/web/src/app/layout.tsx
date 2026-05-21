import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "TravelSafe — San Diego",
  description:
    "Area-level safety awareness for the San Diego region. Not surveillance; not a substitute for emergency services.",
  manifest: "/manifest.json",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

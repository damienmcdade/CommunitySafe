"use client";
import type { ReactNode } from "react";
import Link from "next/link";
import { TabNav } from "@/components/TabNav";
import { CitySelector } from "@/components/CitySelector";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {/* No sign-in / sign-out controls: every device is automatically issued
          an anonymous session by SessionBootstrap (mounted in the root layout).
          Browsing, posting, check-in timer, and live-share all work with no
          visible account flow. */}
      <header className="bg-white/80 backdrop-blur border-b border-sand-200 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <Link href="/" className="font-display text-xl text-slate2-900 transition-colors hover:text-bay-700">
            <span className="bg-gradient-to-r from-bay-700 to-coral-500 bg-clip-text text-transparent">Travel</span>Safe
          </Link>
          <div className="flex items-center gap-2 text-xs text-slate2-500">
            <CitySelector />
          </div>
        </div>
      </header>
      <TabNav />
      <div key={typeof window === "undefined" ? "ssr" : window.location.pathname} className="max-w-5xl mx-auto px-4 py-8 animate-fade-in">
        {children}
      </div>
    </>
  );
}

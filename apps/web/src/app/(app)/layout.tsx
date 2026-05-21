import type { ReactNode } from "react";
import Link from "next/link";
import { TabNav } from "@/components/TabNav";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="bg-white border-b border-sand-200">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/" className="font-display text-xl text-slate2-900">TravelSafe</Link>
          <span className="text-xs text-slate2-500">San Diego, CA</span>
        </div>
      </header>
      <TabNav />
      <div className="max-w-5xl mx-auto px-4 py-8">{children}</div>
    </>
  );
}

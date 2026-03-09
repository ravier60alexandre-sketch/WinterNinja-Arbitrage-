"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/formatters";
import { APP_NAME, BOT_STATE_COLORS } from "@/lib/constants";
import { useBotStore } from "@/store/botStore";

const NAV_ITEMS = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
  },
  {
    href: "/spread-analyzer",
    label: "Spread Analyzer",
    icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
  },
  {
    href: "/admin",
    label: "Admin",
    icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z",
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const bots = useBotStore((s) => s.bots);
  const runningCount = bots.filter((b) => b.state === "RUNNING").length;

  return (
    <aside className="w-60 bg-bg-surface border-r border-bg-border flex flex-col h-screen sticky top-0">
      {/* Logo */}
      <div className="p-4 border-b border-bg-border">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-accent-indigo/20 flex items-center justify-center">
            <span className="text-accent-indigo font-bold text-sm">H</span>
          </div>
          <span className="text-sm font-semibold text-text-primary">{APP_NAME}</span>
        </Link>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {/* Main Nav */}
        <p className="px-3 text-[9px] text-text-secondary/50 uppercase tracking-widest mb-2">Navigation</p>
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors",
                isActive
                  ? "bg-accent-indigo/20 text-accent-indigo font-medium"
                  : "text-text-secondary hover:text-text-primary hover:bg-bg-border/50"
              )}
            >
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
              </svg>
              {item.label}
              {item.href === "/dashboard" && runningCount > 0 && (
                <span className="ml-auto px-1.5 py-0.5 bg-accent-green/20 text-accent-green rounded-full text-[9px] font-bold">
                  {runningCount}
                </span>
              )}
            </Link>
          );
        })}

        {/* XYZ Short */}
        <div className="pt-4">
          <p className="px-3 text-[9px] text-accent-red/70 uppercase tracking-widest mb-1.5">XYZ Short</p>
          {bots.filter((b) => b.direction === "long_a_short_b").map((bot) => (
            <Link
              key={bot.id}
              href={`/dashboard/${bot.id}`}
              className={cn(
                "flex items-center justify-between px-3 py-1.5 rounded-lg text-xs transition-colors",
                pathname === `/dashboard/${bot.id}`
                  ? "bg-bg-border text-text-primary"
                  : "text-text-secondary hover:text-text-primary hover:bg-bg-border/30"
              )}
            >
              <span>vs {bot.deployer}</span>
              <span className="flex items-center gap-1.5">
                {bot.connected && (
                  <span className={cn(
                    "w-1.5 h-1.5 rounded-full inline-block",
                    bot.state === "RUNNING" ? "bg-accent-green animate-pulse" : "bg-accent-green"
                  )} />
                )}
                <span className={cn("text-[10px]", BOT_STATE_COLORS[bot.state])}>
                  {bot.state}
                </span>
              </span>
            </Link>
          ))}
        </div>

        {/* XYZ Long */}
        <div className="pt-3">
          <p className="px-3 text-[9px] text-accent-green/70 uppercase tracking-widest mb-1.5">XYZ Long</p>
          {bots.filter((b) => b.direction === "short_a_long_b").map((bot) => (
            <Link
              key={bot.id}
              href={`/dashboard/${bot.id}`}
              className={cn(
                "flex items-center justify-between px-3 py-1.5 rounded-lg text-xs transition-colors",
                pathname === `/dashboard/${bot.id}`
                  ? "bg-bg-border text-text-primary"
                  : "text-text-secondary hover:text-text-primary hover:bg-bg-border/30"
              )}
            >
              <span>vs {bot.deployer}</span>
              <span className="flex items-center gap-1.5">
                {bot.connected && (
                  <span className={cn(
                    "w-1.5 h-1.5 rounded-full inline-block",
                    bot.state === "RUNNING" ? "bg-accent-green animate-pulse" : "bg-accent-green"
                  )} />
                )}
                <span className={cn("text-[10px]", BOT_STATE_COLORS[bot.state])}>
                  {bot.state}
                </span>
              </span>
            </Link>
          ))}
        </div>
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-bg-border">
        <div className="px-3 py-2 rounded-lg bg-bg-primary text-[10px] text-text-secondary">
          <span className="text-text-primary font-medium">HiP-3</span> Deployer Arbitrage
        </div>
      </div>
    </aside>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/formatters";
import { APP_NAME, BOT_STATE_COLORS } from "@/lib/constants";
import { useBotStore } from "@/store/botStore";

export default function Sidebar() {
  const pathname = usePathname();
  const bots = useBotStore((s) => s.bots);

  const navItems = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/spread-analyzer", label: "Spread Analyzer" },
    { href: "/admin", label: "Admin" },
  ];

  return (
    <aside className="w-60 bg-bg-surface border-r border-bg-border flex flex-col h-screen sticky top-0">
      <div className="p-4 border-b border-bg-border">
        <Link href="/" className="text-lg font-semibold text-text-primary">
          {APP_NAME}
        </Link>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "block px-3 py-2 rounded-lg text-sm transition-colors",
              pathname === item.href || pathname.startsWith(item.href + "/")
                ? "bg-accent-indigo/20 text-accent-indigo"
                : "text-text-secondary hover:text-text-primary hover:bg-bg-border/50"
            )}
          >
            {item.label}
          </Link>
        ))}

        {/* XYZ Short */}
        <div className="pt-4">
          <p className="px-3 text-[10px] text-accent-red/70 uppercase tracking-wider mb-1.5">XYZ Short</p>
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
              <span className="flex items-center gap-1">
                {bot.connected && (
                  <span className="w-1.5 h-1.5 rounded-full bg-accent-green inline-block" />
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
          <p className="px-3 text-[10px] text-accent-green/70 uppercase tracking-wider mb-1.5">XYZ Long</p>
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
              <span className="flex items-center gap-1">
                {bot.connected && (
                  <span className="w-1.5 h-1.5 rounded-full bg-accent-green inline-block" />
                )}
                <span className={cn("text-[10px]", BOT_STATE_COLORS[bot.state])}>
                  {bot.state}
                </span>
              </span>
            </Link>
          ))}
        </div>
      </nav>
    </aside>
  );
}

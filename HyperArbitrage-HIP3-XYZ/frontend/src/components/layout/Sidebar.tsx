"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/formatters";
import { APP_NAME, BOT_DEFINITIONS, BOT_STATE_COLORS } from "@/lib/constants";
import { useBotStore } from "@/store/botStore";

export default function Sidebar() {
  const pathname = usePathname();
  const bots = useBotStore((s) => s.bots);

  const navItems = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/admin", label: "Admin" },
  ];

  return (
    <aside className="w-60 bg-bg-surface border-r border-bg-border flex flex-col h-screen sticky top-0">
      <div className="p-4 border-b border-bg-border">
        <Link href="/" className="text-lg font-semibold text-text-primary">
          {APP_NAME}
        </Link>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "block px-3 py-2 rounded-lg text-sm transition-colors",
              pathname === item.href
                ? "bg-accent-indigo/20 text-accent-indigo"
                : "text-text-secondary hover:text-text-primary hover:bg-bg-border/50"
            )}
          >
            {item.label}
          </Link>
        ))}

        <div className="pt-4">
          <p className="px-3 text-[10px] text-text-secondary uppercase tracking-wider mb-2">Bots</p>
          {BOT_DEFINITIONS.map((def) => {
            const bot = bots.find((b) => b.id === def.id);
            const state = bot?.state || "IDLE";
            const href = `/dashboard/${def.id}`;
            return (
              <Link
                key={def.id}
                href={href}
                className={cn(
                  "flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-colors",
                  pathname === href
                    ? "bg-bg-border text-text-primary"
                    : "text-text-secondary hover:text-text-primary hover:bg-bg-border/30"
                )}
              >
                <span className="truncate">{def.name} · {def.pair_b}</span>
                <span className={cn("text-[10px]", BOT_STATE_COLORS[state])}>
                  {state}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </aside>
  );
}

"use client";

import { useState } from "react";
import { cn } from "@/lib/formatters";
import SpreadDetailView from "@/components/spread/SpreadDetailView";
import SpreadOverviewView from "@/components/spread/SpreadOverviewView";
import BotsView from "@/components/spread/BotsView";

type Tab = "detail" | "overview" | "bots";

const TABS: { key: Tab; label: string }[] = [
  { key: "detail", label: "Detail View" },
  { key: "overview", label: "Overview" },
  { key: "bots", label: "Bots" },
];

export default function SpreadAnalyzerPage() {
  const [activeTab, setActiveTab] = useState<Tab>("detail");

  return (
    <div className="min-h-screen bg-bg-primary">
      {/* Sticky Header */}
      <header className="border-b border-bg-border bg-bg-surface/50 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-[1800px] mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-bold text-white tracking-tight">
              HiP-3 <span className="text-accent-green">Spread Analyzer</span>
            </h1>
            <div className="flex items-center gap-2">
              {TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={cn(
                    "px-3 py-1 text-xs rounded-md transition-colors border",
                    activeTab === tab.key
                      ? "bg-accent-indigo/20 text-accent-indigo border-accent-indigo/30"
                      : "text-gray-500 hover:text-gray-300 border-bg-border"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-[1800px] mx-auto px-4 py-6">
        {activeTab === "detail" && <SpreadDetailView />}
        {activeTab === "overview" && <SpreadOverviewView />}
        {activeTab === "bots" && <BotsView />}
      </main>
    </div>
  );
}

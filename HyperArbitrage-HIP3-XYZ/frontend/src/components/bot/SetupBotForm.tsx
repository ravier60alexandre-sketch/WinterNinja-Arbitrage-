"use client";

import { useState } from "react";
import { useCreateBot } from "@/hooks/useBotData";
import { AVAILABLE_PAIRS } from "@/lib/constants";
import { cn } from "@/lib/formatters";
import type { Direction } from "@/lib/types";

interface SetupBotFormProps {
  onSuccess?: () => void;
  onCancel?: () => void;
}

export default function SetupBotForm({ onSuccess, onCancel }: SetupBotFormProps) {
  const { mutate, isPending, error } = useCreateBot();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [apiKey, setApiKey] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [subAccount, setSubAccount] = useState("");
  const [botName, setBotName] = useState("");
  const [selectedPairIdx, setSelectedPairIdx] = useState<number>(-1);
  const [direction, setDirection] = useState<Direction>("long_a_short_b");
  const [showApiKey, setShowApiKey] = useState(false);

  const canProceedStep1 = apiKey.trim().length > 0 && walletAddress.trim().length >= 10;
  const canProceedStep2 = selectedPairIdx >= 0;
  const selectedPair = selectedPairIdx >= 0 ? AVAILABLE_PAIRS[selectedPairIdx] : null;

  const handleSubmit = () => {
    if (!selectedPair || !canProceedStep1) return;

    const name = botName.trim() || `${selectedPair.label} ${direction === "long_a_short_b" ? "Long" : "Short"}`;

    mutate(
      {
        name,
        pair_a: selectedPair.asset_a,
        pair_b: selectedPair.asset_b,
        direction,
        account_address: walletAddress.trim(),
        api_key: apiKey.trim(),
        sub_account_address: subAccount.trim() || null,
      },
      { onSuccess }
    );
  };

  return (
    <div className="bg-bg-surface border border-bg-border rounded-xl max-w-2xl mx-auto">
      {/* Header */}
      <div className="px-6 py-4 border-b border-bg-border flex items-center justify-between">
        <h2 className="text-lg font-semibold text-text-primary">Deploy New Bot</h2>
        <div className="flex items-center gap-2 text-xs text-text-secondary">
          <StepIndicator num={1} active={step >= 1} current={step === 1} label="Connect" />
          <span className="text-bg-border">&#8594;</span>
          <StepIndicator num={2} active={step >= 2} current={step === 2} label="Pair" />
          <span className="text-bg-border">&#8594;</span>
          <StepIndicator num={3} active={step >= 3} current={step === 3} label="Review" />
        </div>
      </div>

      <div className="p-6">
        {/* Step 1: API Key & Wallet */}
        {step === 1 && (
          <div className="space-y-5">
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">
                Hyperliquid API Key
              </label>
              <div className="relative">
                <input
                  type={showApiKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Enter your Hyperliquid API key"
                  className="w-full bg-bg-primary border border-bg-border rounded-lg px-3 py-2.5 text-sm text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:border-accent-indigo/50 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-secondary hover:text-text-primary"
                >
                  {showApiKey ? "Hide" : "Show"}
                </button>
              </div>
              <p className="mt-1 text-[10px] text-text-secondary">
                Your API key is encrypted before being stored. Never shared.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">
                Wallet Address
              </label>
              <input
                type="text"
                value={walletAddress}
                onChange={(e) => setWalletAddress(e.target.value)}
                placeholder="0x..."
                className="w-full bg-bg-primary border border-bg-border rounded-lg px-3 py-2.5 text-sm text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:border-accent-indigo/50 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">
                Sub-Account Address
                <span className="ml-1 text-text-secondary/60">(optional)</span>
              </label>
              <input
                type="text"
                value={subAccount}
                onChange={(e) => setSubAccount(e.target.value)}
                placeholder="0x... (leave empty for main account)"
                className="w-full bg-bg-primary border border-bg-border rounded-lg px-3 py-2.5 text-sm text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:border-accent-indigo/50 font-mono"
              />
              <p className="mt-1 text-[10px] text-text-secondary">
                If you want to trade on a sub-account, enter its address here.
              </p>
            </div>
          </div>
        )}

        {/* Step 2: Pair & Direction */}
        {step === 2 && (
          <div className="space-y-5">
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">
                Trading Pair
              </label>
              <div className="grid grid-cols-1 gap-1.5 max-h-64 overflow-y-auto pr-1">
                {AVAILABLE_PAIRS.map((pair, idx) => (
                  <button
                    key={idx}
                    onClick={() => setSelectedPairIdx(idx)}
                    className={cn(
                      "text-left px-3 py-2 rounded-lg text-sm transition-colors border",
                      selectedPairIdx === idx
                        ? "bg-accent-indigo/15 border-accent-indigo/40 text-text-primary"
                        : "bg-bg-primary border-bg-border text-text-secondary hover:text-text-primary hover:border-bg-border/80"
                    )}
                  >
                    <span className="font-medium">{pair.label}</span>
                    <span className="ml-2 text-[10px] text-text-secondary/60 font-mono">
                      {pair.asset_a} / {pair.asset_b}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">
                Direction
              </label>
              <div className="flex gap-3">
                <button
                  onClick={() => setDirection("long_a_short_b")}
                  className={cn(
                    "flex-1 px-4 py-3 rounded-lg text-sm font-medium border transition-colors",
                    direction === "long_a_short_b"
                      ? "bg-accent-green/15 border-accent-green/40 text-accent-green"
                      : "bg-bg-primary border-bg-border text-text-secondary hover:text-text-primary"
                  )}
                >
                  <div className="text-center">
                    <div className="text-xs font-semibold">XYZ Short</div>
                    <div className="text-[10px] mt-0.5 opacity-70">Long A / Short B</div>
                  </div>
                </button>
                <button
                  onClick={() => setDirection("short_a_long_b")}
                  className={cn(
                    "flex-1 px-4 py-3 rounded-lg text-sm font-medium border transition-colors",
                    direction === "short_a_long_b"
                      ? "bg-accent-amber/15 border-accent-amber/40 text-accent-amber"
                      : "bg-bg-primary border-bg-border text-text-secondary hover:text-text-primary"
                  )}
                >
                  <div className="text-center">
                    <div className="text-xs font-semibold">XYZ Long</div>
                    <div className="text-[10px] mt-0.5 opacity-70">Short A / Long B</div>
                  </div>
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">
                Bot Name
                <span className="ml-1 text-text-secondary/60">(optional)</span>
              </label>
              <input
                type="text"
                value={botName}
                onChange={(e) => setBotName(e.target.value)}
                placeholder={selectedPair ? `${selectedPair.label} ${direction === "long_a_short_b" ? "Long" : "Short"}` : "Auto-generated"}
                className="w-full bg-bg-primary border border-bg-border rounded-lg px-3 py-2.5 text-sm text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:border-accent-indigo/50"
              />
            </div>
          </div>
        )}

        {/* Step 3: Review & Deploy */}
        {step === 3 && selectedPair && (
          <div className="space-y-4">
            <div className="bg-bg-primary rounded-lg border border-bg-border p-4 space-y-3">
              <ReviewRow label="Wallet" value={truncateAddr(walletAddress)} mono />
              {subAccount && (
                <ReviewRow label="Sub-Account" value={truncateAddr(subAccount)} mono />
              )}
              <ReviewRow label="Pair" value={selectedPair.label} />
              <ReviewRow label="Assets" value={`${selectedPair.asset_a} / ${selectedPair.asset_b}`} mono />
              <ReviewRow
                label="Direction"
                value={direction === "long_a_short_b" ? "XYZ Short (Long A / Short B)" : "XYZ Long (Short A / Long B)"}
              />
              <ReviewRow
                label="Bot Name"
                value={botName.trim() || `${selectedPair.label} ${direction === "long_a_short_b" ? "Long" : "Short"}`}
              />
            </div>

            <div className="bg-accent-amber/10 border border-accent-amber/20 rounded-lg p-3">
              <p className="text-xs text-accent-amber">
                The bot will be created in IDLE state. You can configure parameters and start it from the dashboard.
              </p>
            </div>

            {error && (
              <div className="bg-accent-red/10 border border-accent-red/20 rounded-lg p-3">
                <p className="text-xs text-accent-red">
                  {error instanceof Error ? error.message : "Failed to create bot"}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-bg-border flex items-center justify-between">
        <div>
          {step > 1 && (
            <button
              onClick={() => setStep((s) => Math.max(1, s - 1) as 1 | 2 | 3)}
              className="px-4 py-2 text-xs text-text-secondary hover:text-text-primary transition-colors"
            >
              Back
            </button>
          )}
          {onCancel && step === 1 && (
            <button
              onClick={onCancel}
              className="px-4 py-2 text-xs text-text-secondary hover:text-text-primary transition-colors"
            >
              Cancel
            </button>
          )}
        </div>

        <div>
          {step < 3 && (
            <button
              onClick={() => setStep((s) => Math.min(3, s + 1) as 1 | 2 | 3)}
              disabled={step === 1 ? !canProceedStep1 : !canProceedStep2}
              className="px-5 py-2 bg-accent-indigo text-white text-xs font-semibold rounded-lg disabled:opacity-30 disabled:cursor-not-allowed hover:bg-accent-indigo/80 transition-colors"
            >
              Continue
            </button>
          )}
          {step === 3 && (
            <button
              onClick={handleSubmit}
              disabled={isPending}
              className="px-5 py-2 bg-accent-green text-white text-xs font-semibold rounded-lg disabled:opacity-50 hover:bg-accent-green/80 transition-colors"
            >
              {isPending ? "Deploying..." : "Deploy Bot"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function StepIndicator({ num, active, current, label }: { num: number; active: boolean; current: boolean; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className={cn(
          "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold border",
          current
            ? "bg-accent-indigo border-accent-indigo text-white"
            : active
              ? "bg-accent-indigo/20 border-accent-indigo/40 text-accent-indigo"
              : "border-bg-border text-text-secondary"
        )}
      >
        {num}
      </span>
      <span className={cn(current ? "text-text-primary" : "text-text-secondary")}>{label}</span>
    </div>
  );
}

function ReviewRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-text-secondary">{label}</span>
      <span className={cn("text-xs text-text-primary", mono && "font-mono")}>{value}</span>
    </div>
  );
}

function truncateAddr(addr: string): string {
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
}

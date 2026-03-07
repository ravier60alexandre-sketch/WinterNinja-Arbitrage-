"use client";

import ConnectionStatus from "@/components/shared/ConnectionStatus";
import { APP_NAME } from "@/lib/constants";

interface HeaderProps {
  title?: string;
}

export default function Header({ title }: HeaderProps) {
  return (
    <header className="h-14 border-b border-bg-border bg-bg-surface flex items-center justify-between px-6">
      <h1 className="text-sm font-semibold text-text-primary">
        {title || APP_NAME}
      </h1>
      <ConnectionStatus />
    </header>
  );
}

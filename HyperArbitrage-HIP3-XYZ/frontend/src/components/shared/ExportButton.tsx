"use client";

import { getExportCSVUrl, getExportPDFUrl } from "@/lib/api";

interface ExportButtonProps {
  botId: number;
}

export default function ExportButton({ botId }: ExportButtonProps) {
  return (
    <div className="flex gap-2">
      <a
        href={getExportCSVUrl(botId)}
        download
        className="px-3 py-1.5 text-xs border border-bg-border rounded-lg text-text-secondary hover:text-text-primary hover:border-accent-indigo transition-colors"
      >
        Export CSV
      </a>
      <a
        href={getExportPDFUrl(botId)}
        download
        className="px-3 py-1.5 text-xs border border-bg-border rounded-lg text-text-secondary hover:text-text-primary hover:border-accent-indigo transition-colors"
      >
        Export PDF
      </a>
    </div>
  );
}

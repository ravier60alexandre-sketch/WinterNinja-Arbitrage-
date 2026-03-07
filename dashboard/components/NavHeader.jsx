'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import ConnectionStatus from './ConnectionStatus';

const TABS = [
  { href: '/', label: 'Detail' },
  { href: '/overview', label: 'Overview' },
  { href: '/bots', label: 'Bots' },
];

export default function NavHeader({ connected, lastUpdate, children }) {
  const pathname = usePathname();

  const getActiveTab = () => {
    if (pathname.startsWith('/bots')) return '/bots';
    if (pathname === '/overview') return '/overview';
    return '/';
  };

  const activeTab = getActiveTab();

  return (
    <header className="border-b border-bg-border bg-bg-card/50 backdrop-blur-sm sticky top-0 z-40">
      <div className="max-w-[1800px] mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-lg font-bold text-white tracking-tight hover:text-accent-blue transition-colors">
            HiP-3 <span className="text-accent-green">Spread Analyzer</span>
          </Link>
          <div className="flex items-center gap-2">
            {TABS.map(tab => (
              <Link
                key={tab.href}
                href={tab.href}
                className={`px-3 py-1 text-xs rounded-md transition-colors ${
                  activeTab === tab.href
                    ? 'bg-accent-blue/20 text-accent-blue border border-accent-blue/30'
                    : 'text-gray-500 hover:text-gray-300 border border-bg-border'
                }`}
              >
                {tab.label}
              </Link>
            ))}
          </div>
          {children}
        </div>
        {connected !== undefined && (
          <ConnectionStatus connected={connected} lastUpdate={lastUpdate} />
        )}
      </div>
    </header>
  );
}

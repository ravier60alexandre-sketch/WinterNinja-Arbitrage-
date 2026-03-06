'use client';

import { useState, useRef, useEffect } from 'react';

export default function PairSelector({ pairs, selectedPair, onSelect, onCompareAll }) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Group pairs by underlying
  const grouped = {};
  for (const pair of pairs) {
    const match = pair.asset_a.match(/^xyz:(.+)$/);
    if (match) {
      const underlying = match[1];
      if (!grouped[underlying]) grouped[underlying] = [];
      grouped[underlying].push(pair);
    }
  }

  const filteredGroups = {};
  const searchLower = search.toLowerCase();
  for (const [underlying, groupPairs] of Object.entries(grouped)) {
    if (underlying.toLowerCase().includes(searchLower)) {
      filteredGroups[underlying] = groupPairs;
    }
  }

  const selectedLabel = selectedPair ? selectedPair.label : 'Select a pair';

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 bg-bg-card border border-bg-border rounded-lg text-sm font-medium hover:border-accent-blue transition-colors min-w-[280px]"
      >
        <span className="font-mono text-white truncate">{selectedLabel.trim()}</span>
        <svg className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute top-full mt-1 left-0 w-[340px] max-h-[480px] bg-bg-card border border-bg-border rounded-lg shadow-2xl z-50 overflow-hidden fade-in">
          <div className="p-2 border-b border-bg-border">
            <input
              type="text"
              placeholder="Search asset..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-3 py-2 bg-bg-primary border border-bg-border rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:border-accent-blue"
              autoFocus
            />
          </div>
          <div className="overflow-y-auto max-h-[400px]">
            {Object.entries(filteredGroups).sort(([a], [b]) => a.localeCompare(b)).map(([underlying, groupPairs]) => (
              <div key={underlying}>
                <div className="flex items-center justify-between px-3 py-2 bg-bg-primary/50">
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{underlying}</span>
                  {groupPairs.length > 1 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onCompareAll(underlying, groupPairs);
                        setIsOpen(false);
                      }}
                      className="text-[10px] px-2 py-0.5 bg-accent-blue/20 text-accent-blue rounded hover:bg-accent-blue/30 transition-colors"
                    >
                      Compare All
                    </button>
                  )}
                </div>
                {groupPairs.map((pair) => {
                  const deployer = pair.asset_b.split(':')[0].toUpperCase();
                  const isSelected = selectedPair && selectedPair.asset_a === pair.asset_a && selectedPair.asset_b === pair.asset_b;
                  return (
                    <button
                      key={`${pair.asset_a}-${pair.asset_b}`}
                      onClick={() => { onSelect(pair); setIsOpen(false); setSearch(''); }}
                      className={`w-full text-left px-4 py-2 text-sm hover:bg-bg-border/50 transition-colors ${
                        isSelected ? 'bg-accent-blue/10 text-accent-blue' : 'text-gray-300'
                      }`}
                    >
                      <span className="font-mono">XYZ vs {deployer}</span>
                    </button>
                  );
                })}
              </div>
            ))}
            {Object.keys(filteredGroups).length === 0 && (
              <div className="p-4 text-center text-gray-500 text-sm">No pairs found</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

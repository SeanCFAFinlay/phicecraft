// ============================================================================
// FORMATION QUICK PICKER
//
// Fast visual formation and tactical placement selector.
// Allows coaches to deploy canonical game setups (1-3-1 PP, PK Box, 3v2 Rush,
// 2v1 Rush, 5v5 Breakout, 2-1-2 Forecheck, 1-2-2 Trap, Faceoffs) in a single tap.
// ============================================================================

import { useState, useMemo, useEffect, useRef } from 'react';
import { useCommands } from '@/hooks/useAppState';
import { FORMATION_PRESETS, type PlayFormationPreset, type FormationPresetDefinition } from '@/engine/formations';

interface FormationQuickPickerProps {
  onClose: () => void;
}

type CategoryFilter = 'All' | 'Special Teams' | 'Systems' | 'Rush & Set Plays' | 'Quick Drills';

export function FormationQuickPicker({ onClose }: FormationQuickPickerProps) {
  const commands = useCommands();
  const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    searchInputRef.current?.focus();
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const categories: CategoryFilter[] = ['All', 'Special Teams', 'Systems', 'Rush & Set Plays', 'Quick Drills'];

  const filteredPresets = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return FORMATION_PRESETS.filter(preset => {
      const matchesCategory = selectedCategory === 'All' || preset.category === selectedCategory;
      if (!matchesCategory) return false;
      if (!q) return true;
      return (
        preset.title.toLowerCase().includes(q) ||
        preset.subtitle.toLowerCase().includes(q) ||
        preset.category.toLowerCase().includes(q)
      );
    });
  }, [selectedCategory, searchQuery]);

  const handleSelect = async (presetId: PlayFormationPreset) => {
    onClose();
    await commands.loadFormation(presetId, true);
  };

  const getCategoryBadgeClass = (cat: FormationPresetDefinition['category']) => {
    switch (cat) {
      case 'Special Teams':
        return 'border-amber-500/40 bg-amber-500/15 text-amber-300';
      case 'Systems':
        return 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300';
      case 'Rush & Set Plays':
        return 'border-cyan-500/40 bg-cyan-500/15 text-cyan-300';
      case 'Quick Drills':
        return 'border-purple-500/40 bg-purple-500/15 text-purple-300';
      default:
        return 'border-white/20 bg-white/10 text-white/80';
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Quick Formations & Tactical Placements"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 backdrop-blur-md animate-in fade-in duration-150"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl border border-cyan-500/30 bg-[#07131e] shadow-2xl shadow-cyan-950/40">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/20 text-[18px]">
              ⚡
            </span>
            <div>
              <h2 className="text-base font-extrabold text-white">
                Tactical Formations & Quick Placements
              </h2>
              <p className="text-xs text-white/60">
                Deploy canonical game setups, rushes, special teams, and faceoffs in one tap
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close formation picker"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-white/60 hover:bg-white/10 hover:text-white"
          >
            ✕
          </button>
        </div>

        {/* Search & Category Filter */}
        <div className="border-b border-white/10 bg-white/[0.02] px-5 py-3 space-y-2.5">
          <div className="relative">
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search formations (e.g. 1-3-1, 3v2, breakout, trap, pk box, faceoff)..."
              className="w-full rounded-xl border border-white/15 bg-black/40 px-3.5 py-2 text-xs text-white placeholder-white/40 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-white/50 hover:text-white"
              >
                ✕
              </button>
            )}
          </div>

          {/* Category Chips */}
          <div className="flex flex-wrap gap-1.5 overflow-x-auto scrollbar-hide">
            {categories.map(cat => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`touch-target rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
                  selectedCategory === cat
                    ? 'bg-app-cyan text-[#041019] shadow-sm'
                    : 'border border-white/10 bg-white/[0.04] text-white/70 hover:border-white/20 hover:text-white'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Formations Grid */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          {filteredPresets.length === 0 ? (
            <div className="py-12 text-center text-sm text-white/50">
              No formations match &ldquo;{searchQuery}&rdquo;.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {filteredPresets.map(preset => {
                const samplePlayers = preset.players();
                const homeCount = samplePlayers.filter(p => p.team === 'home' && p.role !== 'G').length;
                const awayCount = samplePlayers.filter(p => p.team === 'away' && p.role !== 'G').length;
                const goalieCount = samplePlayers.filter(p => p.role === 'G').length;

                return (
                  <div
                    key={preset.id}
                    className="group relative flex flex-col justify-between rounded-xl border border-white/10 bg-white/[0.03] p-3.5 transition-all hover:border-cyan-400/50 hover:bg-white/[0.06] hover:shadow-lg"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <span
                          className={`rounded-md border px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${getCategoryBadgeClass(
                            preset.category
                          )}`}
                        >
                          {preset.category}
                        </span>
                        <span className="text-[11px] font-medium text-white/40">
                          🔵 {homeCount} · 🔴 {awayCount}
                          {goalieCount > 0 ? ` · 🥅 ${goalieCount}` : ''}
                        </span>
                      </div>

                      <h3 className="mt-2 text-sm font-extrabold text-white group-hover:text-cyan-300 transition-colors">
                        {preset.title}
                      </h3>
                      <p className="mt-0.5 text-xs text-white/60 line-clamp-2">
                        {preset.subtitle}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => void handleSelect(preset.id)}
                      className="mt-3 flex items-center justify-center gap-1.5 rounded-lg border border-cyan-400/40 bg-cyan-500/15 py-1.5 text-xs font-bold text-cyan-200 hover:bg-cyan-500/30 hover:border-cyan-400 transition-all"
                    >
                      <span>Deploy Setup</span>
                      <span>→</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-white/10 bg-white/[0.02] px-5 py-3 text-xs text-white/50">
          <span>Deploying a setup places players and sets up initial puck placement.</span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1 font-bold text-white/70 hover:bg-white/10 hover:text-white"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

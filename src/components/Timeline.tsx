import type { DrillEvent, Player } from '@/core/types';
import { getEventDepartureTime } from '@/engine/playback';

interface TimelineProps {
  players: Player[];
  activePlayerIds: string[];
  events: DrillEvent[];
  progress: number;
  disabled: boolean;
  onSeek: (progress: number) => void;
}

export function Timeline({ players, activePlayerIds, events, progress, disabled, onSeek }: TimelineProps) {
  const activePlayers = activePlayerIds
    .map(id => players.find(player => player.id === id))
    .filter((player): player is Player => Boolean(player))
    .slice(0, 4);
  const lanes = [...activePlayers.map(player => `#${player.number}`), 'PUCK'];

  return (
    <div className="relative min-w-0 flex-1 py-1" aria-label="Drill timeline">
      <div className="space-y-1.5 pr-1">
        {lanes.map((label, laneIndex) => (
          <div key={label} className="flex h-5 items-center gap-2">
            <span className="w-10 truncate text-right text-[10px] font-bold tracking-wider text-white/50">{label}</span>
            <div className="relative h-1.5 flex-1 rounded-full bg-white/10">
              <div
                className={`h-full rounded-full transition-[width] duration-75 ${
                  laneIndex === lanes.length - 1 ? 'bg-amber-400' : 'bg-cyan-400'
                }`}
                style={{ width: `${progress * 100}%` }}
              />
              {laneIndex === lanes.length - 1 && events.map((event, eventIndex) => (
                <span
                  key={event.id}
                  className={`absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-black/50 shadow-sm ${
                    event.type === 'shot' ? 'bg-orange-500' : event.type === 'pickup' ? 'bg-emerald-400' : 'bg-yellow-300'
                  }`}
                  style={{ left: `${getEventDepartureTime(event, eventIndex, events.length) * 100}%` }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      <input
        aria-label="Playback position"
        type="range"
        min="0"
        max="1000"
        value={Math.round(progress * 1000)}
        disabled={disabled}
        onChange={event => onSeek(Number(event.currentTarget.value) / 1000)}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        style={{ minHeight: '44px' }}
      />
      <span
        className="pointer-events-none absolute top-1 bottom-1 w-1 -translate-x-1/2 rounded-full bg-white shadow-[0_0_8px_rgba(34,211,238,.9)]"
        style={{ left: `calc(48px + (100% - 48px) * ${progress})` }}
      />
    </div>
  );
}

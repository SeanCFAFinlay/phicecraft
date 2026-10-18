import { useState } from 'react';
import { useAppState } from '@/hooks/useAppState';

export function SketchReference() {
  const { state } = useAppState();
  const [expanded, setExpanded] = useState(true);
  const [overlay, setOverlay] = useState(false);
  const [opacity, setOpacity] = useState(35);
  const [width, setWidth] = useState(80);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const image = state.drill.settings?.coaching?.referenceImage;
  if (!image || state.ui.mode !== 'build') return null;
  return <>
    {overlay && <img src={image} alt="" aria-hidden="true" className="pointer-events-none absolute z-10 max-w-none" style={{ width: `${width}%`, left: `${50 + offsetX}%`, top: `${50 + offsetY}%`, transform: 'translate(-50%, -50%)', opacity: opacity / 100 }} />}
    <aside className="absolute bottom-3 left-3 z-20 max-h-[50%] max-w-[42%] overflow-auto rounded-xl border border-white/20 bg-slate-950/95 p-2 shadow-lg" aria-label="Imported sketch reference">
    <button type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)} className="touch-target w-full text-xs font-bold text-app-cyan">
      {expanded ? 'Hide sketch' : 'Show sketch'}
    </button>
    {expanded && <>
      {!overlay && <img src={image} alt="Imported play sketch to recreate on the rink" className="max-h-[25vh] w-56 rounded object-contain" />}
      <button type="button" aria-pressed={overlay} className="touch-target w-full text-xs text-cyan-100" onClick={() => setOverlay(!overlay)}>{overlay ? 'Reference beside rink' : 'Overlay to trace'}</button>
      {overlay && <details className="w-44 max-w-full text-xs text-slate-200"><summary className="py-2">Align sketch</summary>
        <p className="mb-2">Match the rink before drawing. Keep the view still while tracing.</p>
        {[
          { label: 'Sketch opacity', value: opacity, set: setOpacity, min: 10, max: 80 },
          { label: 'Sketch size', value: width, set: setWidth, min: 20, max: 160 },
          { label: 'Sketch horizontal position', value: offsetX, set: setOffsetX, min: -50, max: 50 },
          { label: 'Sketch vertical position', value: offsetY, set: setOffsetY, min: -50, max: 50 },
        ].map(item => <label key={item.label} className="block">{item.label}<input type="range" className="h-8 w-full" min={item.min} max={item.max} value={item.value} onChange={event => item.set(Number(event.target.value))} /></label>)}
      </details>}
    </>}
  </aside></>;
}

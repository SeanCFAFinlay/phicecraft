// ============================================================================
// SHARE SHEET
//
// Everything a coach does to get a play off this device, in one place that
// works with a thumb: send it as a link, save it as a video, print it.
// ============================================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import { Sheet } from '@/components/a11y/Sheet';
import { useAppState } from '@/hooks/useAppState';
import { buildDrillStory } from '@/features/coaching/drillStory';
import { printPlayerCards } from '@/features/coaching/printPlayerCards';
import { MAX_SHARE_URL_LENGTH, buildShareUrl, copyText, shareUrl } from './shareLink';
import { canExportVideo, recordDrillVideo, shareOrDownloadVideo, type VideoResult } from './exportVideo';

const primary =
  'touch-target inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-app-cyan px-4 py-2.5 text-[14px] font-black text-[#041019] shadow hover:bg-cyan-300 disabled:opacity-40';
const secondary =
  'touch-target inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-cyan-400/40 bg-cyan-400/10 px-4 py-2.5 text-[14px] font-bold text-cyan-200 hover:bg-cyan-400/20 disabled:opacity-40';
const section = 'space-y-2.5 rounded-2xl border border-app-border bg-white/[0.03] p-3.5';

function appBaseUrl(): string {
  return `${window.location.origin}${window.location.pathname}`;
}

export function ShareSheet({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useAppState();
  const drill = state.drill;
  const title = drill.name || 'Hockey play';
  const story = useMemo(() => buildDrillStory(drill), [drill]);

  const [link, setLink] = useState<string | null>(null);
  const [linkStatus, setLinkStatus] = useState<string>('');
  useEffect(() => {
    let live = true;
    void buildShareUrl(drill, appBaseUrl()).then(url => {
      if (live) setLink(url);
    });
    return () => {
      live = false;
    };
  }, [drill]);
  const tooLong = (link?.length ?? 0) > MAX_SHARE_URL_LENGTH;

  const [speed, setSpeed] = useState<1 | 0.5>(1);
  const [progress, setProgress] = useState<number | null>(null);
  const [video, setVideo] = useState<VideoResult | null>(null);
  const [videoStatus, setVideoStatus] = useState('');
  const abort = useRef<AbortController | null>(null);
  const videoUrl = useMemo(() => (video ? URL.createObjectURL(video.blob) : null), [video]);
  useEffect(() => () => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
  }, [videoUrl]);
  useEffect(() => () => abort.current?.abort(), []);
  const videoSupported = useMemo(() => canExportVideo(), []);

  const makeVideo = async () => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setVideo(null);
    setVideoStatus('');
    setProgress(0);
    const result = await recordDrillVideo(drill, { speed, onProgress: setProgress, signal: controller.signal });
    setProgress(null);
    if (controller.signal.aborted) return;
    if (!result) {
      setVideoStatus('This browser could not record the video.');
      return;
    }
    setVideo(result);
    setVideoStatus(`Ready: ${result.filename} (${(result.blob.size / 1_000_000).toFixed(1)} MB)`);
  };

  return (
    <Sheet open title="Share this play" description="Send it, save it as a video, or print it" onClose={onClose}>
      <div className="space-y-3 px-3 pb-6">
        <section className={section} aria-labelledby="share-link-heading">
          <h3 id="share-link-heading" className="text-[15px] font-black text-white">
            Send a link
          </h3>
          <p className="text-[12.5px] text-white/65">
            The play travels inside the link - nothing is uploaded. Whoever opens it gets their own copy to watch or edit.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className={primary}
              disabled={!link || tooLong}
              onClick={async () => {
                if (!link) return;
                const outcome = await shareUrl(link, title);
                setLinkStatus(
                  outcome === 'shared' ? 'Shared.' : outcome === 'copied' ? 'Link copied - paste it in a text or the team chat.' : outcome === 'cancelled' ? '' : 'Could not share. Copy the link below.'
                );
              }}
            >
              Share link
            </button>
            <button
              type="button"
              className={secondary}
              disabled={!link || tooLong}
              onClick={async () => {
                if (!link) return;
                setLinkStatus((await copyText(link)) ? 'Link copied.' : 'Select the link below and copy it.');
              }}
            >
              Copy link
            </button>
          </div>
          <input
            aria-label="Play link"
            readOnly
            value={link ?? 'Making the link…'}
            onFocus={event => event.currentTarget.select()}
            className="w-full truncate rounded-xl border border-app-border bg-slate-900 px-3 py-2 font-mono text-[12px] text-white/70"
          />
          {tooLong && (
            <p className="text-[12px] font-bold text-amber-300">
              This play is too big for a link. Use Export play data from the menu and send the file instead.
            </p>
          )}
          <p role="status" className="min-h-[1em] text-[12.5px] font-bold text-emerald-300">
            {linkStatus}
          </p>
        </section>

        <section className={section} aria-labelledby="share-video-heading">
          <h3 id="share-video-heading" className="text-[15px] font-black text-white">
            Save as a video
          </h3>
          <p className="text-[12.5px] text-white/65">
            The whole play on the full rink, with the numbered steps written along the bottom - ready for the team chat
            or to show on a phone at the bench.
          </p>
          {videoSupported ? (
            <>
              <div role="radiogroup" aria-label="Video speed" className="grid grid-cols-2 gap-2">
                {([1, 0.5] as const).map(value => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={speed === value}
                    onClick={() => setSpeed(value)}
                    className={`touch-target min-h-[44px] rounded-xl border px-3 py-2 text-[13px] font-bold ${
                      speed === value ? 'border-app-cyan bg-app-cyan/20 text-white' : 'border-app-border bg-white/5 text-white/70'
                    }`}
                  >
                    {value === 1 ? 'Game speed' : 'Slow motion (½×)'}
                  </button>
                ))}
              </div>
              {progress === null ? (
                <button type="button" className={`${primary} w-full`} onClick={() => void makeVideo()}>
                  {video ? 'Make it again' : 'Make video'}
                </button>
              ) : (
                <div className="space-y-2">
                  <div
                    role="progressbar"
                    aria-label="Making the video"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(progress * 100)}
                    className="h-3 overflow-hidden rounded-full bg-white/10"
                  >
                    <div className="h-full bg-app-cyan transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
                  </div>
                  <div className="flex items-center justify-between text-[12px] text-white/60">
                    <span>Recording the play in real time… {Math.round(progress * 100)}%</span>
                    <button type="button" className="font-bold text-white/80 underline" onClick={() => abort.current?.abort()}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              {video && videoUrl && (
                <div className="space-y-2">
                  <video
                    src={videoUrl}
                    controls
                    playsInline
                    muted
                    aria-label="Video preview"
                    className="w-full rounded-xl border border-app-border bg-black"
                  />
                  <button
                    type="button"
                    className={`${primary} w-full`}
                    onClick={async () => {
                      const outcome = await shareOrDownloadVideo(video, title);
                      if (outcome === 'failed') setVideoStatus('Could not save the video.');
                      if (outcome === 'downloaded') setVideoStatus(`Saved ${video.filename} to your downloads.`);
                    }}
                  >
                    Save or send video
                  </button>
                </div>
              )}
              <p role="status" className="min-h-[1em] text-[12.5px] font-bold text-emerald-300">
                {videoStatus}
              </p>
            </>
          ) : (
            <p className="text-[12.5px] font-bold text-amber-300">This browser cannot record video. Try Chrome or Safari.</p>
          )}
        </section>

        <section className={section} aria-labelledby="share-print-heading">
          <h3 id="share-print-heading" className="text-[15px] font-black text-white">
            Print
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className={secondary} onClick={() => dispatch({ type: 'OPEN_SHEET', sheet: 'print-preview' })}>
              Drill sheet
            </button>
            <button type="button" className={secondary} onClick={() => printPlayerCards(drill, story)}>
              Player cards
            </button>
          </div>
        </section>
      </div>
    </Sheet>
  );
}

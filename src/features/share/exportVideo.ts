// ============================================================================
// SAVE A PLAY AS A VIDEO
//
// Plays the drill through the simulator into an off-screen 1280x720 canvas -
// the whole rink, the routes faded underneath, players and puck moving - with
// the numbered step captions along the bottom, and records it with the
// browser's own MediaRecorder. MP4 where the browser can make it (Safari,
// recent Chrome), WebM otherwise. No upload: the file is made on the device.
// ============================================================================

import type { Drill } from '@/core/types';
import { RINK } from '@/core/constants';
import { compileDrill } from '@/sim/compileDrill';
import { sampleFrame, sampleRawFrame } from '@/sim/sampleFrame';
import { paintDrillDiagram } from '@/ui/exportImage';
import { buildDrillStory, stepAt, type DrillStory } from '@/features/coaching/drillStory';

export const VIDEO_WIDTH = 1280;
export const VIDEO_HEIGHT = 720;
const HEADER = 54;
const CAPTION = 116;
const INTRO_SECONDS = 1.2;
const OUTRO_SECONDS = 1.5;
const FPS = 30;

const MIME_CHOICES: { mime: string; ext: 'mp4' | 'webm' }[] = [
  { mime: 'video/mp4;codecs=avc1.42E01E', ext: 'mp4' },
  { mime: 'video/mp4', ext: 'mp4' },
  { mime: 'video/webm;codecs=vp9', ext: 'webm' },
  { mime: 'video/webm;codecs=vp8', ext: 'webm' },
  { mime: 'video/webm', ext: 'webm' },
];

export function pickVideoFormat(): { mime: string; ext: 'mp4' | 'webm' } | null {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') return null;
  return MIME_CHOICES.find(choice => MediaRecorder.isTypeSupported(choice.mime)) ?? null;
}

export function canExportVideo(): boolean {
  return (
    typeof document !== 'undefined' &&
    typeof HTMLCanvasElement !== 'undefined' &&
    typeof HTMLCanvasElement.prototype.captureStream === 'function' &&
    pickVideoFormat() !== null
  );
}

/** Lines of `text` no wider than `maxWidth`, at most `maxLines`. */
export function wrapText(measure: (text: string) => number, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (measure(next) <= maxWidth || !line) line = next;
    else {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) break;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  else if (line && lines.length === maxLines) lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, '…');
  return lines;
}

/** What the caption bar says at simulated time `t` (null t = setup card). */
export function captionAt(story: DrillStory, t: number | null): { heading: string; detail: string } {
  if (t === null) {
    return { heading: 'Setup', detail: story.setup.join(' ') || story.overview };
  }
  const step = stepAt(story, t);
  if (!step) return { heading: story.title, detail: story.overview };
  const total = story.steps.length;
  return { heading: `Step ${step.number} of ${total} · ${step.title}`, detail: step.detail };
}

export interface ViewRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The part of the rink the play happens in, padded and widened to the
 * picture's shape, so a one-zone drill fills the video instead of sitting in
 * a corner of the whole rink.
 */
export function actionView(drill: Drill, compiled: ReturnType<typeof compileDrill>, duration: number, aspect: number): ViewRegion {
  const xs: number[] = [];
  const ys: number[] = [];
  const add = (p: { x: number; y: number }) => {
    xs.push(p.x);
    ys.push(p.y);
  };
  drill.players.forEach(add);
  drill.skatePaths.forEach(path => path.points.forEach(add));
  drill.events.forEach(event => {
    add(event.fromPoint);
    add(event.toPoint);
  });
  for (let t = 0; t <= duration; t += 0.25) {
    const frame = sampleRawFrame(compiled, t);
    Object.values(frame.players).forEach(player => add(player.position));
    if (frame.puck?.visible) add(frame.puck);
  }
  const full = { x: RINK.x, y: RINK.y, width: RINK.width, height: RINK.height };
  if (xs.length === 0) return full;

  const pad = 55;
  let minX = Math.min(...xs) - pad;
  let maxX = Math.max(...xs) + pad;
  let minY = Math.min(...ys) - pad;
  let maxY = Math.max(...ys) + pad;
  // Never closer than about a third of the rink: players need their context.
  let width = Math.max(maxX - minX, 340);
  let height = Math.max(maxY - minY, 340 / aspect);
  if (width / height < aspect) width = height * aspect;
  else height = width / aspect;
  if (width >= full.width || height >= full.height) return full;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  minX = Math.min(Math.max(cx - width / 2, full.x), full.x + full.width - width);
  minY = Math.min(Math.max(cy - height / 2, full.y), full.y + full.height - height);
  maxX = minX + width;
  maxY = minY + height;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function paintFrame(
  ctx: CanvasRenderingContext2D,
  drill: Drill,
  story: DrillStory,
  frame: ReturnType<typeof sampleFrame>,
  caption: { heading: string; detail: string },
  progress: number,
  view: ViewRegion
) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#0a1622';
  ctx.fillRect(0, 0, VIDEO_WIDTH, VIDEO_HEIGHT);
  paintDrillDiagram(ctx, drill, {
    width: VIDEO_WIDTH,
    height: VIDEO_HEIGHT - HEADER - CAPTION,
    includeHeader: true,
    frame,
    view,
  });

  // Caption bar
  const top = VIDEO_HEIGHT - CAPTION;
  ctx.fillStyle = '#06101a';
  ctx.fillRect(0, top, VIDEO_WIDTH, CAPTION);
  ctx.fillStyle = 'rgba(34, 211, 238, 0.25)';
  ctx.fillRect(0, top, VIDEO_WIDTH, 4);
  ctx.fillStyle = '#22d3ee';
  ctx.fillRect(0, top, VIDEO_WIDTH * Math.max(0, Math.min(1, progress)), 4);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#22d3ee';
  ctx.font = '800 26px system-ui, -apple-system, sans-serif';
  const heading = wrapText(text => ctx.measureText(text).width, caption.heading, VIDEO_WIDTH - 48, 1)[0] ?? '';
  ctx.fillText(heading, 24, top + 16);
  ctx.fillStyle = '#ffffff';
  ctx.font = '600 21px system-ui, -apple-system, sans-serif';
  const lines = wrapText(text => ctx.measureText(text).width, caption.detail, VIDEO_WIDTH - 48, 2);
  lines.forEach((line, index) => ctx.fillText(line, 24, top + 52 + index * 28));

  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.font = '700 14px system-ui, -apple-system, sans-serif';
  ctx.fillText(`${frame.timeSeconds.toFixed(1)}s / ${story.durationSeconds.toFixed(1)}s`, VIDEO_WIDTH - 24, top + 20);
}

export interface VideoResult {
  blob: Blob;
  filename: string;
  mime: string;
}

export interface VideoOptions {
  /** 0.5 for a slow-motion teaching video. */
  speed?: number;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

function safeName(name: string): string {
  return (name || 'play').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 60) || 'play';
}

/**
 * Records the play in real time (a 7-second drill takes about 10 seconds to
 * make, setup and ending cards included). Resolves null if the browser
 * cannot record or the export was cancelled.
 */
export async function recordDrillVideo(drill: Drill, options: VideoOptions = {}): Promise<VideoResult | null> {
  const format = pickVideoFormat();
  if (!format || !canExportVideo()) return null;
  const speed = options.speed ?? 1;

  const story = buildDrillStory(drill);
  const compiled = compileDrill(drill);
  const duration = Math.max(0.5, story.durationSeconds || compiled.durationSeconds || 1);

  const canvas = document.createElement('canvas');
  canvas.width = VIDEO_WIDTH;
  canvas.height = VIDEO_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const view = actionView(drill, compiled, duration, VIDEO_WIDTH / (VIDEO_HEIGHT - HEADER - CAPTION));
  const playSeconds = duration / speed;
  const total = INTRO_SECONDS + playSeconds + OUTRO_SECONDS;
  const draw = (elapsed: number) => {
    const inPlay = Math.max(0, Math.min(duration, (elapsed - INTRO_SECONDS) * speed));
    const frame = sampleFrame(compiled, inPlay);
    const caption =
      elapsed < INTRO_SECONDS ? captionAt(story, null) : elapsed > INTRO_SECONDS + playSeconds ? { heading: story.title, detail: story.coachingPoints[0] ?? story.overview } : captionAt(story, inPlay);
    paintFrame(ctx, drill, story, frame, caption, inPlay / duration, view);
  };

  draw(0);
  const stream = canvas.captureStream(FPS);
  const recorder = new MediaRecorder(stream, { mimeType: format.mime, videoBitsPerSecond: 4_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = event => {
    if (event.data && event.data.size > 0) chunks.push(event.data);
  };
  const stopped = new Promise<void>(resolve => {
    recorder.onstop = () => resolve();
  });

  recorder.start(250);
  const started = performance.now();
  let cancelled = false;
  await new Promise<void>(resolve => {
    const tick = () => {
      if (options.signal?.aborted) {
        cancelled = true;
        resolve();
        return;
      }
      const elapsed = (performance.now() - started) / 1000;
      draw(Math.min(elapsed, total));
      options.onProgress?.(Math.min(1, elapsed / total));
      if (elapsed >= total) resolve();
      else setTimeout(tick, 1000 / FPS);
    };
    tick();
  });
  recorder.stop();
  await stopped;
  stream.getTracks().forEach(track => track.stop());
  if (cancelled || chunks.length === 0) return null;

  const mime = format.mime.split(';')[0];
  return {
    blob: new Blob(chunks, { type: mime }),
    filename: `${safeName(drill.name)}${speed !== 1 ? '-slow' : ''}.${format.ext}`,
    mime,
  };
}

/**
 * The phone's share sheet with the file attached (save to Photos, send to
 * the team chat); a download on a computer.
 */
export async function shareOrDownloadVideo(result: VideoResult, title: string): Promise<'shared' | 'downloaded' | 'cancelled' | 'failed'> {
  const file = typeof File === 'function' ? new File([result.blob], result.filename, { type: result.mime }) : null;
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  if (coarse && file && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return 'shared';
    } catch (error) {
      if ((error as DOMException)?.name === 'AbortError') return 'cancelled';
    }
  }
  const { downloadBlob } = await import('@/ui/download');
  return downloadBlob(result.filename, result.blob) ? 'downloaded' : 'failed';
}

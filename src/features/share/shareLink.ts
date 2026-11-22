// ============================================================================
// SHARE BY LINK
//
// A play travels inside the link itself: the same export file the "Export
// play data" button writes, compressed and put after the `#` of the app URL.
// Nothing is uploaded - the part after `#` never leaves the phone that opens
// it - so a coach can text a play to a parent or post it in the team chat
// without an account or a server. Opening the link shows the usual import
// preview, and the play comes in as a copy.
// ============================================================================

import type { Drill } from '@/core/types';
import { migrateV2ToV3 } from '@/domain/v3/migrateV2ToV3';
import { buildExportPayload } from '@/persistence/exportService';

export const SHARE_PARAM = 'play';
/** Past this a link is too long for some chat apps and QR scanners. */
export const MAX_SHARE_URL_LENGTH = 12000;

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function pipeThrough(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const output = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(output).arrayBuffer());
}

const canCompress = () => typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';

/**
 * Text -> URL-safe code. "z" codes are deflated; "j" codes are plain UTF-8
 * for browsers without compression streams.
 */
export async function encodeShareCode(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  if (canCompress()) return 'z' + toBase64Url(await pipeThrough(bytes, new CompressionStream('deflate-raw')));
  return 'j' + toBase64Url(bytes);
}

export async function decodeShareCode(code: string): Promise<string | null> {
  try {
    const kind = code[0];
    const bytes = fromBase64Url(code.slice(1));
    if (kind === 'j') return new TextDecoder().decode(bytes);
    if (kind === 'z' && canCompress()) {
      return new TextDecoder().decode(await pipeThrough(bytes, new DecompressionStream('deflate-raw')));
    }
    return null;
  } catch {
    return null;
  }
}

/** The import file for one play, as compact JSON. */
export function sharePayloadJson(drill: Drill, now = Date.now()): string {
  return JSON.stringify(buildExportPayload([migrateV2ToV3(drill)], false, now));
}

export async function buildShareUrl(drill: Drill, base: string): Promise<string> {
  const url = new URL(base);
  url.hash = `${SHARE_PARAM}=${await encodeShareCode(sharePayloadJson(drill))}`;
  return url.toString();
}

/** The code in a `#play=...` hash, or null. */
export function shareCodeFromHash(hash: string): string | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const code = params.get(SHARE_PARAM);
  return code && /^[zj][A-Za-z0-9_-]+$/.test(code) ? code : null;
}

/**
 * Reads a shared play out of the current address and clears it from the
 * address bar, so a refresh does not offer the same import again.
 */
export async function takeSharedPlayFromLocation(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  const code = shareCodeFromHash(window.location.hash);
  if (!code) return null;
  try {
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  } catch {
    // Some embedded browsers refuse; the import still works.
  }
  return decodeShareCode(code);
}

export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed';

/**
 * The phone's own share sheet when there is one (Messages, WhatsApp, team
 * apps), otherwise the clipboard.
 */
export async function shareUrl(url: string, title: string): Promise<ShareOutcome> {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text: `${title} - open it in PHormation`, url });
      return 'shared';
    } catch (error) {
      if ((error as DOMException)?.name === 'AbortError') return 'cancelled';
      // Fall through to the clipboard.
    }
  }
  return (await copyText(url)) ? 'copied' : 'failed';
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

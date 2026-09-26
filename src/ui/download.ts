// ============================================================================
// DOWNLOAD
//
// Returns whether a file was actually produced, so the command layer can tell
// the difference between "exported" and "the browser refused". Nothing may
// report a successful export without this returning true.
// ============================================================================

export function downloadBlob(filename: string, blob: Blob): boolean {
  if (typeof document === 'undefined' || typeof URL?.createObjectURL !== 'function') {
    return false;
  }

  let url: string | null = null;
  try {
    url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.rel = 'noopener';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
    return true;
  } catch (error) {
    console.error('Download failed:', error);
    return false;
  } finally {
    if (url) setTimeout(() => URL.revokeObjectURL(url!), 0);
  }
}

export function downloadDataUrl(filename: string, dataUrl: string): boolean {
  if (typeof document === 'undefined') {
    return false;
  }

  try {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename;
    link.rel = 'noopener';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
    return true;
  } catch (error) {
    console.error('Download failed:', error);
    return false;
  }
}

export function downloadTextFile(filename: string, contents: string): boolean {
  return downloadBlob(filename, new Blob([contents], { type: 'application/json' }));
}

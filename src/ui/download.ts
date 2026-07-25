// ============================================================================
// DOWNLOAD
//
// Returns whether a file was actually produced, so the command layer can tell
// the difference between "exported" and "the browser refused". Nothing may
// report a successful export without this returning true.
// ============================================================================

export function downloadTextFile(filename: string, contents: string): boolean {
  if (typeof document === 'undefined' || typeof URL?.createObjectURL !== 'function') {
    return false;
  }

  let url: string | null = null;
  try {
    const blob = new Blob([contents], { type: 'application/json' });
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
    // Revoke on the next tick: revoking synchronously can cancel the download
    // in some browsers before it has read the blob.
    if (url) setTimeout(() => URL.revokeObjectURL(url!), 0);
  }
}

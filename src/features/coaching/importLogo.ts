/** Largest edge of a stored logo: crisp at centre ice, small enough to save with every play. */
const LOGO_EDGE = 256;
const MAX_DATA_URL = 400000;

/**
 * Read a team logo from a file: shrunk to fit 256px, transparency kept (PNG,
 * or WebP when the PNG would be too heavy), ready to store with the play.
 */
export async function importLogo(file: File): Promise<string> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    throw new Error('Choose a PNG, JPG or WebP logo.');
  }
  if (file.size > 5 * 1024 * 1024) throw new Error('Choose a logo smaller than 5 MB.');
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, LOGO_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Logo import is unavailable in this browser.');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    let image = canvas.toDataURL('image/png');
    if (image.length > MAX_DATA_URL) image = canvas.toDataURL('image/webp', 0.9);
    if (image.length > MAX_DATA_URL) throw new Error('This logo is too detailed. Try a simpler version.');
    return image;
  } finally {
    bitmap.close();
  }
}

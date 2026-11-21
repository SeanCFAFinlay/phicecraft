import { z } from 'zod';

const imageDataUrl = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

/** A team logo: a small PNG/WebP/JPEG data URL (resized on upload). */
export const logoSchema = z.string().max(400000).regex(imageDataUrl);

export const coachingSchema = z.object({
  teams: z.object({ home: z.string().max(80), away: z.string().max(80) }),
  objective: z.string().max(1000),
  cues: z.string().max(2000),
  referenceImage: z.string().max(1500000).regex(imageDataUrl).optional(),
  logos: z.object({ home: logoSchema.optional(), away: logoSchema.optional() }).optional(),
});

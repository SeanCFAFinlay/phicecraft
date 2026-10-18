import { z } from 'zod';

export const coachingSchema = z.object({
  teams: z.object({ home: z.string().max(80), away: z.string().max(80) }),
  objective: z.string().max(1000),
  cues: z.string().max(2000),
  referenceImage: z.string().max(1500000).regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/).optional(),
});

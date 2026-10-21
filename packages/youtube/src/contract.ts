// The JSON contract the Video IQ model must return (spec 4.3). Anything that
// fails this schema is a model error, never shown to an editor as a
// suggestion.
import { z } from "zod";

const title = z.object({ text: z.string().min(5).max(100), why: z.string().max(300) });

export const suggestionsSchema = z.object({
  format: z.enum(["SHORT", "VIDEO"]),
  summary_te: z.string().max(600),
  summary_en: z.string().max(400),
  titles: z.array(title).length(3),
  description: z.string().max(4500),
  tags: z.array(z.string().max(60)).min(5).max(30),
  hashtags: z.array(z.string().regex(/^#\S+$/)).max(5),
  chapters: z.array(z.object({ start: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/), title_te: z.string().max(80) })).max(12),
  pinned_comment: z.string().max(500).refine((s) => !/https?:\/\//i.test(s), "no URLs in comments"),
  playlists: z.array(z.string()).max(9),
  thumbnail: z.object({ headline_te: z.string().max(60), concept: z.string().max(300) }),
  entities: z.object({
    people: z.array(z.string()),
    places: z.array(z.string()),
    parties: z.array(z.string()),
    topics: z.array(z.string()),
  }),
  fit: z.object({
    district: z.string().nullable(),
    local_relevance: z.number().min(0).max(1),
    reused_content_risk: z.enum(["low", "medium", "high"]),
    verdict: z.enum(["fit", "borderline", "not_fit"]),
    reason_te: z.string().max(400),
  }),
  low_confidence: z.boolean(),
});

export type Suggestions = z.infer<typeof suggestionsSchema>;

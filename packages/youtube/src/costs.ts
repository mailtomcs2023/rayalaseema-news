// Documented quota costs, YouTube Data API v3 (units per call).
export const COSTS = {
  "videos.list": 1,
  "playlistItems.list": 1,
  "playlists.list": 1,
  "channels.list": 1,
  "captions.list": 50,
  "captions.download": 200,
  "captions.insert": 400,
  "videos.insert": 1600,
  "videos.update": 50,
  "thumbnails.set": 50,
  "playlistItems.insert": 50,
  "playlists.insert": 50,
  "commentThreads.insert": 50,
  "search.list": 100,
} as const;

export type CostLabel = keyof typeof COSTS;

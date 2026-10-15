// Shared "liveStatus -> human label" map for press-card row subtitles.
// Used by both the reporter and staff /profile pages so the two don't
// drift out of sync.
export const PRESS_CARD_STATUS_LABEL: Record<string, string> = {
  ACTIVE: "",
  EXPIRED: "expired",
  REVOKED: "revoked",
  SEPARATED: "former staff",
};

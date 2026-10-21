// Spec 12.1: a Short is vertical (width <= height) AND 180 seconds or less.
// Without dimensions fall back to the older 60 second rule.
export function classifyFormat(a: { durationSec: number; width?: number; height?: number }): "SHORT" | "VIDEO" {
  if (a.width && a.height) return a.width <= a.height && a.durationSec <= 180 ? "SHORT" : "VIDEO";
  return a.durationSec <= 60 ? "SHORT" : "VIDEO";
}
